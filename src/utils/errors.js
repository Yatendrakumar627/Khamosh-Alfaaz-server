export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export const notFound = (req, res, next) => {
  next(new AppError(`Not found: ${req.method} ${req.originalUrl}`, 404));
};

export const errorHandler = (err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON in request body" });
  }
  if (err.name === "ZodError") {
    const details = Object.fromEntries(
      err.errors.map((e) => [e.path.join(".") || "body", e.message]),
    );
    return res.status(400).json({ error: "Validation failed", details });
  }
  if (!(err instanceof AppError)) {
    // Mongoose validation error
    if (err.name === "ValidationError") {
      const details = Object.fromEntries(
        Object.entries(err.errors).map(([k, v]) => [k, v.message]),
      );
      return res.status(400).json({ error: "Validation failed", details });
    }
    // Mongoose cast error (bad ObjectId)
    if (err.name === "CastError") {
      return res.status(400).json({ error: "Invalid identifier" });
    }
    // Mongo duplicate key
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0] || "field";
      return res.status(409).json({ error: `${field} already exists` });
    }
    // Mongo connection / server error
    console.error("Unhandled error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }

  const payload = { error: err.message };
  if (err.details) payload.details = err.details;
  res.status(err.statusCode).json(payload);
};

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);