import mongoose from "mongoose";
import * as entryService from "../services/entryService.js";
import * as exportService from "../services/exportService.js";
import Visitor from "../models/Visitor.js";
import { entryCreateSchema, entryUpdateSchema, listQuerySchema, exportSelectionSchema } from "../validators/schemas.js";
import { AppError } from "../utils/errors.js";

function validateObjectId(id) {
  if (!id || typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid identifier", 400);
  }
  return id;
}

function sanitize(name) {
  return String(name || "entry").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "entry";
}

export async function listEntriesHandler(req, res, next) {
  try {
    const query = listQuerySchema.parse(req.query);
    const result = await entryService.listEntries(req.visitor._id, query);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getEntryHandler(req, res, next) {
  try {
    const id = validateObjectId(req.params.id);
    const entry = await entryService.getEntry(req.visitor._id, id);
    res.json({ ok: true, entry });
  } catch (err) {
    next(err);
  }
}

export async function createEntryHandler(req, res, next) {
  try {
    const data = entryCreateSchema.parse(req.body);
    const entry = await entryService.createEntry(req.visitor._id, data);
    res.status(201).json({ ok: true, entry });
  } catch (err) {
    next(err);
  }
}

export async function updateEntryHandler(req, res, next) {
  try {
    const id = validateObjectId(req.params.id);
    const data = entryUpdateSchema.parse(req.body);
    const entry = await entryService.updateEntry(req.visitor._id, id, data);
    res.json({ ok: true, entry });
  } catch (err) {
    next(err);
  }
}

export async function deleteEntryHandler(req, res, next) {
  try {
    const id = validateObjectId(req.params.id);
    await entryService.deleteEntry(req.visitor._id, id);
    res.json({ ok: true, deleted: true });
  } catch (err) {
    next(err);
  }
}

export async function favoriteHandler(req, res, next) {
  try {
    const id = validateObjectId(req.params.id);
    const value = Boolean(req.body.isFavorite);
    const entry = await entryService.toggleFavorite(req.visitor._id, id, value);
    res.json({ ok: true, entry });
  } catch (err) {
    next(err);
  }
}

export async function pinHandler(req, res, next) {
  try {
    const id = validateObjectId(req.params.id);
    const value = Boolean(req.body.isPinned);
    const entry = await entryService.togglePinned(req.visitor._id, id, value);
    res.json({ ok: true, entry });
  } catch (err) {
    next(err);
  }
}

export async function searchHandler(req, res, next) {
  try {
    const query = listQuerySchema.parse({ ...req.query, search: req.query.q });
    const result = await entryService.listEntries(req.visitor._id, query);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function calendarHandler(req, res, next) {
  try {
    const month = String(req.query.month || "");
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return next(new AppError("month query must be YYYY-MM", 400));
    }
    const result = await entryService.calendarEntries(req.visitor._id, month);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function onThisDayHandler(req, res, next) {
  try {
    const result = await entryService.onThisDay(req.visitor._id);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getVisitorName(visitorId) {
  const visitor = await Visitor.findById(visitorId).lean();
  return visitor?.name || "Anonymous Writer";
}

export async function exportEntryDocxHandler(req, res, next) {
  try {
    const id = validateObjectId(req.params.id);
    const entry = await entryService.getEntry(req.visitor._id, id);
    const visitorName = await getVisitorName(req.visitor._id);
    const buffer = await exportService.buildDocxBuffer({
      title: entry.title,
      entries: [entry],
      visitorName,
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${sanitize(entry.title)}.docx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function exportEntryPdfHandler(req, res, next) {
  try {
    const id = validateObjectId(req.params.id);
    const entry = await entryService.getEntry(req.visitor._id, id);
    const visitorName = await getVisitorName(req.visitor._id);
    const buffer = await exportService.buildPdfBuffer({
      title: entry.title,
      entries: [entry],
      visitorName,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${sanitize(entry.title)}.pdf"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function exportEntryTxtHandler(req, res, next) {
  try {
    const id = validateObjectId(req.params.id);
    const entry = await entryService.getEntry(req.visitor._id, id);
    const visitorName = await getVisitorName(req.visitor._id);
    const buffer = exportService.buildTxtBuffer({
      entries: [entry],
      visitorName,
    });
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${sanitize(entry.title)}.txt"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function exportEntryMdHandler(req, res, next) {
  try {
    const id = validateObjectId(req.params.id);
    const entry = await entryService.getEntry(req.visitor._id, id);
    const visitorName = await getVisitorName(req.visitor._id);
    const buffer = exportService.buildMdBuffer({
      entries: [entry],
      visitorName,
    });
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${sanitize(entry.title)}.md"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function exportBulkDocxHandler(req, res, next) {
  try {
    const payload = exportSelectionSchema.parse({ ...req.query, ...req.body });
    const sortOrder = payload.sortOrder || payload.sort || "newest";
    const entries = await entryService.getEntriesForExport(req.visitor._id, payload);
    const visitorName = await getVisitorName(req.visitor._id);
    const dateStr = new Date().toISOString().split("T")[0];
    const buffer = await exportService.buildDocxBuffer({
      title: "My Diary",
      entries,
      visitorName,
      sortOrder,
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="khamosh-alfaaz-diary-${dateStr}.docx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function exportBulkPdfHandler(req, res, next) {
  try {
    const payload = exportSelectionSchema.parse({ ...req.query, ...req.body });
    const sortOrder = payload.sortOrder || payload.sort || "newest";
    const entries = await entryService.getEntriesForExport(req.visitor._id, payload);
    const visitorName = await getVisitorName(req.visitor._id);
    const dateStr = new Date().toISOString().split("T")[0];
    const buffer = await exportService.buildPdfBuffer({
      title: "My Diary",
      entries,
      visitorName,
      sortOrder,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="khamosh-alfaaz-diary-${dateStr}.pdf"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function exportBulkTxtHandler(req, res, next) {
  try {
    const payload = exportSelectionSchema.parse({ ...req.query, ...req.body });
    const sortOrder = payload.sortOrder || payload.sort || "newest";
    const entries = await entryService.getEntriesForExport(req.visitor._id, payload);
    const visitorName = await getVisitorName(req.visitor._id);
    const dateStr = new Date().toISOString().split("T")[0];
    const buffer = exportService.buildTxtBuffer({
      entries,
      visitorName,
      sortOrder,
    });
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="khamosh-alfaaz-diary-${dateStr}.txt"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function exportBulkMdHandler(req, res, next) {
  try {
    const payload = exportSelectionSchema.parse({ ...req.query, ...req.body });
    const sortOrder = payload.sortOrder || payload.sort || "newest";
    const entries = await entryService.getEntriesForExport(req.visitor._id, payload);
    const visitorName = await getVisitorName(req.visitor._id);
    const dateStr = new Date().toISOString().split("T")[0];
    const buffer = exportService.buildMdBuffer({
      entries,
      visitorName,
      sortOrder,
    });
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="khamosh-alfaaz-diary-${dateStr}.md"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}