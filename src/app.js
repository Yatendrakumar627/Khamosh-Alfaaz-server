import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import compression from "compression";
import { env } from "./config/env.js";
import apiRouter from "./routes/api.js";
import { notFound, errorHandler, AppError } from "./utils/errors.js";
import { apiLimiter } from "./middleware/ratelimit.js";

function csrfProtection(req, res, next) {
  const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE"];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }

  // Requests using custom Authorization or session headers are not vulnerable to browser CSRF
  if (req.headers.authorization || req.headers["x-session-token"]) {
    return next();
  }

  const origin = req.headers.origin;
  if (origin) {
    if (!env.clientOrigins.includes(origin)) {
      return next(new AppError("Cross-origin request blocked", 403));
    }
    return next();
  }

  const referer = req.headers.referer;
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!env.clientOrigins.includes(refererOrigin)) {
        return next(new AppError("Cross-origin request blocked", 403));
      }
    } catch {
      return next(new AppError("Invalid request source", 403));
    }
  }

  if (req.headers["sec-fetch-site"] === "cross-site") {
    return next(new AppError("Cross-site request blocked", 403));
  }

  next();
}

export function createApp() {
  const app = express();

  app.set("trust proxy", env.nodeEnv === "production" ? 1 : 0);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: { action: "deny" },
      noSniff: true,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.clientOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new AppError("CORS origin not allowed", 403));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With", "x-session-token"],
    }),
  );

  app.use(compression());
  app.use(csrfProtection);

  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: false, limit: "15mb" }));
  app.use(cookieParser(env.sessionSecret));

  // Health check endpoint (exempt from rate limiter for keep-alive pings)
  app.get("/api/health", (req, res) =>
    res.json({ ok: true, status: "healthy", uptime: process.uptime(), timestamp: new Date().toISOString() }),
  );

  // Cache-Control headers for public content (quotes, public entries, categories)
  app.use("/api/public", (req, res, next) => {
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
    }
    next();
  });

  app.use("/api", apiLimiter);
  app.use("/api", apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}