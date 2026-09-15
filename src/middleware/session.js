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
  return { visitorId, expiresAt };
}

export async function destroySession(req, res) {
  await deleteSessionToken(req.cookies?.[COOKIE_NAME]);
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export async function findSession(token) {
  if (!token) return null;
  return Session.findOne({
    sessionId: hashToken(token),
    expiresAt: { $gt: new Date() },
  }).populate({
    path: "visitorId",
    select: "name username pinHash lastActiveAt",
  });
}

export async function getOptionalSession(req) {
  return findSession(req.cookies?.[COOKIE_NAME]);
}

export async function deleteSessionToken(token) {
  if (token) {
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