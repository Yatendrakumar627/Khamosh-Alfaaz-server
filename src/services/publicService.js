import Entry from "../models/Entry.js";
import { AppError } from "../utils/errors.js";
import { cache } from "../utils/cache.js";

export function invalidatePublicCache() {
  cache.invalidatePrefix("public:");
}

const publicProjection = {
  visitorId: 0,
  isFavorite: 0,
  isPinned: 0,
  createdAt: 0,
  updatedAt: 0,
  __v: 0,
};

const SORT_MAP = {
  newest: "-entryDate",
  oldest: "entryDate",
  recentlyUpdated: "-updatedAt",
  az: "title",
  "-createdAt": "-createdAt",
  createdAt: "createdAt",
};

function sanitizeSearchText(text) {
  if (typeof text !== "string") return "";
  let clean = text.trim().slice(0, 200);
  const quoteCount = (clean.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    clean = clean.replace(/"/g, " ");
  }
  return clean.trim();
}

export async function listPublicEntries(query = {}) {
  const cacheKey = `public:entries:${JSON.stringify(query)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const {
    page = 1,
    limit = 20,
    sort = "newest",
    type,
    tags,
    search,
  } = query;

  const filter = { visibility: "public" };
  if (type) filter.type = type;
  if (tags) {
    const tagList = String(tags).split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length) filter.tags = { $all: tagList };
  }

  let mongoQuery;
  const searchText = sanitizeSearchText(search);
  if (searchText) {
    mongoQuery = Entry.find({
      ...filter,
      $text: { $caseSensitive: false, $diacriticSensitive: false, $search: searchText },
    });
  } else {
    mongoQuery = Entry.find(filter);
  }

  const sortKey = SORT_MAP[sort] || "-entryDate";
  const [total, entries] = await Promise.all([
    Entry.countDocuments(mongoQuery.getFilter()),
    mongoQuery
      .sort(sortKey)
      .skip((page - 1) * limit)
      .limit(limit)
      .select(publicProjection)
      .lean(),
  ]);

  const result = {
    entries,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / limit) || 1,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };

  cache.set(cacheKey, result, 60);
  return result;
}

export async function getPublicEntry(id) {
  const cacheKey = `public:entry:${id}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const entry = await Entry.findOne({ _id: id, visibility: "public" })
    .select(publicProjection)
    .lean();
  if (!entry) throw new AppError("Entry not found", 404);

  const curDate = entry.entryDate || entry.createdAt || new Date();

  const [prev, next] = await Promise.all([
    Entry.findOne({
      visibility: "public",
      $or: [
        { entryDate: { $lt: curDate } },
        { entryDate: curDate, _id: { $lt: entry._id } },
      ],
    })
      .sort({ entryDate: -1, _id: -1 })
      .select("_id title entryDate type")
      .lean(),
    Entry.findOne({
      visibility: "public",
      $or: [
        { entryDate: { $gt: curDate } },
        { entryDate: curDate, _id: { $gt: entry._id } },
      ],
    })
      .sort({ entryDate: 1, _id: 1 })
      .select("_id title entryDate type")
      .lean(),
  ]);

  const result = {
    ...entry,
    prevEntry: prev || null,
    nextEntry: next || null,
  };
  cache.set(cacheKey, result, 60);
  return result;
}

export async function publicQuotes(limit = 30) {
  const safeLimit = Math.min(Number(limit) || 30, 100);
  const cacheKey = `public:quotes:${safeLimit}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const entries = await Entry.find({ visibility: "public", type: "quote" })
    .sort({ entryDate: -1 })
    .limit(safeLimit)
    .select(publicProjection)
    .lean();
  const result = { entries };
  cache.set(cacheKey, result, 60);
  return result;
}

export async function publicCategories() {
  const cacheKey = "public:categories";
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const groups = await Entry.aggregate([
    { $match: { visibility: "public" } },
    { $group: { _id: "$type", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);
  const categories = groups.map((g) => ({ type: g._id, count: g.count }));
  const result = { categories };
  cache.set(cacheKey, result, 60);
  return result;
}