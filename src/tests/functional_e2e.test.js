import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../app.js";
import { connectDB } from "../config/db.js";
import Visitor from "../models/Visitor.js";
import Entry from "../models/Entry.js";
import Category from "../models/Category.js";

describe("Comprehensive End-to-End Functional Test Suite", () => {
  const app = createApp();
  const TRUSTED_ORIGIN = "https://khamosh-alfaaz-client.vercel.app";
  const timestamp = Date.now();
  const testUser = {
    name: "Functional Test User",
    username: `funcuser_${timestamp}`,
    pin: "876543",
  };

  let token = null;
  let visitorId = null;
  let privateEntryId = null;
  let publicEntryId = null;
  let categoryId = null;

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

  describe("1. User Registration, Authentication & Session Security", () => {
    test("User can check username availability before registering", async () => {
      const res = await request(app)
        .get(`/api/session/username?username=${testUser.username}`)
        .set("Origin", TRUSTED_ORIGIN);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.available, true);
    });

    test("User can register with valid name, unique username, and numeric PIN", async () => {
      const res = await request(app)
        .post("/api/session")
        .set("Origin", TRUSTED_ORIGIN)
        .send(testUser);

      assert.equal(res.status, 201);
      assert.equal(res.body.ok, true);
      assert.ok(res.body.token);
      assert.equal(res.body.visitor.name, testUser.name);
      assert.equal(res.body.visitor.hasCredentials, true);

      token = res.body.token;
      visitorId = res.body.visitor.id;
    });

    test("System rejects duplicate registration with the same username (case-insensitive)", async () => {
      const res = await request(app)
        .post("/api/session")
        .set("Origin", TRUSTED_ORIGIN)
        .send({
          name: "Duplicate User",
          username: testUser.username.toUpperCase(),
          pin: "123456",
        });

      assert.equal(res.status, 409);
      assert.match(res.body.error, /Username already taken/i);
    });

    test("User can log in with correct username and PIN", async () => {
      const res = await request(app)
        .post("/api/session/login")
        .set("Origin", TRUSTED_ORIGIN)
        .send({
          username: testUser.username,
          pin: testUser.pin,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(res.body.token);
      assert.equal(res.body.visitor.name, testUser.name);
      // Update active token
      token = res.body.token;
    });

    test("System rejects login with incorrect PIN", async () => {
      const res = await request(app)
        .post("/api/session/login")
        .set("Origin", TRUSTED_ORIGIN)
        .send({
          username: testUser.username,
          pin: "000000",
        });

      assert.equal(res.status, 401);
      assert.match(res.body.error, /Invalid username or PIN/i);
    });

    test("Protected routes reject unauthorized requests when token is absent", async () => {
      const res = await request(app)
        .get("/api/session")
        .set("Origin", TRUSTED_ORIGIN);

      assert.equal(res.status, 401);
    });

    test("Authenticated user can view and update their profile display name", async () => {
      const getRes = await request(app)
        .get("/api/session")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(getRes.status, 200);
      assert.equal(getRes.body.visitor.name, testUser.name);

      const patchRes = await request(app)
        .patch("/api/session/name")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Ahmad Noor" });

      assert.equal(patchRes.status, 200);
      assert.equal(patchRes.body.visitor.name, "Ahmad Noor");
    });
  });

  describe("2. Entry Lifecycle (Creation, Visibility, Updating, Tagging, Pinning)", () => {
    test("User creates a private diary entry with tags", async () => {
      const res = await request(app)
        .post("/api/entries")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Secret Reflections",
          content: "This is a strictly confidential diary entry that should never be public.",
          type: "diary",
          tags: ["confidential", "night"],
          visibility: "private",
          entryDate: "2026-06-15T22:00:00.000Z",
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.entry.title, "Secret Reflections");
      assert.equal(res.body.entry.visibility, "private");
      privateEntryId = res.body.entry._id;
    });

    test("User creates a public quote entry", async () => {
      const res = await request(app)
        .post("/api/entries")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Words of Silence",
          content: "Silence is often the loud cry of the soul.",
          type: "quote",
          tags: ["wisdom", "silence"],
          visibility: "public",
          entryDate: "2026-06-16T10:00:00.000Z",
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.entry.visibility, "public");
      publicEntryId = res.body.entry._id;
    });

    test("User retrieves entry by ID along with adjacent prev/next entries", async () => {
      const res = await request(app)
        .get(`/api/entries/${privateEntryId}`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.entry.title, "Secret Reflections");
      assert.ok(res.body.entry.nextEntry);
    });

    test("User updates an existing entry", async () => {
      const res = await request(app)
        .patch(`/api/entries/${privateEntryId}`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Secret Reflections (Revised)",
          content: "Updated private reflection content.",
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.entry.title, "Secret Reflections (Revised)");
    });

    test("User toggles favorite and pinned status", async () => {
      const favRes = await request(app)
        .patch(`/api/entries/${privateEntryId}/favorite`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`)
        .send({ isFavorite: true });

      assert.equal(favRes.status, 200);
      assert.equal(favRes.body.entry.isFavorite, true);

      const pinRes = await request(app)
        .patch(`/api/entries/${privateEntryId}/pin`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`)
        .send({ isPinned: true });

      assert.equal(pinRes.status, 200);
      assert.equal(pinRes.body.entry.isPinned, true);
    });
  });

  describe("3. Search, Filtering, Calendar, & Past Memories", () => {
    test("User searches entries using full-text search", async () => {
      const res = await request(app)
        .get("/api/entries/search?q=confidential")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.entries.length >= 1);
      assert.equal(res.body.entries[0]._id, privateEntryId);
    });

    test("User filters entries by type", async () => {
      const quoteRes = await request(app)
        .get("/api/entries?type=quote")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(quoteRes.status, 200);
      assert.equal(quoteRes.body.entries.length, 1);
      assert.equal(quoteRes.body.entries[0]._id, publicEntryId);
    });

    test("User filters entries by favorite status", async () => {
      const res = await request(app)
        .get("/api/entries?favorite=true")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.entries.length, 1);
      assert.equal(res.body.entries[0]._id, privateEntryId);
    });

    test("User fetches monthly calendar heatmap and rejects invalid month queries", async () => {
      const validRes = await request(app)
        .get("/api/entries/calendar?month=2026-06")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(validRes.status, 200);
      assert.equal(validRes.body.year, 2026);
      assert.ok(validRes.body.entries.length >= 1);
      assert.ok(Object.keys(validRes.body.byDay).length >= 1);

      const invalidRes = await request(app)
        .get("/api/entries/calendar?month=2026-15")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(invalidRes.status, 400);
    });

    test("User fetches 'On This Day' memories", async () => {
      const res = await request(app)
        .get("/api/entries/on-this-day")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.entries));
    });
  });

  describe("4. Category Management & Edge Case Handling", () => {
    test("User creates custom category", async () => {
      const res = await request(app)
        .post("/api/categories")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Personal Growth" });

      assert.equal(res.status, 201);
      assert.equal(res.body.category.name, "Personal Growth");
      categoryId = res.body.category._id;
    });

    test("System deduplicates category creation case-insensitively without throwing 500", async () => {
      const res = await request(app)
        .post("/api/categories")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "personal growth" });

      assert.equal(res.status, 200);
      assert.equal(res.body.created, false);
      assert.equal(res.body.category.name, "Personal Growth");
    });

    test("User lists categories", async () => {
      const res = await request(app)
        .get("/api/categories")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.categories.some((c) => c.name === "Personal Growth"));
    });

    test("User updates category name", async () => {
      const res = await request(app)
        .patch(`/api/categories/${categoryId}`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Inner Peace" });

      assert.equal(res.status, 200);
      assert.equal(res.body.category.name, "Inner Peace");
    });

    test("User deletes category", async () => {
      const res = await request(app)
        .delete(`/api/categories/${categoryId}`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.deleted, true);
    });
  });

  describe("5. Export Engine (DOCX, PDF, Plain Text, Markdown)", () => {
    test("User exports single entry as DOCX with valid binary format", async () => {
      const res = await request(app)
        .get(`/api/export/entry/${publicEntryId}/docx`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => cb(null, Buffer.concat(chunks)));
        })
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.ok(res.headers["content-type"].includes("wordprocessingml"));
      assert.ok(res.body.length > 500);
      assert.equal(res.body[0], 0x50); // PK header
    });

    test("User exports single entry as PDF with valid binary format", async () => {
      const res = await request(app)
        .get(`/api/export/entry/${publicEntryId}/pdf`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.equal(res.headers["content-type"], "application/pdf");
      assert.ok(res.body.length > 500);
      assert.equal(res.body.toString("utf-8", 0, 5), "%PDF-");
    });

    test("User exports single entry as Plain Text", async () => {
      const res = await request(app)
        .get(`/api/export/entry/${publicEntryId}/txt`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.ok(res.headers["content-type"].includes("text/plain"));
      assert.ok(res.text.includes("Words of Silence"));
      assert.ok(res.text.includes("Silence is often the loud cry of the soul."));
    });

    test("User exports single entry as Markdown", async () => {
      const res = await request(app)
        .get(`/api/export/entry/${publicEntryId}/md`)
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.ok(res.headers["content-type"].includes("text/markdown"));
      assert.ok(res.text.includes("## Words of Silence"));
    });

    test("User exports bulk entries with date sort order (Newest first)", async () => {
      const res = await request(app)
        .post("/api/export/txt")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`)
        .send({ scope: "all", sortOrder: "newest" });

      assert.equal(res.status, 200);
      assert.ok(res.text.includes("Total Entries: 2"));
      assert.ok(res.text.indexOf("Words of Silence") < res.text.indexOf("Secret Reflections"));
    });
  });

  describe("6. Public / Visitor Mode & Absolute Privacy Isolation", () => {
    test("Unauthenticated visitor only sees public entries (NEVER private)", async () => {
      const res = await request(app)
        .get("/api/public/entries")
        .set("Origin", TRUSTED_ORIGIN);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.entries));

      const foundPrivate = res.body.entries.some((e) => e._id === privateEntryId || e.title.includes("Secret Reflections"));
      assert.equal(foundPrivate, false, "CRITICAL: Private entry was leaked in public entries list!");

      const foundPublic = res.body.entries.some((e) => e._id === publicEntryId);
      assert.equal(foundPublic, true);
    });

    test("Public entries response strictly strips internal/sensitive metadata", async () => {
      const res = await request(app)
        .get(`/api/public/entries/${publicEntryId}`)
        .set("Origin", TRUSTED_ORIGIN);

      assert.equal(res.status, 200);
      const entry = res.body.entry;
      assert.equal(entry.visitorId, undefined, "visitorId must not leak");
      assert.equal(entry.isFavorite, undefined, "isFavorite must not leak");
      assert.equal(entry.isPinned, undefined, "isPinned must not leak");
      assert.equal(entry.__v, undefined, "__v must not leak");
    });

    test("Attempting to access private entry via public endpoint returns 404", async () => {
      const res = await request(app)
        .get(`/api/public/entries/${privateEntryId}`)
        .set("Origin", TRUSTED_ORIGIN);

      assert.equal(res.status, 404);
    });

    test("Public quotes endpoint lists only public quote entries", async () => {
      const res = await request(app)
        .get("/api/public/quotes")
        .set("Origin", TRUSTED_ORIGIN);

      assert.equal(res.status, 200);
      assert.ok(res.body.entries.every((e) => e.type === "quote"));
    });
  });

  describe("7. Backup, Restore, and Destructive PIN Protection", () => {
    let backupData = null;

    test("User exports complete JSON backup", async () => {
      const res = await request(app)
        .get("/api/backup")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.version, "1.0");
      assert.ok(res.body.entries.length >= 2);
      backupData = res.body;
    });

    test("Destructive delete-all endpoint rejects incorrect PIN", async () => {
      const res = await request(app)
        .post("/api/backup/delete-all")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`)
        .send({ pin: "000000" });

      assert.equal(res.status, 401);
      assert.match(res.body.error, /PIN is incorrect/i);

      // Verify entries are still intact
      const count = await Entry.countDocuments({ visitorId });
      assert.ok(count >= 2);
    });

    test("Destructive delete-all succeeds with correct PIN and wipes user data", async () => {
      const res = await request(app)
        .post("/api/backup/delete-all")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`)
        .send({ pin: testUser.pin });

      assert.equal(res.status, 200);
      assert.equal(res.body.deleted, true);

      // Verify entries wiped
      const count = await Entry.countDocuments({ visitorId });
      assert.equal(count, 0);
    });

    test("User restores entries from backup file", async () => {
      const res = await request(app)
        .post("/api/backup/restore")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`)
        .send(backupData);

      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.restored, true);

      // Verify entries restored
      const count = await Entry.countDocuments({ visitorId });
      assert.equal(count, backupData.entries.length);
    });
  });

  describe("8. Session Deletion & Logout Security", () => {
    test("User logs out and deletes session", async () => {
      const res = await request(app)
        .delete("/api/session")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.loggedOut, true);
    });

    test("Revoked token is rejected on subsequent calls", async () => {
      const res = await request(app)
        .get("/api/session")
        .set("Origin", TRUSTED_ORIGIN)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 401);
    });
  });
});
