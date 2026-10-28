import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../app.js";
import { connectDB } from "../config/db.js";
import Visitor from "../models/Visitor.js";
import Entry from "../models/Entry.js";
import Session from "../models/Session.js";
import { hashPin, hashToken } from "../utils/crypto.js";

describe("Comprehensive Security Audits & Defensive Testing", () => {
  const app = createApp();

  let userA, sessionTokenA;
  let userB, sessionTokenB;
  let entryUserA;

  before(async () => {
    await connectDB();
    await Entry.deleteMany({ title: /SecAudit/ });
    await Visitor.deleteMany({ username: /^sec_user_/ });

    // Seed User A
    userA = await Visitor.create({
      name: "Security User A",
      username: "sec_user_a",
      pinHash: hashPin("1111"),
      totalEntries: 1,
    });
    sessionTokenA = "seca_token_" + Date.now();
    await Session.create({
      visitorId: userA._id,
      sessionId: hashToken(sessionTokenA),
      expiresAt: new Date(Date.now() + 86400000),
    });

    // Seed User B
    userB = await Visitor.create({
      name: "Security User B",
      username: "sec_user_b",
      pinHash: hashPin("2222"),
      totalEntries: 0,
    });
    sessionTokenB = "secb_token_" + Date.now();
    await Session.create({
      visitorId: userB._id,
      sessionId: hashToken(sessionTokenB),
      expiresAt: new Date(Date.now() + 86400000),
    });

    // Seed Entry for User A (Private)
    entryUserA = await Entry.create({
      visitorId: userA._id,
      title: "SecAudit Secret Entry",
      content: "Classified private memory for User A only.",
      type: "diary",
      visibility: "private",
      tags: ["confidential"],
    });
  });

  after(async () => {
    if (userA) await Visitor.deleteOne({ _id: userA._id });
    if (userB) await Visitor.deleteOne({ _id: userB._id });
    if (entryUserA) await Entry.deleteOne({ _id: entryUserA._id });
    await Entry.deleteMany({ title: /SecAudit/ });
    await mongoose.disconnect();
  });

  describe("1. NoSQL Injection & Query Tampering Protection", () => {
    test("Rejects MongoDB operator injection in login payload ($gt / $ne)", async () => {
      const res = await request(app)
        .post("/api/session/login")
        .set("Origin", "http://localhost:5173")
        .send({
          username: { $gt: "" },
          pin: { $gt: "" },
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Validation failed");
    });

    test("Rejects MongoDB operator injection in registration payload", async () => {
      const res = await request(app)
        .post("/api/session/register")
        .set("Origin", "http://localhost:5173")
        .send({
          name: "Attacker",
          username: { $regex: ".*" },
          pin: "1234",
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Validation failed");
    });

    test("Query parameter operator injection (type[$ne]=diary) is neutralized safely", async () => {
      const res = await request(app)
        .get("/api/entries")
        .set("Authorization", `Bearer ${sessionTokenA}`)
        .query({ "type[$ne]": "diary" });

      // Must respond successfully or with 400 without crashing or treating $ne as an operator
      assert.ok([200, 400].includes(res.status));
      if (res.status === 200) {
        assert.ok(Array.isArray(res.body.entries));
      }
    });

    test("Text search query with unbalanced quotes and special regex chars does not crash DB", async () => {
      const res = await request(app)
        .get('/api/public/entries?search="unbalanced_quote.*$[]{}\\^')
        .set("Origin", "http://localhost:5173");

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.entries));
    });
  });

  describe("2. Cross-Site Scripting (XSS) & Content Neutralization", () => {
    test("Stores HTML/script tags as inert strings without interpretation or execution", async () => {
      const xssPayload = "<script>alert('XSS')</script><img src=x onerror=alert(1)>";
      const res = await request(app)
        .post("/api/entries")
        .set("Authorization", `Bearer ${sessionTokenA}`)
        .set("Origin", "http://localhost:5173")
        .send({
          title: "SecAudit XSS Test " + xssPayload,
          content: "Body content with embedded attack: " + xssPayload,
          type: "diary",
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.entry);
      // Payload is preserved as a literal string (safe for React rendering and JSON APIs)
      assert.ok(res.body.entry.title.includes("<script>"));

      // Clean up
      await Entry.deleteOne({ _id: res.body.entry._id });
    });

    test("Exporting XSS payload to Plain Text and Markdown handles script strings safely", async () => {
      const entry = await Entry.create({
        visitorId: userA._id,
        title: "SecAudit XSS Export Test",
        content: "<script>alert('pwned')</script>",
        type: "diary",
      });

      const resTxt = await request(app)
        .get(`/api/export/entry/${entry._id}/txt`)
        .set("Authorization", `Bearer ${sessionTokenA}`);

      assert.equal(resTxt.status, 200);
      assert.equal(resTxt.headers["content-type"], "text/plain; charset=utf-8");
      assert.ok(resTxt.text.includes("<script>alert('pwned')</script>"));

      const resMd = await request(app)
        .get(`/api/export/entry/${entry._id}/md`)
        .set("Authorization", `Bearer ${sessionTokenA}`);

      assert.equal(resMd.status, 200);
      assert.equal(resMd.headers["content-type"], "text/markdown; charset=utf-8");

      await Entry.deleteOne({ _id: entry._id });
    });
  });

  describe("3. Broken Object Level Authorization (BOLA/IDOR) & Data Leakage", () => {
    test("User B CANNOT read User A's private entry via direct ID (IDOR prevention)", async () => {
      const res = await request(app)
        .get(`/api/entries/${entryUserA._id}`)
        .set("Authorization", `Bearer ${sessionTokenB}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.error, "Entry not found");
    });

    test("User B CANNOT update or mutate User A's entry", async () => {
      const res = await request(app)
        .patch(`/api/entries/${entryUserA._id}`)
        .set("Authorization", `Bearer ${sessionTokenB}`)
        .set("Origin", "http://localhost:5173")
        .send({ title: "Hacked by User B" });

      assert.equal(res.status, 404);
      // Verify database document was NOT altered
      const unmodified = await Entry.findById(entryUserA._id);
      assert.equal(unmodified.title, "SecAudit Secret Entry");
    });

    test("User B CANNOT delete User A's entry", async () => {
      const res = await request(app)
        .delete(`/api/entries/${entryUserA._id}`)
        .set("Authorization", `Bearer ${sessionTokenB}`)
        .set("Origin", "http://localhost:5173");

      assert.equal(res.status, 404);
      const stillExists = await Entry.findById(entryUserA._id);
      assert.ok(stillExists);
    });

    test("Unauthenticated public user CANNOT access private entry via public API", async () => {
      const res = await request(app).get(`/api/public/entries/${entryUserA._id}`);
      assert.equal(res.status, 404);
      assert.equal(res.body.error, "Entry not found");
    });

    test("Public API responses NEVER leak visitorId, credentials, or user identifiers", async () => {
      const publicEntry = await Entry.create({
        visitorId: userA._id,
        title: "SecAudit Public Entry",
        content: "Everyone can read this quote.",
        type: "quote",
        visibility: "public",
      });

      const res = await request(app).get(`/api/public/entries/${publicEntry._id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.entry.visitorId, undefined);
      assert.equal(res.body.entry.__v, undefined);
      assert.equal(res.body.entry.isFavorite, undefined);

      await Entry.deleteOne({ _id: publicEntry._id });
    });

    test("Unauthenticated user cannot access full backup", async () => {
      const res = await request(app).get("/api/backup");
      assert.equal(res.status, 401);
    });
  });

  describe("4. Transport Security, SSL/TLS, and HTTP Security Headers", () => {
    test("Enforces HSTS (Strict-Transport-Security) with long max-age and subdomains", async () => {
      const res = await request(app).get("/api/health");
      assert.ok(res.headers["strict-transport-security"]);
      assert.match(res.headers["strict-transport-security"], /max-age=31536000/);
      assert.match(res.headers["strict-transport-security"], /includeSubDomains/);
    });

    test("Enforces X-Content-Type-Options: nosniff to prevent MIME sniffing", async () => {
      const res = await request(app).get("/api/health");
      assert.equal(res.headers["x-content-type-options"], "nosniff");
    });

    test("Enforces X-Frame-Options: DENY to prevent Clickjacking", async () => {
      const res = await request(app).get("/api/health");
      assert.equal(res.headers["x-frame-options"], "DENY");
    });

    test("Enforces Referrer-Policy: no-referrer to prevent URL metadata leakage", async () => {
      const res = await request(app).get("/api/health");
      assert.equal(res.headers["referrer-policy"], "no-referrer");
    });

    test("Suppresses server technology fingerprint headers (X-Powered-By is hidden)", async () => {
      const res = await request(app).get("/api/health");
      assert.equal(res.headers["x-powered-by"], undefined);
    });

    test("Cookie options enforce HttpOnly and secure cookie path", async () => {
      const res = await request(app)
        .post("/api/session/login")
        .set("Origin", "http://localhost:5173")
        .send({ username: "sec_user_a", pin: "1111" });

      assert.equal(res.status, 200);
      const cookies = res.headers["set-cookie"];
      assert.ok(cookies && cookies.length > 0);
      const sessionCookie = cookies.find((c) => c.startsWith("dhsid="));
      assert.ok(sessionCookie);
      assert.match(sessionCookie, /HttpOnly/i);
      assert.match(sessionCookie, /Path=\//i);
    });
  });

  describe("5. CORS & Cross-Site Request Forgery (CSRF) Isolation", () => {
    test("CORS blocks unauthorized external domains with HTTP 403", async () => {
      const res = await request(app)
        .get("/api/public/entries")
        .set("Origin", "https://malicious-phishing-site.com");

      assert.equal(res.status, 403);
      assert.match(res.body.error, /CORS origin not allowed/i);
    });

    test("CSRF middleware blocks state-changing cross-origin requests", async () => {
      const res = await request(app)
        .post("/api/session/login")
        .set("Origin", "https://unauthorized-attacker.org")
        .send({ username: "sec_user_a", pin: "1111" });

      assert.equal(res.status, 403);
    });

    test("Allows requests from configured trusted origins", async () => {
      const res = await request(app)
        .get("/api/public/entries")
        .set("Origin", "http://localhost:5173");

      assert.notEqual(res.status, 403);
    });
  });

  describe("6. Denial of Service (DoS) & Payload Boundary Enforcement", () => {
    test("Enforces maximum entry content length (100,000 characters)", async () => {
      const hugeContent = "A".repeat(100001);
      const res = await request(app)
        .post("/api/entries")
        .set("Authorization", `Bearer ${sessionTokenA}`)
        .set("Origin", "http://localhost:5173")
        .send({
          title: "SecAudit Huge Entry",
          content: hugeContent,
          type: "diary",
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Validation failed");
      assert.match(res.body.details?.content || "", /maximum length/i);
    });

    test("Invalid ObjectId format returns 400 Bad Request instead of unhandled 500", async () => {
      const res = await request(app)
        .get("/api/public/entries/not-a-valid-mongo-object-id")
        .set("Origin", "http://localhost:5173");

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Invalid identifier");
    });

    test("Malformed JSON body returns 400 with clean error without leaking stack trace", async () => {
      const res = await request(app)
        .post("/api/entries")
        .set("Authorization", `Bearer ${sessionTokenA}`)
        .set("Origin", "http://localhost:5173")
        .set("Content-Type", "application/json")
        .send("{ broken json body: ");

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Invalid JSON in request body");
      assert.equal(res.body.stack, undefined);
    });
  });
});
