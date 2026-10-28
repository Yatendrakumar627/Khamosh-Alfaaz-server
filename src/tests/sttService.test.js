import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { transcribeAudioBuffer } from "../services/sttService.js";

describe("STT Service Unit Tests", () => {
  test("throws error when buffer is empty or null", async () => {
    await assert.rejects(
      async () => {
        await transcribeAudioBuffer({ buffer: null });
      },
      /Audio buffer is empty/,
    );

    await assert.rejects(
      async () => {
        await transcribeAudioBuffer({ buffer: Buffer.alloc(0) });
      },
      /Audio buffer is empty/,
    );
  });

  test("returns safe fallback when no keys are configured in environment", async () => {
    // Save original env
    const origGroq = process.env.GROQ_API_KEY;
    const origOpenai = process.env.OPENAI_API_KEY;
    const origGemini = process.env.GEMINI_API_KEY;
    const origGoogle = process.env.GOOGLE_API_KEY;

    delete process.env.GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    try {
      const dummyBuffer = Buffer.from("RIFF....WAVEfmt ....data....");
      const res = await transcribeAudioBuffer({ buffer: dummyBuffer });
      assert.equal(res.success, false);
      assert.equal(res.code, "NO_PROVIDER_CONFIGURED");
      assert.ok(res.message.includes("GROQ_API_KEY"));
    } finally {
      if (origGroq) process.env.GROQ_API_KEY = origGroq;
      if (origOpenai) process.env.OPENAI_API_KEY = origOpenai;
      if (origGemini) process.env.GEMINI_API_KEY = origGemini;
      if (origGoogle) process.env.GOOGLE_API_KEY = origGoogle;
    }
  });
});

