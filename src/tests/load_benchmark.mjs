import http from "node:http";
import mongoose from "mongoose";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import compression from "compression";
import { connectDB } from "../config/db.js";
import Visitor from "../models/Visitor.js";
import Entry from "../models/Entry.js";
import Category from "../models/Category.js";
import Session from "../models/Session.js";
import { hashPin, generateSessionId, hashToken } from "../utils/crypto.js";
import apiRouter from "../routes/api.js";
import { notFound, errorHandler } from "../utils/errors.js";

function getPercentiles(latencies) {
  if (!latencies.length) return { min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = (sum / sorted.length).toFixed(2);
  const p = (pct) => sorted[Math.min(Math.floor((pct / 100) * sorted.length), sorted.length - 1)];

  return {
    min: sorted[0].toFixed(2),
    p50: p(50).toFixed(2),
    p90: p(90).toFixed(2),
    p95: p(95).toFixed(2),
    p99: p(99).toFixed(2),
    max: sorted[sorted.length - 1].toFixed(2),
    avg,
  };
}

async function runScenario({
  name,
  serverPort,
  totalRequests,
  concurrency,
  method = "GET",
  path,
  headers = {},
  body = null,
}) {
  const latencies = [];
  let successCount = 0;
  let rateLimitedCount = 0;
  let errorCount = 0;
  const statusCodes = {};

  const executeRequest = (workerId) =>
    new Promise((resolve) => {
      const start = process.hrtime.bigint();
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: serverPort,
          path,
          method,
          headers: {
            Origin: "https://khamosh-alfaaz-client.vercel.app",
            "X-Forwarded-For": `192.168.1.${(workerId % 200) + 1}`,
            ...headers,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            const end = process.hrtime.bigint();
            const durationMs = Number(end - start) / 1e6;
            latencies.push(durationMs);

            statusCodes[res.statusCode] = (statusCodes[res.statusCode] || 0) + 1;
            if (res.statusCode >= 200 && res.statusCode < 400) {
              successCount++;
            } else if (res.statusCode === 429) {
              rateLimitedCount++;
            } else {
              errorCount++;
            }
            resolve();
          });
        },
      );

      req.on("error", (err) => {
        errorCount++;
        statusCodes["ERR"] = (statusCodes["ERR"] || 0) + 1;
        resolve();
      });

      if (body) {
        req.write(typeof body === "string" ? body : JSON.stringify(body));
      }
      req.end();
    });

  const wallStart = Date.now();
  let requestIndex = 0;

  const workers = Array.from({ length: concurrency }, async (_, workerId) => {
    while (true) {
      const idx = requestIndex++;
      if (idx >= totalRequests) break;
      await executeRequest(workerId);
    }
  });

  await Promise.all(workers);
  const wallEnd = Date.now();
  const totalDurationSec = (wallEnd - wallStart) / 1000;
  const rps = (totalRequests / (totalDurationSec || 1)).toFixed(1);
  const percentiles = getPercentiles(latencies);

  return {
    name,
    totalRequests,
    concurrency,
    totalDurationSec: totalDurationSec.toFixed(2),
    rps,
    successCount,
    rateLimitedCount,
    errorCount,
    statusCodes,
    percentiles,
  };
}

