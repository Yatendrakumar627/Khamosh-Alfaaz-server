import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, teardown, req, newAgent } from "./test-utils.js";
import Visitor from "../models/Visitor.js";
import Entry from "../models/Entry.js";
import Session from "../models/Session.js";
import { generateSessionId, hashToken } from "../utils/crypto.js";

async function register(agent, username = "writer_one", pin = "1234", name = "Test Writer") {
  return agent.post("/api/session").send({ name, username, pin });
}

describe("Khamosh Alfaaz API", () => {
  let a;

  before(async () => {
    await setup();
    a = await newAgent();
    const registered = await register(a);
    assert.strictEqual(registered.status, 201);
  });

  after(async () => {
    await teardown();
  });

  it("health", async () => {
    const res = await req().get("/api/health");
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.status, "healthy");
  });

  it("creates a credential-protected session", async () => {
    const res = await a.get("/api/session");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.visitor.name, "Test Writer");
    assert.strictEqual(res.body.visitor.hasCredentials, true);
  });

  it("rejects a duplicate private username", async () => {
    const res = await req().post("/api/session").send({
      name: "Duplicate",
      username: "writer_one",
      pin: "9999",
    });
    assert.strictEqual(res.status, 409);
  });

  it("checks private username availability", async () => {
    const available = await req().get("/api/session/username").query({ username: "available_writer" });
    const taken = await req().get("/api/session/username").query({ username: "writer_one" });
    assert.strictEqual(available.status, 200);
    assert.strictEqual(available.body.available, true);
    assert.strictEqual(taken.body.available, false);
  });

  it("rejects an incorrect PIN and accepts a login", async () => {
    const wrong = await req().post("/api/session/login").send({
      username: "writer_one",
      pin: "0000",
    });
    assert.strictEqual(wrong.status, 401);

    const login = await req().post("/api/session/login").send({
      username: "writer_one",
      pin: "1234",
    });
    assert.strictEqual(login.status, 200);
    assert.strictEqual(login.body.visitor.hasCredentials, true);
  });

  it("updates the session display name", async () => {
    const res = await a.patch("/api/session/name").send({ name: "Renamed Writer" });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.visitor.name, "Renamed Writer");
    assert.strictEqual(res.body.name, "Renamed Writer");

    const session = await a.get("/api/session");
    assert.strictEqual(session.body.visitor.name, "Renamed Writer");
  });

  it("rejects unauthenticated access", async () => {
    const res = await req().get("/api/entries");
    assert.strictEqual(res.status, 401);
  });

  it("claims an existing anonymous session without losing entries", async () => {
    const legacyVisitor = await Visitor.create({ name: "Legacy Writer" });
    await Entry.create({
      visitorId: legacyVisitor._id,
      title: "Legacy Entry",
      content: "Keep this entry after adding credentials.",
      type: "diary",
    });
    const rawToken = generateSessionId();
    await Session.create({
      visitorId: legacyVisitor._id,
      sessionId: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const legacyAgent = await newAgent();
    legacyAgent.set("Cookie", `dhsid=${rawToken}`);
    const claim = await legacyAgent.post("/api/session").send({
      name: "Legacy Writer",
      username: "legacy_writer",
      pin: "2222",
    });
    assert.strictEqual(claim.status, 200);

    const list = await legacyAgent.get("/api/entries");
    assert.strictEqual(list.status, 200);
    assert.ok(list.body.entries.some((entry) => entry.title === "Legacy Entry"));
  });

  it("creates and lists entries", async () => {
    const create = await a.post("/api/entries").send({
      title: "Hello",
      content: "Today was a quiet day.",
      type: "diary",
      tags: ["personal", "today"],
    });
    assert.strictEqual(create.status, 201);
    assert.strictEqual(create.body.entry.title, "Hello");

    const list = await a.get("/api/entries");
    assert.strictEqual(list.body.ok, true);
    assert.strictEqual(list.body.entries.length, 1);
    assert.strictEqual(list.body.pagination.total, 1);
  });

  it("lists unfiltered entries even when favorite/pinned are false in query", async () => {
    await a.post("/api/entries").send({
      title: "Fresh",
      content: "A brand new page.",
      type: "diary",
    });

    const res = await a.get("/api/entries?favorite=false&pinned=false&sort=newest");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    assert.ok(res.body.entries.length >= 1, "new entry should appear in the list");
    assert.ok(
      res.body.entries.some((e) => e.title === "Fresh"),
      "the just-created entry must not be filtered out",
    );
  });

  it("prevents one user from reading or deleting another user's entry", async () => {
    const entry = await a.post("/api/entries").send({
      title: "Secret",
      content: "Private thought.",
    });
    const id = entry.body.entry._id;

    const other = await newAgent();
    await register(other, "writer_two", "4321", "Other Writer");
    const read = await other.get(`/api/entries/${id}`);
    const del = await other.delete(`/api/entries/${id}`);
    assert.strictEqual(read.status, 404);
    assert.strictEqual(del.status, 404);

    const ownerDelete = await a.delete(`/api/entries/${id}`);
    assert.strictEqual(ownerDelete.status, 200);
  });

  it("validates input", async () => {
    const res = await a.post("/api/entries").send({ title: "", content: "" });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, "Validation failed");
  });

  it("returns 400 for malformed JSON instead of 500", async () => {
    const res = await req()
      .post("/api/session/login")
      .set("Content-Type", "application/json")
      .send("{bad json");
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, "Invalid JSON in request body");
  });

  it("favorite and pin", async () => {
    const create = await a.post("/api/entries").send({ title: "Fav", content: "important" });
    const id = create.body.entry._id;

    const fav = await a.patch(`/api/entries/${id}/favorite`).send({ isFavorite: true });
    assert.strictEqual(fav.body.entry.isFavorite, true);

    const pin = await a.patch(`/api/entries/${id}/pin`).send({ isPinned: true });
    assert.strictEqual(pin.body.entry.isPinned, true);
  });

  it("search", async () => {
    const res = await a.get("/api/entries/search?q=quiet");
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.entries.length, 1);
  });

  it("defaults entries to private visibility", async () => {
    const res = await a.post("/api/entries").send({
      title: "Private Note",
      content: "This must never appear publicly.",
      visibility: undefined,
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.entry.visibility, "private");
  });

  it("exposes only public entries anonymously", async () => {
    const pub = await a.post("/api/entries").send({
      title: "Shared Thought",
      content: "A quiet word left for strangers to find.",
      type: "thought",
      tags: ["publicly-shared"],
      visibility: "public",
    });
    assert.strictEqual(pub.body.entry.visibility, "public");

    const list = await req().get("/api/public/entries");
    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.body.ok, true);
    assert.ok(list.body.entries.every((e) => e.visibility === "public"));
    assert.ok(list.body.entries.some((e) => e.title === "Shared Thought"));
    assert.ok(!list.body.entries.some((e) => e.title === "Private Note"));
    assert.ok(
      !list.body.entries.some((e) => "visitorId" in e || "isFavorite" in e || "isPinned" in e),
      "public payload must stay anonymous",
    );
  });

  it("blocks anonymous access to private entries but allows public single reads", async () => {
    const pub = await a.post("/api/entries").send({
      title: "Open Letter",
      content: "For any reader.",
      visibility: "public",
    });
    const pubId = pub.body.entry._id;

    const privateList = await a.get("/api/entries/search?q=publicly");
    const privateId = privateList.body.entries.find((e) => e.title === "Private Note")._id;

    const hidden = await req().get(`/api/public/entries/${privateId}`);
    assert.strictEqual(hidden.status, 404);

    const visible = await req().get(`/api/public/entries/${pubId}`);
    assert.strictEqual(visible.status, 200);
    assert.strictEqual(visible.body.entry.title, "Open Letter");
  });

  it("returns public quotes and category counts from public entries only", async () => {
    await a.post("/api/entries").send({
      title: "Said Quietly",
      content: "Sometimes one says more by staying silent.",
      type: "quote",
      visibility: "public",
    });

    const quotes = await req().get("/api/public/quotes");
    assert.strictEqual(quotes.status, 200);
    assert.ok(quotes.body.entries.every((e) => e.type === "quote"));
    assert.ok(quotes.body.entries.some((e) => e.title === "Said Quietly"));
    assert.ok(!quotes.body.entries.some((e) => e.title === "Private Note"));

    const cats = await req().get("/api/public/categories");
    assert.strictEqual(cats.status, 200);
    const thoughtGroup = cats.body.categories.find((c) => c.type === "thought");
    assert.strictEqual(thoughtGroup.count, 1, "only public thoughts counted");
  });

  it("calendar", async () => {
    const d = new Date();
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const res = await a.get(`/api/entries/calendar?month=${month}`);
    assert.strictEqual(res.body.ok, true);
    assert.ok(typeof res.body.byDay === "object");
  });

  it("on-this-day", async () => {
    const res = await a.get("/api/entries/on-this-day");
    assert.strictEqual(res.body.ok, true);
    assert.ok(Array.isArray(res.body.entries));
  });

  it("categories CRUD", async () => {
    const c1 = await a.post("/api/categories").send({ name: "Thoughts" });
    assert.strictEqual(c1.status, 201);
    const list = await a.get("/api/categories");
    assert.strictEqual(list.body.categories.length, 1);

    const c2 = await a.post("/api/categories").send({ name: "Thoughts" });
    assert.strictEqual(c2.status, 200);

    const upd = await a.patch(`/api/categories/${c1.body.category._id}`).send({ name: "Reflections" });
    assert.strictEqual(upd.body.category.name, "Reflections");

    const del = await a.delete(`/api/categories/${c1.body.category._id}`);
    assert.strictEqual(del.body.deleted, true);
  });

  it("statistics separates public and private entries", async () => {
    await a.post("/api/entries").send({ title: "Stats Private", content: "Private count" });
    await a.post("/api/entries").send({ title: "Stats Public", content: "Public count", visibility: "public" });

    const res = await a.get("/api/statistics");
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.statistics.publicEntries >= 1);
    assert.ok(res.body.statistics.privateEntries >= 1);
    assert.strictEqual(
      res.body.statistics.publicEntries + res.body.statistics.privateEntries,
      res.body.statistics.totalEntries,
    );
  });

  it("export txt", async () => {
    const create = await a.post("/api/entries").send({ title: "Export Me", content: "Hello world" });
    const id = create.body.entry._id;
    const res = await a.get(`/api/export/entry/${id}/txt`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.text.includes("Export Me"));
  });

  it("export docx and pdf return files", async () => {
    const create = await a.post("/api/entries").send({ title: "Export Both", content: "docx and pdf" });
    const id = create.body.entry._id;

    const docx = await a.get(`/api/export/entry/${id}/docx`).buffer(true).parse((res, cb) => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    assert.strictEqual(docx.status, 200);
    assert.ok(docx.body.length > 0, "docx body should not be empty");

    const pdf = await a.get(`/api/export/entry/${id}/pdf`).buffer(true).parse((res, cb) => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    assert.strictEqual(pdf.status, 200);
    assert.ok(pdf.body.length > 0, "pdf body should not be empty");

    const bulk = await a.post("/api/export/pdf").send({}).buffer(true).parse((res, cb) => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    assert.strictEqual(bulk.status, 200);
    assert.ok(bulk.body.length > 0, "bulk pdf should not be empty");
  });

  it("backup and restore preserves entry visibility", async () => {
    await a.post("/api/entries").send({
      title: "Backup Private",
      content: "Stay private after restore.",
    });
    await a.post("/api/entries").send({
      title: "Backup Public",
      content: "Stay public after restore.",
      visibility: "public",
    });

    const backup = await a.get("/api/backup");
    assert.strictEqual(backup.body.ok, true);
    assert.ok(backup.body.entries.some((entry) => entry.title === "Backup Private" && entry.visibility === "private"));
    assert.ok(backup.body.entries.some((entry) => entry.title === "Backup Public" && entry.visibility === "public"));

    const restore = await a.post("/api/backup/restore").send({ data: backup.body });
    assert.strictEqual(restore.status, 200);
    assert.strictEqual(restore.body.ok, true);
    assert.strictEqual(restore.body.restored, true);

    const restored = await a.get("/api/entries");
    const privateEntry = restored.body.entries.find((entry) => entry.title === "Backup Private");
    const publicEntry = restored.body.entries.find((entry) => entry.title === "Backup Public");
    assert.strictEqual(privateEntry.visibility, "private");
    assert.strictEqual(publicEntry.visibility, "public");
  });

  it("requires PIN for destructive reset", async () => {
    const missing = await a.post("/api/backup/delete-all").send({});
    assert.strictEqual(missing.status, 400);

    const wrong = await a.post("/api/backup/delete-all").send({ pin: "0000" });
    assert.strictEqual(wrong.status, 401);
  });

  it("delete entry", async () => {
    const create = await a.post("/api/entries").send({ title: "Delete Me", content: "bye" });
    const id = create.body.entry._id;
    const del = await a.delete(`/api/entries/${id}`);
    assert.strictEqual(del.body.deleted, true);

    const get = await a.get(`/api/entries/${id}`);
    assert.strictEqual(get.status, 404);
  });

  it("delete all with PIN", async () => {
    const res = await a.post("/api/backup/delete-all").send({ pin: "1234" });
    assert.strictEqual(res.body.deleted, true);
    const list = await a.get("/api/entries");
    assert.strictEqual(list.body.entries.length, 0);
  });
});
