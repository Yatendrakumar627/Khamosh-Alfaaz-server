import mongoose from "mongoose";
import { env } from "../config/env.js";

const visitorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [env.maxNameLength, `Name must be at most ${env.maxNameLength} characters`],
    },
    username: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username must be at most 30 characters"],
      match: [/^[a-z0-9_]+$/, "Use only letters, numbers, and underscores"],
    },
    pinHash: {
      type: String,
      select: false,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

visitorSchema.index({ lastActiveAt: -1 });

export default mongoose.model("Visitor", visitorSchema);