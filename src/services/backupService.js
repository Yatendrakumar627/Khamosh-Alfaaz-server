import Entry from "../models/Entry.js";
import Category from "../models/Category.js";
import Visitor from "../models/Visitor.js";
import { AppError } from "../utils/errors.js";

export async function exportBackup(visitorId) {
  const [entries, categories, visitor] = await Promise.all([
    Entry.find({ visitorId }).lean(),
    Category.find({ visitorId }).lean(),
    Visitor.findById(visitorId).lean(),
  ]);

  return {
    ok: true,
    version: "1.0",
    exportedAt: new Date().toISOString(),
    visitor: visitor ? { name: visitor.name } : null,
    entries: entries.map((e) => ({
      title: e.title,
      content: e.content,
      type: e.type,
      tags: e.tags,
      entryDate: e.entryDate,
      isFavorite: e.isFavorite,
      isPinned: e.isPinned,
      visibility: e.visibility,
    })),
    categories: categories.map((c) => ({ name: c.name })),
  };
}

export async function restoreBackup(visitorId, payload, { wipeFirst = true } = {}) {
  if (!payload || !Array.isArray(payload.entries)) {
    throw new AppError("Invalid backup payload", 400);
  }

  const safeEntries = payload.entries.slice(0, 10000);
  const normalizedEntries = safeEntries.map((e) => {
    const rawDate = e.entryDate ? new Date(e.entryDate) : new Date();
    const validDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;
    return {
      visitorId,
      title: String(e.title || "Untitled Entry").slice(0, 200),
      content: String(e.content || "").slice(0, 100000),
      type: ["diary", "thought", "quote", "idea", "note", "personal", "gratitude", "other"].includes(e.type) ? e.type : "diary",
      tags: Array.isArray(e.tags) ? e.tags.map(String).slice(0, 20).map((t) => t.slice(0, 50)) : [],
      entryDate: validDate,
      isFavorite: Boolean(e.isFavorite),
      isPinned: Boolean(e.isPinned),
      visibility: ["private", "public"].includes(e.visibility) ? e.visibility : "private",
    };
  });

  const normalizedCategories = [];
  if (Array.isArray(payload.categories)) {
    const seen = new Set();
    const safeCategories = payload.categories.slice(0, 200);
    for (const c of safeCategories) {
      const name = String(c?.name || "").trim().slice(0, 60);
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        normalizedCategories.push({ visitorId, name });
      }
    }
  }

  // If wiping first, ensure wipe completes completely BEFORE initiating any insertions
  if (wipeFirst) {
    await Promise.all([
      Entry.deleteMany({ visitorId }),
      Category.deleteMany({ visitorId }),
    ]);
  }

  const ops = [];
  if (normalizedEntries.length) {
    ops.push(Entry.insertMany(normalizedEntries, { ordered: false }));
  }
  if (normalizedCategories.length) {
    ops.push(Category.insertMany(normalizedCategories, { ordered: false }));
  }
  if (payload.visitor?.name) {
    ops.push(Visitor.updateOne({ _id: visitorId }, { $set: { name: String(payload.visitor.name).slice(0, 100), lastActiveAt: new Date() } }));
  }

  if (ops.length) {
    await Promise.all(ops);
  }

  return { restored: true, entries: normalizedEntries.length, categories: normalizedCategories.length };
}

export async function deleteAll(visitorId) {
  await Promise.all([
    Entry.deleteMany({ visitorId }),
    Category.deleteMany({ visitorId }),
  ]);
  return { deleted: true };
}

export async function resetVisitor(visitorId) {
  const result = await deleteAll(visitorId);
  return result;
}