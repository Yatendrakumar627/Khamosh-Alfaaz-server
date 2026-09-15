import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";

const app = createApp();

async function main() {
  await connectDB();
  const server = app.listen(env.port, () => {
    console.log(`Khamosh Alfaaz server running on http://localhost:${env.port} (${env.nodeEnv})`);
  });
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  process.exit(0);
});