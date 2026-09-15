import * as entryService from "../services/entryService.js";
import * as exportService from "../services/exportService.js";
import Visitor from "../models/Visitor.js";
import { entryCreateSchema, entryUpdateSchema, listQuerySchema } from "../validators/schemas.js";
import { AppError } from "../utils/errors.js";

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
    const entry = await entryService.getEntry(req.visitor._id, req.params.id);
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
    const data = entryUpdateSchema.parse(req.body);
    const entry = await entryService.updateEntry(req.visitor._id, req.params.id, data);
    res.json({ ok: true, entry });
  } catch (err) {
    next(err);
  }
}

export async function deleteEntryHandler(req, res, next) {
  try {
    await entryService.deleteEntry(req.visitor._id, req.params.id);
    res.json({ ok: true, deleted: true });
  } catch (err) {
    next(err);
  }
}

export async function favoriteHandler(req, res, next) {
  try {
    const value = Boolean(req.body.isFavorite);
    const entry = await entryService.toggleFavorite(req.visitor._id, req.params.id, value);
    res.json({ ok: true, entry });
  } catch (err) {
    next(err);
  }
}

export async function pinHandler(req, res, next) {
  try {
    const value = Boolean(req.body.isPinned);
    const entry = await entryService.togglePinned(req.visitor._id, req.params.id, value);
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
    const entry = await entryService.getEntry(req.visitor._id, req.params.id);
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
    const entry = await entryService.getEntry(req.visitor._id, req.params.id);
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
    const entry = await entryService.getEntry(req.visitor._id, req.params.id);
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

export async function exportBulkDocxHandler(req, res, next) {
  try {
    const query = listQuerySchema.parse(req.query);
    const { entries } = await entryService.listEntries(req.visitor._id, { ...query, limit: 10000 });
    const visitorName = await getVisitorName(req.visitor._id);
    const buffer = await exportService.buildDocxBuffer({
      title: "My Diary",
      entries,
      visitorName,
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", 'attachment; filename="my-diary.docx"');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function exportBulkPdfHandler(req, res, next) {
  try {
    const query = listQuerySchema.parse(req.query);
    const { entries } = await entryService.listEntries(req.visitor._id, { ...query, limit: 10000 });
    const visitorName = await getVisitorName(req.visitor._id);
    const buffer = await exportService.buildPdfBuffer({
      title: "My Diary",
      entries,
      visitorName,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="my-diary.pdf"');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}