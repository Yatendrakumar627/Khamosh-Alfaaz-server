import mongoose from "mongoose";
import Entry from "../models/Entry.js";
import { AppError } from "../utils/errors.js";

function sanitizeSearchText(text) {
  if (typeof text !== "string") return "";
  let clean = text.trim().slice(0, 200);
  const quoteCount = (clean.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    clean = clean.replace(/"/g, " ");
  }
  return clean.trim();
}

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
  if (type) {
    const cleanType = String(type).toLowerCase().trim();
    if (cleanType === 'diary') {
      filter.$or = [
        { type: 'diary' },
        { type: { $exists: false } },
        { type: null },
        { type: '' },
      ];
    } else {
      filter.type = cleanType;
    }
  }
  if (typeof favorite === "boolean") filter.isFavorite = favorite;
  if (typeof pinned === "boolean") filter.isPinned = pinned;
  if (from || to) {
    filter.entryDate = filter.entryDate || {};
    if (from) filter.entryDate.$gte = new Date(from);
    if (to) filter.entryDate.$lte = new Date(to);
  }
  if (date) {
    let y, m, d;
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date)) {
      [y, m, d] = date.split("T")[0].split("-").map(Number);
    } else {
      const dObj = new Date(date);
      if (!isNaN(dObj.getTime())) {
        y = dObj.getUTCFullYear();
        m = dObj.getUTCMonth() + 1;
        d = dObj.getUTCDate();
      }
    }
    if (y && m && d) {
      const utcStart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
      const utcEnd = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
      const localStart = new Date(y, m - 1, d, 0, 0, 0, 0);
      const localEnd = new Date(y, m - 1, d, 23, 59, 59, 999);

      const start = new Date(Math.min(utcStart.getTime(), localStart.getTime()));
      const end = new Date(Math.max(utcEnd.getTime(), localEnd.getTime()));

      filter.$or = [
        { entryDate: { $gte: start, $lte: end } },
        { entryDate: null, createdAt: { $gte: start, $lte: end } },
        { entryDate: { $exists: false }, createdAt: { $gte: start, $lte: end } },
      ];
    }
  }
  if (tags) {
    const tagList = String(tags).split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length) filter.tags = { $in: tagList };
  }

  let mongoQuery = Entry.find(filter);

  if (search && search.trim()) {
    const searchText = sanitizeSearchText(search);
    if (searchText) {
      mongoQuery = Entry.find({
        ...filter,
        $text: { $caseSensitive: false, $diacriticSensitive: false, $search: searchText },
      });
    }
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

  const curDate = entry.entryDate || entry.createdAt;

  const [prev, next] = await Promise.all([
    Entry.findOne({
      visitorId,
      $or: [
        { entryDate: { $lt: curDate } },
        { entryDate: curDate, _id: { $lt: entry._id } },
      ],
    })
      .sort({ entryDate: -1, _id: -1 })
      .select("_id title entryDate type")
      .lean(),
    Entry.findOne({
      visitorId,
      $or: [
        { entryDate: { $gt: curDate } },
        { entryDate: curDate, _id: { $gt: entry._id } },
      ],
    })
      .sort({ entryDate: 1, _id: 1 })
      .select("_id title entryDate type")
      .lean(),
  ]);

  return {
    ...entry,
    prevEntry: prev || null,
    nextEntry: next || null,
  };
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

export async function getEntriesForExport(visitorId, payload = {}) {
  const filter = { visitorId };

  let idList = [];
  if (Array.isArray(payload.entryIds)) {
    idList = payload.entryIds.map(String).map((s) => s.trim()).filter((id) => mongoose.Types.ObjectId.isValid(id));
  } else if (typeof payload.entryIds === "string" && payload.entryIds.trim()) {
    idList = payload.entryIds.split(",").map((s) => s.trim()).filter((id) => mongoose.Types.ObjectId.isValid(id));
  }

  if (idList.length > 0) {
    filter._id = { $in: idList };
  } else {
    const now = new Date();
    if (payload.scope === "month") {
      const year = now.getFullYear();
      const month = now.getMonth();
      const start = new Date(year, month, 1, 0, 0, 0, 0);
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
      filter.entryDate = { $gte: start, $lte: end };
    } else if (payload.scope === "year") {
      const year = now.getFullYear();
      const start = new Date(year, 0, 1, 0, 0, 0, 0);
      const end = new Date(year, 11, 31, 23, 59, 59, 999);
      filter.entryDate = { $gte: start, $lte: end };
    } else if (
      payload.scope === "custom" ||
      payload.startDate ||
      payload.endDate ||
      payload.from ||
      payload.to
    ) {
      const startVal = payload.startDate || payload.from;
      const endVal = payload.endDate || payload.to;
      const dateFilter = {};
      if (startVal) {
        const s = new Date(startVal);
        if (!isNaN(s.getTime())) {
          s.setHours(0, 0, 0, 0);
          dateFilter.$gte = s;
        }
      }
      if (endVal) {
        const e = new Date(endVal);
        if (!isNaN(e.getTime())) {
          e.setHours(23, 59, 59, 999);
          dateFilter.$lte = e;
        }
      }
      if (Object.keys(dateFilter).length > 0) {
        filter.entryDate = dateFilter;
      }
    }
  }

  if (payload.type) {
    const cleanType = String(payload.type).toLowerCase().trim();
    if (cleanType === "diary") {
      filter.$or = [
        { type: "diary" },
        { type: { $exists: false } },
        { type: null },
        { type: "" },
      ];
    } else {
      filter.type = cleanType;
    }
  }

  if (payload.favorite === true || payload.favorite === "true") {
    filter.isFavorite = true;
  }
  if (payload.pinned === true || payload.pinned === "true") {
    filter.isPinned = true;
  }
  if (payload.tags) {
    const tagList = String(payload.tags).split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length) filter.tags = { $in: tagList };
  }

  const isOldestFirst =
    String(payload.sortOrder || payload.sort || "").toLowerCase() === "oldest" ||
    String(payload.sortOrder || payload.sort || "").toLowerCase() === "asc";

  const sortCriteria = isOldestFirst
    ? { entryDate: 1, createdAt: 1 }
    : { entryDate: -1, createdAt: -1 };

  // Cap at 1000 items to protect memory and event loop during document conversion
  const entries = await Entry.find(filter)
    .sort(sortCriteria)
    .limit(1000)
    .lean();

  return entries;
}