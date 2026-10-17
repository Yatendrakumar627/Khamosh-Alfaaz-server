import Visitor from "../models/Visitor.js";
import Session from "../models/Session.js";
import { generateSessionId, hashToken, verifyPin } from "../utils/crypto.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

const COOKIE_NAME = "dhsid";

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: env.nodeEnv === "production" ? "none" : "lax",
    path: "/",
    maxAge: env.sessionMaxAgeMs,
  };
}

export function getSessionToken(req) {
  if (req.cookies?.[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const auth = req.headers?.authorization;
  if (auth && typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const customHeader = req.headers?.["x-session-token"];
  if (customHeader && typeof customHeader === "string") {
    return customHeader.trim();
  }
  return null;
}

export async function createSession(visitorId, res) {
  const rawToken = generateSessionId();
  const hashed = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + env.sessionMaxAgeMs);

  await Session.create({
    visitorId,
    sessionId: hashed,
    expiresAt,
  });

  await Visitor.updateOne({ _id: visitorId }, { $set: { lastActiveAt: new Date() } });

  res.cookie(COOKIE_NAME, rawToken, cookieOptions());
  return { visitorId, token: rawToken, expiresAt };
}

export async function destroySession(req, res) {
  const token = getSessionToken(req);
  if (token) {
    await deleteSessionToken(token);
  }
  const { maxAge, ...clearOptions } = cookieOptions();
  res.clearCookie(COOKIE_NAME, clearOptions);
}

export async function findSession(token) {
  if (!token || typeof token !== "string") return null;
  const now = new Date();
  const session = await Session.findOne({
    sessionId: hashToken(token),
    expiresAt: { $gt: now },
  }).populate({
    path: "visitorId",
    select: "name username pinHash lastActiveAt",
  });

  if (!session) return null;

  return session;
}

export async function getOptionalSession(req) {
  return findSession(getSessionToken(req));
}

export async function deleteSessionToken(token) {
  if (token && typeof token === "string") {
    await Session.deleteOne({ sessionId: hashToken(token) });
  }
}

export async function requireSession(req, res, next) {
  const session = await getOptionalSession(req);
  if (!session?.visitorId) {
    return next(new AppError("Session expired or invalid", 401));
  }

  if (!session.visitorId.username || !session.visitorId.pinHash) {
    return next(new AppError("Credentials required", 401));
  }

  // Update lastActiveAt and slide session expiration periodically if > 5 minutes have elapsed
  const now = Date.now();
  const lastActive = session.visitorId.lastActiveAt ? new Date(session.visitorId.lastActiveAt).getTime() : 0;
  if (now - lastActive > 5 * 60 * 1000) {
    Visitor.updateOne({ _id: session.visitorId._id }, { $set: { lastActiveAt: new Date(now) } }).catch(() => {});
    const newExpiresAt = new Date(now + env.sessionMaxAgeMs);
    Session.updateOne({ _id: session._id }, { $set: { expiresAt: newExpiresAt } }).catch(() => {});
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      res.cookie(COOKIE_NAME, token, cookieOptions());
    }
  }

  req.visitor = session.visitorId;
  req.session = session;
  next();
}

export async function requirePin(req, res, next) {
  const pin = req.validated?.pin ?? req.body?.pin;
  if (!req.visitor?.pinHash || !verifyPin(pin, req.visitor.pinHash)) {
    return next(new AppError("PIN is incorrect", 401));
  }
  next();
}

export async function updateSessionName(visitorId, name) {
  return Visitor.updateOne({ _id: visitorId }, { $set: { name, lastActiveAt: new Date() } });
}

export { COOKIE_NAME };