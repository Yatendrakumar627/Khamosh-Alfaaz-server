import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAndSortEntries,
  buildTxtBuffer,
  buildMdBuffer,
  buildDocxBuffer,
  buildPdfBuffer,
  writeTemp,
} from "../services/exportService.js";

describe("Export Service Unit Tests", () => {
  const sampleEntries = [
    {
      title: "First Diary",
      content: "This is the first diary entry.",
      type: "diary",
      tags: ["memory", "peace"],
      entryDate: new Date("2026-01-01T10:00:00Z"),
      createdAt: new Date("2026-01-01T10:00:00Z"),
    },
    {
      title: "Second Thought",
      content: "This is a quiet thought about life.",
      type: "thought",
      tags: ["life"],
      entryDate: new Date("2026-02-15T10:00:00Z"),
      createdAt: new Date("2026-02-15T10:00:00Z"),
    },
    {
      title: "Third Quote",
      content: "Khamosh Alfaaz holds silent power.",
      type: "quote",
      tags: ["quote"],
      entryDate: new Date("2026-03-20T10:00:00Z"),
      createdAt: new Date("2026-03-20T10:00:00Z"),
    },
  ];

  describe("normalizeAndSortEntries", () => {
    test("sorts descending (newest first) by default", () => {
      const sorted = normalizeAndSortEntries(sampleEntries, "newest");
      assert.equal(sorted[0].title, "Third Quote");
      assert.equal(sorted[2].title, "First Diary");
    });

    test("sorts ascending (oldest first) when requested", () => {
      const sorted = normalizeAndSortEntries(sampleEntries, "oldest");
      assert.equal(sorted[0].title, "First Diary");
      assert.equal(sorted[2].title, "Third Quote");
    });

    test("handles empty or non-array inputs safely", () => {
      assert.deepEqual(normalizeAndSortEntries([]), []);
      assert.deepEqual(normalizeAndSortEntries(null), []);
      assert.deepEqual(normalizeAndSortEntries(undefined), []);
    });
  });

  describe("buildTxtBuffer", () => {
    test("generates plain text buffer containing headers and entries", () => {
      const buffer = buildTxtBuffer({
        entries: sampleEntries,
        visitorName: "Test User",
        sortOrder: "newest",
      });
      assert.ok(Buffer.isBuffer(buffer));
      const str = buffer.toString("utf-8");
      assert.ok(str.includes("KHAMOSH ALFAAZ"));
      assert.ok(str.includes("A quiet diary of Test User"));
      assert.ok(str.includes("First Diary"));
      assert.ok(str.includes("This is a quiet thought about life."));
    });
  });

  describe("buildMdBuffer", () => {
    test("generates markdown buffer with titles, tags and formatted dates", () => {
      const buffer = buildMdBuffer({
        entries: sampleEntries,
        visitorName: "Ahmad",
        sortOrder: "oldest",
      });
      assert.ok(Buffer.isBuffer(buffer));
      const str = buffer.toString("utf-8");
      assert.ok(str.includes("# Khamosh Alfaaz"));
      assert.ok(str.includes("## First Diary"));
      assert.ok(str.includes("`#peace`"));
    });
  });

  describe("buildDocxBuffer", () => {
    test("generates a valid DOCX buffer", async () => {
      const buffer = await buildDocxBuffer({
        title: "My Diary",
        entries: sampleEntries,
        visitorName: "Docx Writer",
      });
      assert.ok(Buffer.isBuffer(buffer));
      assert.ok(buffer.length > 1000);
      // DOCX files are zip archives starting with PK (0x50 0x4B)
      assert.equal(buffer[0], 0x50);
      assert.equal(buffer[1], 0x4b);
    });
  });

  describe("buildPdfBuffer", () => {
    test("generates a valid PDF buffer", async () => {
      const buffer = await buildPdfBuffer({
        title: "My Diary",
        entries: sampleEntries,
        visitorName: "PDF Writer",
      });
      assert.ok(Buffer.isBuffer(buffer));
      assert.ok(buffer.length > 1000);
      // PDF files start with %PDF- (0x25 0x50 0x44 0x46)
      assert.equal(buffer.toString("utf-8", 0, 5), "%PDF-");
    });
  });

  describe("writeTemp", () => {
    test("writes temporary file and cleanup removes it", async () => {
      const buffer = Buffer.from("Temporary test content", "utf-8");
      const { file, cleanup } = await writeTemp(buffer, ".txt");
      assert.ok(file.endsWith(".txt"));
      const fs = await import("node:fs/promises");
      const read = await fs.readFile(file, "utf-8");
      assert.equal(read, "Temporary test content");

      await cleanup();
      const exists = await fs.access(file).then(() => true).catch(() => false);
      assert.equal(exists, false);
    });
  });
});

