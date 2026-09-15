import * as sessionService from "../services/sessionService.js";
import { COOKIE_NAME, createSession, deleteSessionToken, destroySession, getOptionalSession } from "../middleware/session.js";

function responseVisitor(visitor) {
  return {
    id: visitor.id.toString(),
    name: visitor.name,
    hasCredentials: visitor.hasCredentials,
    lastActiveAt: visitor.lastActiveAt,
  };
}

async function startSession(req, res, result) {
  await createSession(result.visitor._id, res);
  const visitor = responseVisitor(await sessionService.getSession(result.visitor._id));
  return res.status(result.created ? 201 : 200).json({
    ok: true,
    visitor,
    session: visitor,
    name: visitor.name,
    created: result.created,
  });
}

export async function registerSessionHandler(req, res, next) {
  try {
    const legacySession = await getOptionalSession(req);
    const canClaimLegacyVisitor = legacySession?.visitorId &&
      !legacySession.visitorId.username &&
      !legacySession.visitorId.pinHash;
    const result = await sessionService.registerVisitor({
      ...req.validated,
      claimVisitorId: canClaimLegacyVisitor ? legacySession.visitorId._id : null,
    });

    if (canClaimLegacyVisitor) {
      await deleteSessionToken(req.cookies?.[COOKIE_NAME]);
    }
    await startSession(req, res, result);
  } catch (err) {
    next(err);
  }
}

export async function usernameAvailabilityHandler(req, res, next) {
  try {
    const available = await sessionService.isUsernameAvailable(req.validated.username);
    res.json({ ok: true, available });
  } catch (err) {
    next(err);
  }
}

export async function loginSessionHandler(req, res, next) {
  try {
    const result = await sessionService.authenticateVisitor(req.validated);
    await startSession(req, res, result);
  } catch (err) {
    next(err);
  }
}

export const createSessionHandler = registerSessionHandler;

export async function getSessionHandler(req, res, next) {
  try {
    const visitor = responseVisitor(await sessionService.getSession(req.visitor._id));
    res.json({
      ok: true,
      visitor,
      session: visitor,
      name: visitor.name,
    });
  } catch (err) {
    next(err);
  }
}

export async function patchSessionHandler(req, res, next) {
  try {
    const updated = await sessionService.updateName(req.visitor._id, req.body.name);
    const visitor = {
      id: updated.id.toString(),
      name: updated.name,
      hasCredentials: true,
      lastActiveAt: updated.lastActiveAt,
    };
    res.json({
      ok: true,
      visitor,
      session: visitor,
      name: updated.name,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteSessionHandler(req, res, next) {
  try {
    await destroySession(req, res);
    res.json({ ok: true, loggedOut: true });
  } catch (err) {
    next(err);
  }
}
