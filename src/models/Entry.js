import mongoose from "mongoose";
import { env } from "../config/env.js";

const entrySchema = new mongoose.Schema(
  {
    visitorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Visitor",
      required: [true, "Visitor is required"],
      index: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: [env.maxTitleLength, `Title must be at most ${env.maxTitleLength} characters`],
    },
    content: {
      type: String,
      required: [true, "Content is required"],
      trim: true,
      minlength: [1, "Content must not be empty"],
    },
    type: {
      type: String,
      enum: ["diary", "thought", "quote", "idea", "note", "personal", "gratitude", "other"],
      default: "diary",
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    entryDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    isFavorite: { type: Boolean, default: false, index: true },
    isPinned: { type: Boolean, default: false, index: true },
    visibility: {
      type: String,
      enum: ["private", "public"],
      default: "private",
      index: true,
    },
  },
  { timestamps: true },
);

entrySchema.pre("validate", function () {
  if (this.title && this.title.length > env.maxTitleLength) {
    this.invalidate("title", `Title must be at most ${env.maxTitleLength} characters`);
  }
  if (Array.isArray(this.tags) && this.tags.length > env.maxTagCount) {
    this.invalidate("tags", `You can have at most ${env.maxTagCount} tags`);
  }
});

entrySchema.index({ visitorId: 1, createdAt: -1 });
entrySchema.index({ visitorId: 1, isFavorite: 1, createdAt: -1 });
entrySchema.index({ visitorId: 1, isPinned: 1, createdAt: -1 });
entrySchema.index({ visitorId: 1, entryDate: -1 });
entrySchema.index({ visitorId: 1, type: 1 });
entrySchema.index({ visibility: 1, createdAt: -1 });
entrySchema.index({ visibility: 1, type: 1, createdAt: -1 });
entrySchema.index({ title: "text", content: "text", tags: "text", type: "text" });

export default mongoose.model("Entry", entrySchema);