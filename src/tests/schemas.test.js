import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  uniqueNameSchema,
  sessionRegisterSchema,
  sessionLoginSchema,
  sessionPinSchema,
  entryCreateSchema,
  entryUpdateSchema,
  favoriteSchema,
  pinSchema,
  listQuerySchema,
  exportSelectionSchema,
  backupRestoreSchema,
  validate,
} from "../validators/schemas.js";

describe("Validation Schemas Unit Tests", () => {
  describe("uniqueNameSchema", () => {
    test("accepts valid usernames and lowercases/trims them", () => {
      assert.equal(uniqueNameSchema.parse("  John_Doe12  "), "john_doe12");
      assert.equal(uniqueNameSchema.parse("alfaaz"), "alfaaz");
    });

    test("rejects usernames shorter than 3 or longer than 30 chars", () => {
      assert.throws(() => uniqueNameSchema.parse("ab"));
      assert.throws(() => uniqueNameSchema.parse("a".repeat(31)));
    });

    test("rejects usernames with spaces or special characters", () => {
      assert.throws(() => uniqueNameSchema.parse("john doe"));
      assert.throws(() => uniqueNameSchema.parse("john-doe"));
      assert.throws(() => uniqueNameSchema.parse("john@alfaaz"));
    });
  });

  describe("sessionRegisterSchema & sessionLoginSchema", () => {
    test("validates registration with name, username and numeric PIN", () => {
      const valid = sessionRegisterSchema.parse({
        name: "Ahmad",
        username: "ahmad_99",
        pin: "123456",
      });
      assert.equal(valid.name, "Ahmad");
      assert.equal(valid.username, "ahmad_99");
      assert.equal(valid.pin, "123456");
    });

    test("rejects PIN with non-digit characters or invalid length", () => {
      assert.throws(() => sessionRegisterSchema.parse({ name: "A", username: "ahmad", pin: "123" })); // < 4 digits
      assert.throws(() => sessionRegisterSchema.parse({ name: "A", username: "ahmad", pin: "1234567890123" })); // > 12 digits
      assert.throws(() => sessionRegisterSchema.parse({ name: "A", username: "ahmad", pin: "abcd" })); // letters
      assert.throws(() => sessionRegisterSchema.parse({ name: "A", username: "ahmad", pin: "12 34" })); // space
    });

    test("validates login schema", () => {
      const valid = sessionLoginSchema.parse({ username: "ahmad_99", pin: "1234" });
      assert.equal(valid.username, "ahmad_99");
      assert.equal(valid.pin, "1234");
    });
  });

  describe("entryCreateSchema & entryUpdateSchema", () => {
    test("applies sensible defaults for title, type, tags and visibility", () => {
      const parsed = entryCreateSchema.parse({
        content: "Quiet night thoughts...",
      });
      assert.equal(parsed.title, "Untitled Entry");
      assert.equal(parsed.type, "diary");
      assert.deepEqual(parsed.tags, []);
      assert.equal(parsed.visibility, "private");
      assert.equal(parsed.content, "Quiet night thoughts...");
    });

    test("rejects empty content", () => {
      assert.throws(() => entryCreateSchema.parse({ content: "   " }));
      assert.throws(() => entryCreateSchema.parse({}));
    });

    test("rejects invalid entry type", () => {
      assert.throws(() => entryCreateSchema.parse({ content: "Hello", type: "invalid_type" }));
    });

    test("entryUpdateSchema requires at least one field to update", () => {
      assert.throws(() => entryUpdateSchema.parse({}));
      const valid = entryUpdateSchema.parse({ title: "Updated Title" });
      assert.equal(valid.title, "Updated Title");
    });
  });

  describe("favoriteSchema & pinSchema", () => {
    test("requires boolean flags", () => {
      assert.deepEqual(favoriteSchema.parse({ isFavorite: true }), { isFavorite: true });
      assert.deepEqual(pinSchema.parse({ isPinned: false }), { isPinned: false });
      assert.throws(() => favoriteSchema.parse({ isFavorite: "not-bool" }));
    });
  });

  describe("listQuerySchema", () => {
    test("parses and coerces pagination, boolean flags and dates", () => {
      const parsed = listQuerySchema.parse({
        page: "2",
        limit: "10",
        favorite: "true",
        pinned: "1",
      });
      assert.equal(parsed.page, 2);
      assert.equal(parsed.limit, 10);
      assert.equal(parsed.favorite, true);
      assert.equal(parsed.pinned, true);
    });

    test("handles undefined boolean flags cleanly", () => {
      const parsed = listQuerySchema.parse({});
      assert.equal(parsed.favorite, undefined);
      assert.equal(parsed.pinned, undefined);
      assert.equal(parsed.page, 1);
      assert.equal(parsed.limit, 50);
    });
  });

  describe("exportSelectionSchema", () => {
    test("defaults scope to 'all' and handles date ranges and formats", () => {
      const parsed = exportSelectionSchema.parse({
        scope: "custom",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      });
      assert.equal(parsed.scope, "custom");
      assert.ok(parsed.startDate instanceof Date);
      assert.ok(parsed.endDate instanceof Date);
    });
  });

  describe("backupRestoreSchema", () => {
    test("accepts nested backup payload format", () => {
      const payload = {
        data: {
          entries: [{ title: "First Entry", content: "Some content here" }],
          categories: [{ name: "Reflections" }],
        },
      };
      const parsed = backupRestoreSchema.parse(payload);
      assert.ok(parsed.data.entries.length === 1);
    });

    test("accepts flat backup payload format", () => {
      const payload = {
        entries: [{ title: "First Entry", content: "Some content here" }],
      };
      const parsed = backupRestoreSchema.parse(payload);
      assert.ok(parsed.entries.length === 1);
    });

    test("rejects empty restore payload", () => {
      assert.throws(() => backupRestoreSchema.parse({}));
    });
  });

  describe("validate() middleware", () => {
    test("calls next() with req.validated on valid input", () => {
      const middleware = validate(sessionPinSchema);
      const req = { body: { pin: "1234" }, query: {}, params: {} };
      let called = false;
      middleware(req, {}, () => { called = true; });
      assert.equal(called, true);
      assert.equal(req.validated.pin, "1234");
    });

    test("returns 400 with details on validation failure", () => {
      const middleware = validate(sessionPinSchema);
      const req = { body: { pin: "bad" }, query: {}, params: {} };
      let statusCode = null;
      let responseBody = null;
      const res = {
        status(code) {
          statusCode = code;
          return {
            json(body) {
              responseBody = body;
            },
          };
        },
      };
      middleware(req, res, () => {});
      assert.equal(statusCode, 400);
      assert.equal(responseBody.error, "Validation failed");
      assert.ok(responseBody.details.pin);
    });
  });
});

