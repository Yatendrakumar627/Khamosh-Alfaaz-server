import Entry from "../models/Entry.js";
import { AppError } from "../utils/errors.js";

const SORT_MAP = {
  createdAt: "createdAt",
  "-createdAt": "-createdAt",
  updatedAt: "updatedAt",
  "-updatedAt": "-updatedAt",
  title: "title",
  "-title": "-title",
  entryDate: "entryDate",
  "-entryDate": "-entryDate",
  newest: "-entryDate",
  oldest: "entryDate",
  recentlyUpdated: "-updatedAt",
  az: "title",
};

export async function listEntries(visitorId, query) {
  const {
    page = 1,
    limit = 20,
    sort = "-createdAt",
    type,
    search,
    favorite,
    pinned,
    tags,
    from,
    to,
    date,
  } = query;

  const filter = { visitorId };
  if (type) filter.type = type;
  if (typeof favorite === "boolean") filter.isFavorite = favorite;
  if (typeof pinned === "boolean") filter.isPinned = pinned;
  if (from || to || date) {
    filter.entryDate = {};
    if (from) filter.entryDate.$gte = new Date(from);
    if (to) filter.entryDate.$lte = new Date(to);
    if (date) {
      const start = new Date(date);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      filter.entryDate.$gte = start;
      filter.entryDate.$lte = end;
    }
  }
  if (tags) {
    const tagList = String(tags).split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length) filter.tags = { $in: tagList };
  }

  let mongoQuery = Entry.find(filter);

  if (search && search.trim()) {
    const searchText = search.trim();
    mongoQuery = Entry.find({
      ...filter,
      $text: { $caseSensitive: false, $diacriticSensitive: false, $search: searchText },
    });
  }

  const sortKey = SORT_MAP[sort] || "-createdAt";
  const total = await Entry.countDocuments(mongoQuery.getFilter());
  const entries = await mongoQuery
    .sort(sortKey)
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return {
    entries,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / limit) || 1,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getEntry(visitorId, id) {
  const entry = await Entry.findOne({ _id: id, visitorId }).lean();
  if (!entry) throw new AppError("Entry not found", 404);
  return entry;
}

export async function createEntry(visitorId, data) {
  const entry = await Entry.create({
    visitorId,
    title: data.title,
    content: data.content,
    type: data.type || "diary",
    tags: Array.isArray(data.tags) ? data.tags : [],
    entryDate: data.entryDate || new Date(),
    visibility: data.visibility || "private",
  });
  return entry.toObject();
}

export async function updateEntry(visitorId, id, data) {
  const entry = await Entry.findOneAndUpdate(
    { _id: id, visitorId },
    { $set: data },
    { new: true, runValidators: true },
  ).lean();
  if (!entry) throw new AppError("Entry not found", 404);
  return entry;
}

export async function deleteEntry(visitorId, id) {
  const result = await Entry.deleteOne({ _id: id, visitorId });
  if (result.deletedCount === 0) throw new AppError("Entry not found", 404);
  return { deleted: true };
}

export async function toggleFavorite(visitorId, id, value) {
  const entry = await Entry.findOneAndUpdate(
    { _id: id, visitorId },
    { $set: { isFavorite: value } },
    { new: true },
  ).lean();
  if (!entry) throw new AppError("Entry not found", 404);
  return entry;
}

export async function togglePinned(visitorId, id, value) {
  const entry = await Entry.findOneAndUpdate(
    { _id: id, visitorId },
    { $set: { isPinned: value } },
    { new: true },
  ).lean();
  if (!entry) throw new AppError("Entry not found", 404);
  return entry;
}

export async function calendarEntries(visitorId, month) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new AppError("month query must be YYYY-MM", 400);
  }
  const [year, m] = String(month).split("-").map(Number);
  const start = new Date(year, m - 1, 1);
  const end = new Date(year, m, 0, 23, 59, 59, 999);
  const entries = await Entry.find({ visitorId, entryDate: { $gte: start, $lte: end } })
    .sort({ entryDate: 1 })
    .lean();
  const byDay = {};
  for (const e of entries) {
    const day = new Date(e.entryDate).getDate();
    byDay[day] = (byDay[day] || 0) + 1;
  }
  return { month, year, byDay, entries };
}

export async function onThisDay(visitorId) {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();
  const entries = await Entry.find({ visitorId }).sort({ entryDate: -1 }).lean();
  const memories = entries.filter((entry) => {
    const entryDate = new Date(entry.entryDate);
    return entryDate.getMonth() === currentMonth &&
      entryDate.getDate() === currentDay &&
      entryDate.getFullYear() < today.getFullYear();
  });
  return { entries: memories };
}