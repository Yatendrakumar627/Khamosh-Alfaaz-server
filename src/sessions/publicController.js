import mongoose from "mongoose";
import * as publicService from "../services/publicService.js";
import { listQuerySchema } from "../validators/schemas.js";
import { AppError } from "../utils/errors.js";

function validateObjectId(id) {
  if (!id || typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid identifier", 400);
  }
  return id;
}

export async function listPublicEntriesHandler(req, res, next) {
  try {
    const query = listQuerySchema.parse(req.query);
    const result = await publicService.listPublicEntries(query);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getPublicEntryHandler(req, res, next) {
  try {
    const id = validateObjectId(req.params.id);
    const entry = await publicService.getPublicEntry(id);
    res.json({ ok: true, entry });
  } catch (err) {
    next(err);
  }
}

export async function publicQuotesHandler(req, res, next) {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 30;
    const result = await publicService.publicQuotes(limit);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function publicCategoriesHandler(req, res, next) {
  try {
    const result = await publicService.publicCategories();
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}