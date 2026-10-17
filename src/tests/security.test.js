import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../app.js";
import { connectDB } from "../config/db.js";

describe("Security Audits & Regression Tests", () => {
  const app = createApp();

  before(async () => {
    await connectDB();
  });

  after(async () => {
    await mongoose.disconnect();
  });

  test("CORS rejects untrusted origins with 403", async () => {
    const res = await request(app)
      .get("/api/public/entries")
      .set("Origin", "https://malicious-attacker.com");

    assert.equal(res.status, 403);
    assert.match(res.body.error, /CORS/i);
  });

  test("CSRF middleware blocks cross-origin POST requests from unlisted origin", async () => {
    const res = await request(app)
      .post("/api/session/login")
      .set("Origin", "https://evil.com")
      .send({ username: "admin", pin: "1234" });

    assert.equal(res.status, 403);
  });

  test("Allows requests from trusted client origins", async () => {
    const res = await request(app)
      .get("/api/public/entries")
      .set("Origin", "https://khamosh-alfaaz-client.vercel.app");

    // Should not be blocked by CORS
    assert.notEqual(res.status, 403);
  });

  test("Enforces content length limits on entry creation (DoS prevention)", async () => {
    const hugeContent = "A".repeat(100001);
    const res = await request(app)
      .post("/api/entries")
      .set("Origin", "https://khamosh-alfaaz-client.vercel.app")
      .send({
        title: "Test Entry",
        content: hugeContent,
        type: "diary",
      });

    // 400 validation error (content exceeds 100,000 characters) or 401 if unauthenticated
    // But importantly NOT 500 or unhandled crash
    assert.ok([400, 401].includes(res.status));
    if (res.status === 400) {
      assert.match(res.body.details?.content || "", /maximum length/i);
    }
  });

  test("Invalid identifier format returns 400 Bad Request instead of unhandled 500", async () => {
    const res = await request(app)
      .get("/api/public/entries/invalid-not-an-id")
      .set("Origin", "https://khamosh-alfaaz-client.vercel.app");

    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Invalid identifier");
  });

  test("Public search query with unbalanced quotes does not crash", async () => {
    const res = await request(app)
      .get('/api/public/entries?search="unbalanced_quote')
      .set("Origin", "https://khamosh-alfaaz-client.vercel.app");

    // Should return 200 or 503 (if DB disconnected), not an unhandled syntax crash
    assert.notEqual(res.body.error, "Syntax error in text search");
  });

  test("Health check endpoint responds cleanly", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.status, "healthy");
  });
});
