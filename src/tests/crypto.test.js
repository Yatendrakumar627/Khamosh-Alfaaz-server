import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  generateSessionId,
  generateVisitorToken,
  hashPin,
  verifyPin,
  hashToken,
  sanitizeString,
  sanitizeTags,
} from "../utils/crypto.js";

describe("Crypto & Sanitization Unit Tests", () => {
  describe("generateSessionId & generateVisitorToken", () => {
    test("generates high-entropy hex strings of expected lengths", () => {
      const sessionId1 = generateSessionId();
      const sessionId2 = generateSessionId();
      assert.equal(sessionId1.length, 64); // 32 bytes in hex = 64 chars
      assert.notEqual(sessionId1, sessionId2);

      const token1 = generateVisitorToken();
      const token2 = generateVisitorToken();
      assert.equal(token1.length, 48); // 24 bytes in hex = 48 chars
      assert.notEqual(token1, token2);
    });
  });

  describe("hashPin & verifyPin", () => {
    test("hashes a PIN using scrypt with salt and successfully verifies it", () => {
      const pin = "123456";
      const hashed = hashPin(pin);

      assert.ok(hashed.startsWith("scrypt$"));
      const parts = hashed.split("$");
      assert.equal(parts.length, 3);
      assert.equal(parts[0], "scrypt");
      assert.equal(parts[1].length, 32); // 16 bytes hex salt = 32 chars
      assert.equal(parts[2].length, 128); // 64 bytes hex derived key = 128 chars

      assert.equal(verifyPin(pin, hashed), true);
    });

    test("rejects incorrect PIN", () => {
      const pin = "123456";
      const hashed = hashPin(pin);
      assert.equal(verifyPin("654321", hashed), false);
      assert.equal(verifyPin("12345", hashed), false);
    });

    test("handles non-string or malformed inputs gracefully without throwing", () => {
      assert.equal(verifyPin(null, "hash"), false);
      assert.equal(verifyPin(undefined, "hash"), false);
      assert.equal(verifyPin(1234, "hash"), false);
      assert.equal(verifyPin("1234", null), false);
      assert.equal(verifyPin("1234", "invalid-format"), false);
      assert.equal(verifyPin("1234", "bcrypt$salt$hash"), false);
      assert.equal(verifyPin("1234", "scrypt$invalidhex$invalidhex"), false);
    });
  });

  describe("hashToken", () => {
    test("computes deterministic SHA-256 hash", () => {
      const token = "my-secret-token";
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      assert.equal(hash1, hash2);
      assert.equal(hash1.length, 64);
    });
  });

  describe("sanitizeString", () => {
    test("collapses multiple whitespaces and trims", () => {
      assert.equal(sanitizeString("  hello   world  \n\t  test  ", 100), "hello world test");
    });

    test("truncates to maxLen", () => {
      assert.equal(sanitizeString("abcdefghij", 5), "abcde");
    });

    test("returns non-string values as-is", () => {
      assert.equal(sanitizeString(123, 10), 123);
      assert.equal(sanitizeString(null, 10), null);
    });
  });

  describe("sanitizeTags", () => {
    test("cleans, trims, deduplicates, and strips empty tags", () => {
      const rawTags = ["  nature ", "Nature", "nature", "peace  ", "   ", ""];
      const cleaned = sanitizeTags(rawTags, 50);
      assert.ok(!cleaned.includes(""));
      assert.ok(cleaned.includes("nature"));
      assert.ok(cleaned.includes("peace"));
    });

    test("handles non-array inputs safely", () => {
      assert.deepEqual(sanitizeTags(null), []);
      assert.deepEqual(sanitizeTags(undefined), []);
      assert.deepEqual(sanitizeTags("not-an-array"), []);
    });
  });
});

