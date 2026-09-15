import mongoose from "mongoose";
import { env } from "../config/env.js";

const categorySchema = new mongoose.Schema(
  {
    visitorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Visitor",
      required: [true, "Visitor is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      minlength: [1, "Category name must not be empty"],
      maxlength: [60, "Category name must be at most 60 characters"],
    },
  },
  { timestamps: true },
);

categorySchema.index({ visitorId: 1, name: 1 }, { unique: true });

export default mongoose.model("Category", categorySchema);