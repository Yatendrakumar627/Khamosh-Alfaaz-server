import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Visitor from "../models/Visitor.js";
import Entry from "../models/Entry.js";
import Category from "../models/Category.js";
import * as sessionService from "../services/sessionService.js";
import * as entryService from "../services/entryService.js";
import * as categoryService from "../services/categoryService.js";
import * as publicService from "../services/publicService.js";
import * as backupService from "../services/backupService.js";

describe("Backend Services Unit & Integration Tests", () => {
  let testVisitor;
  const testUsername = `testuser_${Date.now()}`;

  before(async () => {
    await connectDB();
    // Clean up any test artifacts
    await Visitor.deleteMany({ username: new RegExp("^testuser_") });
    // Create test user
    const res = await sessionService.registerVisitor({
      name: "Unit Test User",
      username: testUsername,
      pin: "9876",
    });
    testVisitor = res.visitor;
  });

  after(async () => {
    if (testVisitor) {
      await Entry.deleteMany({ visitorId: testVisitor._id });
      await Category.deleteMany({ visitorId: testVisitor._id });
      await Visitor.deleteOne({ _id: testVisitor._id });
    }
    await mongoose.disconnect();
  });

  describe("sessionService", () => {
    test("getSession retrieves user and credential status", async () => {
      const session = await sessionService.getSession(testVisitor._id);
      assert.equal(session.name, "Unit Test User");
      assert.equal(session.hasCredentials, true);
    });

    test("authenticateVisitor successfully verifies correct PIN", async () => {
      const auth = await sessionService.authenticateVisitor({
        username: testUsername,
        pin: "9876",
      });
      assert.equal(auth.visitor.name, "Unit Test User");
    });

    test("authenticateVisitor rejects wrong PIN", async () => {
      await assert.rejects(
        async () => {
          await sessionService.authenticateVisitor({
            username: testUsername,
            pin: "1111",
          });
        },
        /Invalid username or PIN/,
      );
    });

    test("isUsernameAvailable returns false for taken and true for untaken", async () => {
      const taken = await sessionService.isUsernameAvailable(testUsername);
      assert.equal(taken, false);
      const available = await sessionService.isUsernameAvailable(`unregistered_${Date.now()}`);
      assert.equal(available, true);
    });

    test("updateName updates visitor name in DB", async () => {
      const updated = await sessionService.updateName(testVisitor._id, "Updated Test Name");
      assert.equal(updated.name, "Updated Test Name");
    });
  });

  describe("categoryService", () => {
    let catId;

    test("createCategory creates new category", async () => {
      const res = await categoryService.createCategory(testVisitor._id, "Reflections");
      assert.equal(res.created, true);
      assert.equal(res.category.name, "Reflections");
      catId = res.category._id;
    });

    test("createCategory prevents duplicate case-insensitive creation", async () => {
      const res = await categoryService.createCategory(testVisitor._id, "reflections");
      assert.equal(res.created, false);
      assert.equal(res.category.name, "Reflections");
    });

    test("createCategory rejects empty or whitespace name", async () => {
      await assert.rejects(
        async () => {
          await categoryService.createCategory(testVisitor._id, "   ");
        },
        /Category name is required/,
      );
    });

    test("updateCategory updates category name", async () => {
      const updated = await categoryService.updateCategory(testVisitor._id, catId, "Deep Reflections");
      assert.equal(updated.name, "Deep Reflections");
    });

    test("listCategories returns sorted list", async () => {
      const list = await categoryService.listCategories(testVisitor._id);
      assert.ok(list.length >= 1);
      assert.equal(list[0].name, "Deep Reflections");
    });

    test("deleteCategory removes category", async () => {
      const res = await categoryService.deleteCategory(testVisitor._id, catId);
      assert.equal(res.deleted, true);
    });
  });

  describe("entryService", () => {
    let entryId1;
    let entryId2;

    test("createEntry creates entry with proper fields", async () => {
      const e1 = await entryService.createEntry(testVisitor._id, {
        title: "Morning Thoughts",
        content: "Quiet dawn broke today.",
        type: "diary",
        tags: ["morning", "peace"],
        visibility: "private",
        entryDate: new Date("2026-05-10T08:00:00Z"),
      });
      assert.ok(e1._id);
      assert.equal(e1.title, "Morning Thoughts");
      entryId1 = e1._id;

      const e2 = await entryService.createEntry(testVisitor._id, {
        title: "Inspiring Quote",
        content: "Silence is the sanctuary of thought.",
        type: "quote",
        tags: ["silence"],
        visibility: "public",
        entryDate: new Date("2026-05-10T12:00:00Z"),
      });
      entryId2 = e2._id;
    });

    test("getEntry retrieves entry and prev/next links", async () => {
      const entry = await entryService.getEntry(testVisitor._id, entryId1);
      assert.equal(entry.title, "Morning Thoughts");
      assert.ok(entry.nextEntry);
    });

    test("toggleFavorite and togglePinned update boolean flags", async () => {
      const fav = await entryService.toggleFavorite(testVisitor._id, entryId1, true);
      assert.equal(fav.isFavorite, true);

      const pinned = await entryService.togglePinned(testVisitor._id, entryId1, true);
      assert.equal(pinned.isPinned, true);
    });

    test("listEntries handles both type=diary and date without dropping either filter ($or fix verification)", async () => {
      const res = await entryService.listEntries(testVisitor._id, {
        type: "diary",
        date: "2026-05-10",
      });
      // Should find only the diary entry, NOT the quote entry
      assert.equal(res.entries.length, 1);
      assert.equal(res.entries[0]._id.toString(), entryId1.toString());
      assert.equal(res.entries[0].type, "diary");
    });

    test("calendarEntries validates month format properly (rejecting month > 12)", async () => {
      await assert.rejects(
        async () => {
          await entryService.calendarEntries(testVisitor._id, "2026-13");
        },
        /month query must be YYYY-MM/,
      );

      const res = await entryService.calendarEntries(testVisitor._id, "2026-05");
      assert.equal(res.year, 2026);
      assert.equal(res.entries.length, 2);
    });

    test("onThisDay finds past year memories", async () => {
      const res = await entryService.onThisDay(testVisitor._id);
      assert.ok(Array.isArray(res.entries));
    });

    test("updateEntry modifies content", async () => {
      const updated = await entryService.updateEntry(testVisitor._id, entryId1, {
        title: "Morning Thoughts (Edited)",
      });
      assert.equal(updated.title, "Morning Thoughts (Edited)");
    });
  });

  describe("publicService", () => {
    test("listPublicEntries returns public entries without exposing visitorId", async () => {
      const res = await publicService.listPublicEntries();
      assert.ok(res.entries.length >= 1);
      res.entries.forEach((e) => {
        assert.equal(e.visitorId, undefined);
        assert.equal(e.visibility, "public");
      });
    });

    test("publicQuotes returns quotes", async () => {
      const res = await publicService.publicQuotes(10);
      assert.ok(Array.isArray(res.entries));
    });

    test("publicCategories returns type aggregates", async () => {
      const res = await publicService.publicCategories();
      assert.ok(Array.isArray(res.categories));
    });
  });

  describe("backupService", () => {
    test("exportBackup returns clean JSON structure", async () => {
      const backup = await backupService.exportBackup(testVisitor._id);
      assert.equal(backup.ok, true);
      assert.equal(backup.version, "1.0");
      assert.ok(Array.isArray(backup.entries));
      assert.ok(backup.entries.length >= 2);
    });

    test("restoreBackup restores entries cleanly", async () => {
      const payload = {
        entries: [
          {
            title: "Restored Entry 1",
            content: "Content from restore test",
            type: "thought",
            entryDate: new Date(),
          },
        ],
        categories: [{ name: "Restored Cat" }],
      };

      const result = await backupService.restoreBackup(testVisitor._id, payload, { wipeFirst: true });
      assert.equal(result.restored, true);
      assert.equal(result.entries, 1);
      assert.equal(result.categories, 1);

      const remaining = await Entry.find({ visitorId: testVisitor._id });
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].title, "Restored Entry 1");
    });
  });
});

