import Visitor from "../models/Visitor.js";
import Entry from "../models/Entry.js";
import { hashPin, verifyPin } from "../utils/crypto.js";
import { AppError } from "../utils/errors.js";

export async function getSession(visitorId) {
  const visitor = await Visitor.findById(visitorId).select("+pinHash").lean();
  if (!visitor) throw new AppError("Visitor not found", 404);
  return {
    id: visitor._id,
    name: visitor.name,
    hasCredentials: Boolean(visitor.username && visitor.pinHash),
    lastActiveAt: visitor.lastActiveAt,
  };
}

export async function registerVisitor({ name, username, pin, claimVisitorId }) {
  const normalizedUsername = username.trim().toLowerCase();

  if (claimVisitorId) {
    try {
      const visitor = await Visitor.findOneAndUpdate(
        { _id: claimVisitorId, username: { $exists: false }, pinHash: { $exists: false } },
        { $set: { name, username: normalizedUsername, pinHash: hashPin(pin), lastActiveAt: new Date() } },
        { new: true },
      ).select("+pinHash");

      if (!visitor) {
        const existing = await Visitor.findById(claimVisitorId).select("+pinHash");
        if (existing?.username && existing?.pinHash) {
          throw new AppError("This session is already registered", 409);
        }
        throw new AppError("Existing diary cannot be claimed", 409);
      }
      return { visitor, created: false };
    } catch (err) {
      if (err?.code === 11000) throw new AppError("Username already taken", 409);
      if (err instanceof AppError) throw err;
      throw err;
    }
  }

  const existing = await Visitor.findOne({ username: normalizedUsername });
  if (existing) throw new AppError("Username already taken", 409);

  try {
    const visitor = await Visitor.create({
      name,
      username: normalizedUsername,
      pinHash: hashPin(pin),
      lastActiveAt: new Date(),
    });
    return { visitor, created: true };
  } catch (err) {
    if (err?.code === 11000) throw new AppError("Username already taken", 409);
    throw err;
  }
}

export async function authenticateVisitor({ username, pin }) {
  const visitor = await Visitor.findOne({ username: username.trim().toLowerCase() }).select("+pinHash");
  if (!visitor || !verifyPin(pin, visitor.pinHash)) {
    throw new AppError("Invalid username or PIN", 401);
  }
  return { visitor, created: false };
}

export async function isUsernameAvailable(username) {
  const existing = await Visitor.exists({ username: username.trim().toLowerCase() });
  return !existing;
}

export async function updateName(visitorId, name) {
  const visitor = await Visitor.findOneAndUpdate(
    { _id: visitorId },
    { $set: { name, lastActiveAt: new Date() } },
    { new: true },
  ).lean();
  if (!visitor) throw new AppError("Visitor not found", 404);
  return { id: visitor._id, name: visitor.name, lastActiveAt: visitor.lastActiveAt };
}

export async function getStatistics(visitorId) {
  const [total, visibilityBreakdown, byType, favorites, pinned, oldest, newest] = await Promise.all([
    Entry.countDocuments({ visitorId }),
    Entry.aggregate([
      { $match: { visitorId } },
      { $group: { _id: { $ifNull: ["$visibility", "private"] }, count: { $sum: 1 } } },
    ]),
    Entry.aggregate([
      { $match: { visitorId } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]),
    Entry.countDocuments({ visitorId, isFavorite: true }),
    Entry.countDocuments({ visitorId, isPinned: true }),
    Entry.findOne({ visitorId }).sort({ entryDate: 1 }).lean(),
    Entry.findOne({ visitorId }).sort({ entryDate: -1 }).lean(),
  ]);

  const visibilityCounts = Object.fromEntries(
    visibilityBreakdown.map(({ _id: visibility, count }) => [visibility, count]),
  );
  const publicEntries = visibilityCounts.public || 0;

  const byDay = await Entry.aggregate([
    { $match: { visitorId } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$entryDate" } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  let longestStreak = 0;
  let currentStreak = 0;
  let activeStreak = 0;
  let lastDate = null;
  const days = new Set(byDay.map((d) => d._id));
  const sorted = [...days].sort();
  const todayKey = new Date().toISOString().slice(0, 10);
  const yesterdayKey = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  for (const d of sorted) {
    if (lastDate) {
      const prev = new Date(lastDate);
      const cur = new Date(d);
      const diff = (cur - prev) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        activeStreak += 1;
      } else {
        activeStreak = 1;
      }
    } else {
      activeStreak = 1;
    }
    longestStreak = Math.max(longestStreak, activeStreak);
    if (d === todayKey || d === yesterdayKey) currentStreak = activeStreak;
    lastDate = d;
  }

  return {
    totalEntries: total,
    publicEntries,
    privateEntries: total - publicEntries,
    favorites,
    pinned,
    byType: byType.map((t) => ({ type: t._id, count: t.count })),
    byDay: byDay.map((d) => ({ date: d._id, count: d.count })),
    firstEntry: oldest ? oldest.entryDate : null,
    lastEntry: newest ? newest.entryDate : null,
    longestStreak,
  };
}