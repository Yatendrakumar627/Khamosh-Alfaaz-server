import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../app.js";
import { connectDB } from "../config/db.js";
import Visitor from "../models/Visitor.js";
import Entry from "../models/Entry.js";
import Category from "../models/Category.js";

describe("API Endpoints Integration Tests", () => {
  const app = createApp();
  const TRUSTED_ORIGIN = "https://khamosh-alfaaz-client.vercel.app";
  const testUsername = `apitest_${Date.now()}`;
  const testPin = "4567";
  let sessionToken;
  let sessionCookie;
  let visitorId;
  let createdEntryId;
  let createdCategoryId;

  before(async () => {
    await connectDB();
  });

  after(async () => {
    if (visitorId) {
      await Entry.deleteMany({ visitorId });
      await Category.deleteMany({ visitorId });
      await Visitor.deleteOne({ _id: visitorId });
    }
    await mongoose.disconnect();
  });

  describe("Session & Auth Endpoints", () => {
    test("GET /api/session/username checks username availability", async () => {
      const res = await request(app)
        .get(`/api/session/username?username=${testUsername}`)
        .set("Origin", TRUSTED_ORIGIN);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.available, true);
    });

    test("POST /api/session registers a new visitor and establishes session", async () => {
      const res = await request(app)
        .post("/api/session")
        .set("Origin", TRUSTED_ORIGIN)
        .send({
          name: "API Tester",
          username: testUsername,
          pin: testPin,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.ok, true);
      assert.ok(res.body.token);
      assert.ok(res.body.visitor.id);

      sessionToken = res.body.token;
      visitorId = res.body.visitor.id;

      const setCookie = res.headers["set-cookie"];
      if (setCookie && setCookie.length) {
        sessionCookie = setCookie[0].split(";")[0];
      }
    });

    test("POST /api/session/login authenticates with valid credentials", async () => {
      const res = await request(app)
        .post("/api/session/login")
        .set("Origin", TRUSTED_ORIGIN)
        .send({
          username: testUsername,
          pin: testPin,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(res.body.token);
    });

    test("GET /api/session retrieves authenticated user profile", async () => {
      const res = await request(app)
        .get("/api/session")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.visitor.name, "API Tester");
    });

    test("PATCH /api/session/name updates profile name", async () => {
      const res = await request(app)
        .patch("/api/session/name")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`)
        .send({ name: "Updated API Tester" });

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.visitor.name, "Updated API Tester");
    });
  });

  describe("Entries Endpoints", () => {
    test("POST /api/entries creates an entry", async () => {
      const res = await request(app)
        .post("/api/entries")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`)
        .send({
          title: "API Test Entry",
          content: "Testing entry persistence via API.",
          type: "diary",
          tags: ["api", "testing"],
          visibility: "public",
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.entry.title, "API Test Entry");
      createdEntryId = res.body.entry._id;
    });

    test("GET /api/entries lists user entries", async () => {
      const res = await request(app)
        .get("/api/entries")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(res.body.entries.length >= 1);
    });

    test("GET /api/entries/:id retrieves specific entry", async () => {
      const res = await request(app)
        .get(`/api/entries/${createdEntryId}`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.entry.title, "API Test Entry");
    });

    test("PATCH /api/entries/:id updates entry", async () => {
      const res = await request(app)
        .patch(`/api/entries/${createdEntryId}`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`)
        .send({ title: "Updated API Entry" });

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.entry.title, "Updated API Entry");
    });

    test("PATCH /api/entries/:id/favorite and /pin toggles state", async () => {
      const favRes = await request(app)
        .patch(`/api/entries/${createdEntryId}/favorite`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`)
        .send({ isFavorite: true });

      assert.equal(favRes.status, 200);
      assert.equal(favRes.body.entry.isFavorite, true);

      const pinRes = await request(app)
        .patch(`/api/entries/${createdEntryId}/pin`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`)
        .send({ isPinned: true });

      assert.equal(pinRes.status, 200);
      assert.equal(pinRes.body.entry.isPinned, true);
    });

    test("GET /api/entries/search supports both ?q= and ?search= parameter", async () => {
      const resWithQ = await request(app)
        .get("/api/entries/search?q=API")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`);

      assert.equal(resWithQ.status, 200);
      assert.equal(resWithQ.body.ok, true);

      const resWithSearch = await request(app)
        .get("/api/entries/search?search=API")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`);

      assert.equal(resWithSearch.status, 200);
      assert.equal(resWithSearch.body.ok, true);
    });

    test("GET /api/entries/calendar responds with monthly aggregates", async () => {
      const res = await request(app)
        .get("/api/entries/calendar?month=2026-10")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.year, 2026);
    });

    test("GET /api/entries/on-this-day returns past memories", async () => {
      const res = await request(app)
        .get("/api/entries/on-this-day")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(Array.isArray(res.body.entries));
    });
  });

  describe("Categories Endpoints", () => {
    test("POST /api/categories creates category", async () => {
      const res = await request(app)
        .post("/api/categories")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`)
        .send({ name: "API Category" });

      assert.equal(res.status, 201);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.category.name, "API Category");
      createdCategoryId = res.body.category._id;
    });

    test("GET /api/categories lists categories", async () => {
      const res = await request(app)
        .get("/api/categories")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(res.body.categories.length >= 1);
    });

    test("PATCH /api/categories/:id updates category", async () => {
      const res = await request(app)
        .patch(`/api/categories/${createdCategoryId}`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`)
        .send({ name: "Updated Category" });

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.category.name, "Updated Category");
    });

    test("DELETE /api/categories/:id deletes category", async () => {
      const res = await request(app)
        .delete(`/api/categories/${createdCategoryId}`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.deleted, true);
    });
  });

  describe("Export Endpoints", () => {
    test("GET /api/export/entry/:id/txt exports single entry as text", async () => {
      const res = await request(app)
        .get(`/api/export/entry/${createdEntryId}/txt`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.headers["content-type"].includes("text/plain"));
      assert.ok(res.text.includes("Updated API Entry"));
    });

    test("GET /api/export/entry/:id/md exports single entry as markdown", async () => {
      const res = await request(app)
        .get(`/api/export/entry/${createdEntryId}/md`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.headers["content-type"].includes("text/markdown"));
      assert.ok(res.text.includes("## Updated API Entry"));
    });

    test("GET /api/export/entry/:id/docx exports single entry as docx binary", async () => {
      const res = await request(app)
        .get(`/api/export/entry/${createdEntryId}/docx`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.headers["content-type"].includes("wordprocessingml"));
    });
  });

  describe("Backup Endpoints", () => {
    test("GET /api/backup exports entire diary data", async () => {
      const res = await request(app)
        .get("/api/backup")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(Array.isArray(res.body.entries));
    });

    test("POST /api/backup/delete-all requires correct PIN and wipes entries", async () => {
      // Wrong PIN
      const failRes = await request(app)
        .post("/api/backup/delete-all")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`)
        .send({ pin: "0000" });

      assert.equal(failRes.status, 401);

      // Correct PIN
      const successRes = await request(app)
        .post("/api/backup/delete-all")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${sessionToken}`)
        .send({ pin: testPin });

      assert.equal(successRes.status, 200);
      assert.equal(successRes.body.ok, true);
      assert.equal(successRes.body.deleted, true);

      // Verify entries wiped
      const entries = await Entry.find({ visitorId });
      assert.equal(entries.length, 0);
    });
  });

  describe("Public Endpoints", () => {
    test("GET /api/public/entries returns public entries without auth", async () => {
      const res = await request(app)
        .get("/api/public/entries")
        .set("Origin", TRUSTED_ORIGIN);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(Array.isArray(res.body.entries));
    });

    test("GET /api/public/quotes returns public quotes", async () => {
      const res = await request(app)
        .get("/api/public/quotes")
        .set("Origin", TRUSTED_ORIGIN);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(Array.isArray(res.body.entries));
    });

    test("GET /api/public/categories returns category statistics", async () => {
      const res = await request(app)
        .get("/api/public/categories")
        .set("Origin", TRUSTED_ORIGIN);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(Array.isArray(res.body.categories));
    });
  });
});

