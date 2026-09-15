import { Router } from "express";
import * as sessionController from "../sessions/sessionController.js";
import * as entryController from "../sessions/entryController.js";
import * as categoryController from "../sessions/categoryController.js";
import * as backupController from "../sessions/backupController.js";
import * as statisticsController from "../sessions/statisticsController.js";
import * as publicController from "../sessions/publicController.js";
import { requireSession, requirePin } from "../middleware/session.js";
import { apiLimiter, sessionLimiter, exportLimiter, destructiveLimiter } from "../middleware/ratelimit.js";
import { validate, entryCreateSchema, entryUpdateSchema, sessionRegisterSchema, sessionLoginSchema, sessionPinSchema, sessionUsernameSchema, sessionNameSchema, categoryCreateSchema, categoryUpdateSchema, favoriteSchema, pinSchema } from "../validators/schemas.js";
import { asyncHandler } from "../utils/errors.js";

const router = Router();

// Health (no auth)
router.get("/health", asyncHandler(backupController.healthHandler));

// Public (visitor mode — no auth; global apiLimiter already applies)
router.get("/public/entries", asyncHandler(publicController.listPublicEntriesHandler));
router.get("/public/entries/:id", asyncHandler(publicController.getPublicEntryHandler));
router.get("/public/quotes", asyncHandler(publicController.publicQuotesHandler));
router.get("/public/categories", asyncHandler(publicController.publicCategoriesHandler));

// Session
router.get("/session/username", sessionLimiter, validate(sessionUsernameSchema), asyncHandler(sessionController.usernameAvailabilityHandler));
router.post("/session", sessionLimiter, validate(sessionRegisterSchema), asyncHandler(sessionController.registerSessionHandler));
router.post("/session/register", sessionLimiter, validate(sessionRegisterSchema), asyncHandler(sessionController.registerSessionHandler));
router.post("/session/login", sessionLimiter, validate(sessionLoginSchema), asyncHandler(sessionController.loginSessionHandler));
router.get("/session", requireSession, asyncHandler(sessionController.getSessionHandler));
router.patch("/session/name", requireSession, validate(sessionNameSchema), asyncHandler(sessionController.patchSessionHandler));
router.delete("/session", requireSession, asyncHandler(sessionController.deleteSessionHandler));

// Entries
router.get("/entries", requireSession, asyncHandler(entryController.listEntriesHandler));
router.get("/entries/search", requireSession, asyncHandler(entryController.searchHandler));
router.get("/entries/calendar", requireSession, asyncHandler(entryController.calendarHandler));
router.get("/entries/on-this-day", requireSession, asyncHandler(entryController.onThisDayHandler));
router.get("/entries/:id", requireSession, asyncHandler(entryController.getEntryHandler));
router.post("/entries", requireSession, validate(entryCreateSchema), asyncHandler(entryController.createEntryHandler));
router.patch("/entries/:id", requireSession, validate(entryUpdateSchema), asyncHandler(entryController.updateEntryHandler));
router.delete("/entries/:id", requireSession, asyncHandler(entryController.deleteEntryHandler));
router.patch("/entries/:id/favorite", requireSession, validate(favoriteSchema), asyncHandler(entryController.favoriteHandler));
router.patch("/entries/:id/pin", requireSession, validate(pinSchema), asyncHandler(entryController.pinHandler));

// Categories
router.get("/categories", requireSession, asyncHandler(categoryController.listCategoriesHandler));
router.post("/categories", requireSession, validate(categoryCreateSchema), asyncHandler(categoryController.createCategoryHandler));
router.patch("/categories/:id", requireSession, validate(categoryUpdateSchema), asyncHandler(categoryController.updateCategoryHandler));
router.delete("/categories/:id", requireSession, asyncHandler(categoryController.deleteCategoryHandler));

// Export
router.get("/export/entry/:id/docx", requireSession, exportLimiter, asyncHandler(entryController.exportEntryDocxHandler));
router.get("/export/entry/:id/pdf", requireSession, exportLimiter, asyncHandler(entryController.exportEntryPdfHandler));
router.get("/export/entry/:id/txt", requireSession, exportLimiter, asyncHandler(entryController.exportEntryTxtHandler));
router.post("/export/docx", requireSession, exportLimiter, asyncHandler(entryController.exportBulkDocxHandler));
router.post("/export/pdf", requireSession, exportLimiter, asyncHandler(entryController.exportBulkPdfHandler));

// Backup
router.get("/backup", requireSession, asyncHandler(backupController.backupHandler));
router.post("/backup/restore", requireSession, destructiveLimiter, asyncHandler(backupController.restoreHandler));
router.post("/backup/delete-all", requireSession, destructiveLimiter, validate(sessionPinSchema), requirePin, asyncHandler(backupController.deleteAllHandler));
router.post("/backup/reset", requireSession, destructiveLimiter, validate(sessionPinSchema), requirePin, asyncHandler(backupController.deleteAllHandler));

// Statistics
router.get("/statistics", requireSession, asyncHandler(statisticsController.statisticsHandler));

export default router;