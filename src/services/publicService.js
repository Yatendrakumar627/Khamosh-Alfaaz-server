import Entry from "../models/Entry.js";
import { AppError } from "../utils/errors.js";

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

export async function listPublicEntries(query = {}) {
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
  if (search && search.trim()) {
    const searchText = search.trim();
    mongoQuery = Entry.find({
      ...filter,
      $text: { $caseSensitive: false, $diacriticSensitive: false, $search: searchText },
    });
  } else {
    mongoQuery = Entry.find(filter);
  }

  const sortKey = SORT_MAP[sort] || "-entryDate";
  const total = await Entry.countDocuments(mongoQuery.getFilter());
  const entries = await mongoQuery
    .sort(sortKey)
    .skip((page - 1) * limit)
    .limit(limit)
    .select(publicProjection)
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

export async function getPublicEntry(id) {
  const entry = await Entry.findOne({ _id: id, visibility: "public" })
    .select(publicProjection)
    .lean();
  if (!entry) throw new AppError("Entry not found", 404);
  return entry;
}

export async function publicQuotes(limit = 30) {
  const entries = await Entry.find({ visibility: "public", type: "quote" })
    .sort({ entryDate: -1 })
    .limit(Math.min(Number(limit) || 30, 100))
    .select(publicProjection)
    .lean();
  return { entries };
}

export async function publicCategories() {
  const groups = await Entry.aggregate([
    { $match: { visibility: "public" } },
    { $group: { _id: "$type", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);
  const categories = groups.map((g) => ({ type: g._id, count: g.count }));
  return { categories };
}