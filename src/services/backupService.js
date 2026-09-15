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

  const normalizedEntries = payload.entries.map((e) => ({
    visitorId,
    title: e.title || "Untitled Entry",
    content: String(e.content),
    type: ["diary", "thought", "quote", "idea", "note", "personal", "gratitude", "other"].includes(e.type) ? e.type : "diary",
    tags: Array.isArray(e.tags) ? e.tags : [],
    entryDate: e.entryDate ? new Date(e.entryDate) : new Date(),
    isFavorite: Boolean(e.isFavorite),
    isPinned: Boolean(e.isPinned),
    visibility: ["private", "public"].includes(e.visibility) ? e.visibility : "private",
  }));

  const normalizedCategories = [];
  if (Array.isArray(payload.categories)) {
    const seen = new Set();
    for (const c of payload.categories) {
      const name = String(c.name).trim().slice(0, 60);
      if (name && !seen.has(name)) {
        seen.add(name);
        normalizedCategories.push({ visitorId, name });
      }
    }
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

  if (wipeFirst) {
    await Promise.all([
      Entry.deleteMany({ visitorId }),
      Category.deleteMany({ visitorId }),
    ]);
  }

  if (ops.length) await Promise.all(ops);
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