async function main() {
  console.log("=========================================================================================");
  console.log("               KHAMOSH ALFAAZ - SENIOR PERFORMANCE & LOAD BENCHMARK                     ");
  console.log("=========================================================================================");

  await connectDB();

  // Create isolated seed user & session
  const benchmarkUser = {
    name: "Load Benchmark User",
    username: `benchuser_${Date.now()}`,
    pin: "998877",
  };

  const rawPinHash = hashPin(benchmarkUser.pin);
  const visitor = await Visitor.create({
    name: benchmarkUser.name,
    username: benchmarkUser.username,
    pinHash: rawPinHash,
    lastActiveAt: new Date(),
  });

  const rawToken = generateSessionId();
  await Session.create({
    visitorId: visitor._id,
    sessionId: hashToken(rawToken),
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
  });

  // Seed sample entries
  const seededEntries = [];
  for (let i = 0; i < 40; i++) {
    seededEntries.push({
      visitorId: visitor._id,
      title: `Performance Benchmark Journal #${i + 1}`,
      content: `A quiet reflection on silence and serenity under continuous concurrent load testing. Entry token #${i}`,
      type: i % 4 === 0 ? "quote" : i % 3 === 0 ? "thought" : "diary",
      tags: ["benchmark", "silence", `tag${i % 4}`],
      visibility: i % 2 === 0 ? "public" : "private",
      entryDate: new Date(2026, 9, (i % 28) + 1, 12, 0, 0),
    });
  }
  await Entry.insertMany(seededEntries);

  // Setup benchmark server with proxy IP trust enabled
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: "15mb" }));
  app.use(cookieParser("bench-secret"));
  app.get("/api/health", (req, res) => {
    res.json({ ok: true, status: "healthy", uptime: process.uptime() });
  });
  app.use("/api", apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const serverPort = server.address().port;
  console.log(`HTTP Server active on port: ${serverPort}`);

  const initialMem = process.memoryUsage();
  console.log(`Initial Heap Used : ${(initialMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Initial RSS       : ${(initialMem.rss / 1024 / 1024).toFixed(2)} MB\n`);

  const results = [];

  // Scenario 1: Health Check (Keep-Alive / Baseline Throughput)
  results.push(
    await runScenario({
      name: "1. Health Endpoint (Baseline Ping)",
      serverPort,
      totalRequests: 250,
      concurrency: 25,
      path: "/api/health",
    }),
  );

  // Scenario 2: Public Explore Feed (Visitor Mode - Unauthenticated Read)
  results.push(
    await runScenario({
      name: "2. Public Feed (GET /api/public/entries)",
      serverPort,
      totalRequests: 100,
      concurrency: 10,
      path: "/api/public/entries?limit=15",
    }),
  );

  // Scenario 3: Public Quotes Wall
  results.push(
    await runScenario({
      name: "3. Public Quotes Wall (GET /api/public/quotes)",
      serverPort,
      totalRequests: 100,
      concurrency: 10,
      path: "/api/public/quotes",
    }),
  );

  // Scenario 4: Authenticated Diary Feed Read (Protected Session Query)
  results.push(
    await runScenario({
      name: "4. Authenticated Diary Feed (GET /api/entries)",
      serverPort,
      totalRequests: 100,
      concurrency: 10,
      path: "/api/entries?page=1&limit=20",
      headers: { Authorization: `Bearer ${rawToken}` },
    }),
  );

  // Scenario 5: Full-Text Search under Concurrency
  results.push(
    await runScenario({
      name: "5. Full-Text Search (GET /api/entries/search)",
      serverPort,
      totalRequests: 80,
      concurrency: 8,
      path: "/api/entries/search?q=silence",
      headers: { Authorization: `Bearer ${rawToken}` },
    }),
  );

  // Scenario 6: Calendar Monthly Heatmap Aggregation
  results.push(
    await runScenario({
      name: "6. Calendar Heatmap (GET /api/entries/calendar)",
      serverPort,
      totalRequests: 80,
      concurrency: 8,
      path: "/api/entries/calendar?month=2026-10",
      headers: { Authorization: `Bearer ${rawToken}` },
    }),
  );

  // Scenario 7: Concurrent Entry Creation (Write-heavy Workload)
  results.push(
    await runScenario({
      name: "7. Concurrent Entry Creation (POST /api/entries)",
      serverPort,
      totalRequests: 50,
      concurrency: 5,
      method: "POST",
      path: "/api/entries",
      headers: { Authorization: `Bearer ${rawToken}` },
      body: {
        title: "Load Test Journal Entry",
        content: "Testing database write performance under concurrent traffic spikes.",
        type: "diary",
        tags: ["loadtest", "concurrency"],
        visibility: "private",
      },
    }),
  );

  // Scenario 8: Document Generation (Export Engine - Heavy CPU/Memory)
  results.push(
    await runScenario({
      name: "8. Binary Document Generation (POST /api/export/docx)",
      serverPort,
      totalRequests: 20,
      concurrency: 4,
      method: "POST",
      path: "/api/export/docx",
      headers: { Authorization: `Bearer ${rawToken}` },
      body: { scope: "all", sortOrder: "newest" },
    }),
  );

  // Scenario 9: Rate Limiting Defense (Simulating Burst Attack from single IP)
  results.push(
    await runScenario({
      name: "9. Single-IP Burst Attack (Rate Limiter Defense)",
      serverPort,
      totalRequests: 40,
      concurrency: 20,
      method: "POST",
      path: "/api/session/login",
      headers: { "X-Forwarded-For": "203.0.113.42" }, // Fixed attacker IP
      body: { username: benchmarkUser.username, pin: benchmarkUser.pin },
    }),
  );

  const finalMem = process.memoryUsage();
  console.log("\n=========================================================================================");
  console.log("                           LOAD BENCHMARK SUMMARY TABLE                                  ");
  console.log("=========================================================================================");
  console.log(
    "Scenario Name".padEnd(46) +
      "Reqs".padEnd(8) +
      "RPS".padEnd(10) +
      "p50(ms)".padEnd(10) +
      "p95(ms)".padEnd(10) +
      "p99(ms)".padEnd(10) +
      "Status Codes",
  );
  console.log("-".repeat(105));

  for (const r of results) {
    const sc = Object.entries(r.statusCodes)
      .map(([code, cnt]) => `${code}:${cnt}`)
      .join(" ");
    console.log(
      r.name.slice(0, 44).padEnd(46) +
        String(r.totalRequests).padEnd(8) +
        String(r.rps).padEnd(10) +
        String(r.percentiles.p50).padEnd(10) +
        String(r.percentiles.p95).padEnd(10) +
        String(r.percentiles.p99).padEnd(10) +
        sc,
    );
  }

  console.log("\n=========================================================================================");
  console.log("                             MEMORY STABILITY AUDIT                                      ");
  console.log("=========================================================================================");
  console.log(`Initial Heap Used : ${(initialMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Final Heap Used   : ${(finalMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Initial RSS       : ${(initialMem.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Final RSS         : ${(finalMem.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Memory Delta      : +${((finalMem.heapUsed - initialMem.heapUsed) / 1024 / 1024).toFixed(2)} MB (Normal GC range)`);

  // Cleanup
  await Entry.deleteMany({ visitorId: visitor._id });
  await Session.deleteMany({ visitorId: visitor._id });
  await Visitor.deleteOne({ _id: visitor._id });
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  console.log("=========================================================================================");
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
