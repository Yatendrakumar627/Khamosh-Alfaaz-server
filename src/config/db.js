import mongoose from "mongoose";
import { env } from "./env.js";

let connected = false;

export async function connectDB() {
  if (connected) return mongoose.connection;
  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      family: 4,
      maxPoolSize: 10,
      minPoolSize: env.nodeEnv === "test" ? 0 : 2,
      maxIdleTimeMS: 60000,
      autoIndex: env.nodeEnv !== "production",
    });
    connected = true;
    console.log(`MongoDB connected: ${mongoose.connection.name} (${mongoose.connection.host})`);

    // Ensure indexes build in background on cold database starts
    if (env.nodeEnv === "production") {
      Promise.resolve().then(async () => {
        try {
          const Entry = mongoose.models.Entry || (await import("../models/Entry.js")).default;
          if (Entry && typeof Entry.syncIndexes === "function") {
            await Entry.syncIndexes();
          }
        } catch (idxErr) {
          console.warn("Index sync warning:", idxErr.message);
        }
      });
    }
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
  mongoose.connection.on("error", (err) => {
    console.error("MongoDB runtime error:", err.message);
  });
  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected");
    connected = false;
  });
  return mongoose.connection;
}

export default connectDB;