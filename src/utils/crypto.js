import crypto from "node:crypto";

export function generateSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

export function generateVisitorToken() {
  return crypto.randomBytes(24).toString("hex");
}

export function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(pin, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPin(pin, storedHash) {
  if (typeof pin !== "string" || typeof storedHash !== "string") return false;

  const [algorithm, saltHex, hashHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(pin, salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function sanitizeString(value, maxLen) {
  if (typeof value !== "string") return value;
  return value.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export function sanitizeTags(tags, maxLen) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((t) => sanitizeString(String(t), maxLen)))];
}