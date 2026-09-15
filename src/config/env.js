export function getEnv() {
  const clientUrls = (process.env.CLIENT_URL || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    nodeEnv: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT) || 5001,
    mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/khamosh-alfaaz",
    sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",
    clientUrl: clientUrls[0],
    clientOrigins: clientUrls,
    maxTitleLength: Number(process.env.MAX_TITLE_LENGTH) || 200,
    maxTagCount: Number(process.env.MAX_TAG_COUNT) || 20,
    maxTagLength: Number(process.env.MAX_TAG_LENGTH) || 50,
    maxNameLength: Number(process.env.MAX_NAME_LENGTH) || 100,
    sessionMaxAgeMs: Number(process.env.SESSION_MAX_AGE_MS) || 30 * 24 * 60 * 60 * 1000,
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 300,
  };
}

export const env = new Proxy({}, {
  get(target, prop) {
    return getEnv()[prop];
  },
});