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
      minPoolSize: 0,
      maxIdleTimeMS: 30000,
      autoIndex: env.nodeEnv !== "production",
    });
    connected = true;
    console.log(`MongoDB connected: ${mongoose.connection.name} (${mongoose.connection.host})`);
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