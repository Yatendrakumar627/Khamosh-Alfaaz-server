import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import apiRouter from "./routes/api.js";
import { notFound, errorHandler } from "./utils/errors.js";
import { apiLimiter } from "./middleware/ratelimit.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", env.nodeEnv === "production" ? 1 : 0);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.clientOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
    }),
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false, limit: "2mb" }));
  app.use(cookieParser(env.sessionSecret));

  app.use("/api", apiLimiter);

  app.get("/api/health", (req, res) =>
    res.json({ ok: true, status: "healthy", uptime: process.uptime(), timestamp: new Date().toISOString() }),
  );

  app.use("/api", apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}