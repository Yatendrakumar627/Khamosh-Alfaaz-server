import * as backupService from "../services/backupService.js";
import { backupRestoreSchema } from "../validators/schemas.js";
import { AppError } from "../utils/errors.js";

export async function backupHandler(req, res, next) {
  try {
    const payload = await backupService.exportBackup(req.visitor._id);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="khamosh-alfaaz-backup.json"');
    res.json(payload);
  } catch (err) {
    next(err);
  }
}

export async function restoreHandler(req, res, next) {
  try {
    const body = req.body;
    if (!body || typeof body !== "object") {
      return next(new AppError("Backup payload required", 400));
    }
    const parsed = backupRestoreSchema.parse(body);
    const payload = parsed.data || {
      visitor: parsed.visitor,
      entries: parsed.entries || [],
      categories: parsed.categories || [],
    };
    const result = await backupService.restoreBackup(req.visitor._id, payload, { wipeFirst: true });
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function deleteAllHandler(req, res, next) {
  try {
    await backupService.deleteAll(req.visitor._id);
    res.json({ ok: true, deleted: true });
  } catch (err) {
    next(err);
  }
}

export async function healthHandler(req, res) {
  res.json({ ok: true, status: "healthy", uptime: process.uptime(), timestamp: new Date().toISOString() });
}