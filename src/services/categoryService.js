import Category from "../models/Category.js";
import { AppError } from "../utils/errors.js";

export async function listCategories(visitorId) {
  return Category.find({ visitorId }).sort({ name: 1 }).lean();
}

export async function createCategory(visitorId, name) {
  const safeName = String(name || "").trim().slice(0, 60);
  if (!safeName) {
    throw new AppError("Category name is required", 400);
  }
  const escaped = safeName.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  const existing = await Category.findOne({ visitorId, name: new RegExp(`^${escaped}$`, "i") });
  if (existing) return { category: existing.toObject(), created: false };
  try {
    const cat = await Category.create({ visitorId, name: safeName });
    return { category: cat.toObject(), created: true };
  } catch (err) {
    if (err?.code === 11000) {
      const raceExisting = await Category.findOne({ visitorId, name: new RegExp(`^${escaped}$`, "i") });
      if (raceExisting) return { category: raceExisting.toObject(), created: false };
    }
    throw err;
  }
}

export async function updateCategory(visitorId, id, name) {
  const safeName = String(name || "").trim().slice(0, 60);
  if (!safeName) {
    throw new AppError("Category name is required", 400);
  }
  try {
    const cat = await Category.findOneAndUpdate(
      { _id: id, visitorId },
      { $set: { name: safeName } },
      { new: true, runValidators: true },
    ).lean();
    if (!cat) throw new AppError("Category not found", 404);
    return cat;
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError("A category with this name already exists", 409);
    }
    throw err;
  }
}

export async function deleteCategory(visitorId, id) {
  const result = await Category.deleteOne({ _id: id, visitorId });
  if (result.deletedCount === 0) throw new AppError("Category not found", 404);
  return { deleted: true };
}