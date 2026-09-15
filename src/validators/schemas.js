import { z } from "zod";

const entryTypes = ["diary", "thought", "quote", "idea", "note", "personal", "gratitude", "other"];

const visibilityEnum = z.enum(["private", "public"]).default("private");

const queryBoolean = z
  .preprocess(
    (v) =>
      v === undefined || v === null
        ? undefined
        : v === true || v === "true" || v === 1 || v === "1",
    z.boolean().optional(),
  );

export const uniqueNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(/^[a-z0-9_]+$/, "Use only letters, numbers, and underscores");

const credentialPinSchema = z
  .string()
  .regex(/^\d{4,12}$/, "PIN must contain 4 to 12 digits");

const backupEntrySchema = z.object({
  title: z.string().trim().max(200).optional().default("Untitled Entry"),
  content: z.string().trim().min(1, "Content is required"),
  type: z.enum(entryTypes).default("diary"),
  tags: z.array(z.string().trim().max(50)).max(20).default([]),
  entryDate: z.coerce.date().optional(),
  isFavorite: z.boolean().optional().default(false),
  isPinned: z.boolean().optional().default(false),
  visibility: visibilityEnum,
});

const backupDataSchema = z.object({
  visitor: z.object({ name: z.string().trim().max(100).optional() }).optional(),
  entries: z.array(backupEntrySchema).max(10000).default([]),
  categories: z.array(z.object({ name: z.string().trim().min(1).max(60) })).max(200).default([]),
});

export const sessionRegisterSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  username: uniqueNameSchema,
  pin: credentialPinSchema,
});

export const sessionLoginSchema = z.object({
  username: uniqueNameSchema,
  pin: credentialPinSchema,
});

export const sessionCreateSchema = sessionRegisterSchema;

export const sessionPinSchema = z.object({
  pin: credentialPinSchema,
});

export const sessionUsernameSchema = z.object({
  username: uniqueNameSchema,
});

export const sessionNameSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
});

export const entryCreateSchema = z.object({
  title: z.string().trim().max(200, "Title too long").optional().default("Untitled Entry"),
  content: z.string().trim().min(1, "Content is required"),
  type: z.enum(entryTypes).default("diary"),
  tags: z.array(z.string().trim().max(50)).max(20).default([]),
  entryDate: z.coerce.date().optional(),
  visibility: visibilityEnum,
});

export const entryUpdateSchema = z.object({
  title: z.string().trim().max(200, "Title too long").optional(),
  content: z.string().trim().min(1, "Content is required").optional(),
  type: z.enum(entryTypes).optional(),
  tags: z.array(z.string().trim().max(50)).max(20).optional(),
  entryDate: z.coerce.date().optional(),
  isFavorite: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  visibility: z.enum(["private", "public"]).optional(),
}).refine((d) => Object.keys(d).length > 0, "No fields to update");

export const favoriteSchema = z.object({ isFavorite: z.boolean() });
export const pinSchema = z.object({ isPinned: z.boolean() });

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60, "Name too long"),
});

export const categoryUpdateSchema = categoryCreateSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "No fields to update");

export const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort: z.string().default("-createdAt"),
  type: z.string().optional(),
  search: z.string().optional(),
  favorite: queryBoolean,
  pinned: queryBoolean,
  tags: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  date: z.coerce.date().optional(),
  calendar: z.string().optional(),
});

export const exportSelectionSchema = z.object({
  entryIds: z.array(z.string().trim().min(1)).max(10000).optional(),
  scope: z.enum(["all", "month", "year", "custom", "selected"]).default("all"),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  type: z.string().optional(),
  favorite: z.boolean().optional(),
  pinned: z.boolean().optional(),
  tags: z.string().optional(),
  sort: z.string().default("-entryDate"),
});

export const backupRestoreSchema = z.object({
  data: backupDataSchema.optional(),
  version: z.string().optional(),
  visitor: backupDataSchema.shape.visitor.optional(),
  entries: backupDataSchema.shape.entries.optional(),
  categories: backupDataSchema.shape.categories.optional(),
}).refine((value) => value.data || value.entries, "Backup payload is required");

export const validate = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse({
      ...req.body,
      ...req.query,
      ...req.params,
    });
    if (req.body && Object.keys(parsed).length) req.validated = parsed;
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      const details = Object.fromEntries(
        err.errors.map((e) => [e.path.join(".") || "body", e.message]),
      );
      return res.status(400).json({ error: "Validation failed", details });
    }
    next(err);
  }
};