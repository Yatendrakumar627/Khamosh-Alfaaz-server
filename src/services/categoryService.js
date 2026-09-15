import Category from "../models/Category.js";
import { AppError } from "../utils/errors.js";

export async function listCategories(visitorId) {
  return Category.find({ visitorId }).sort({ name: 1 }).lean();
}

export async function createCategory(visitorId, name) {
  const existing = await Category.findOne({ visitorId, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
  if (existing) return { category: existing.toObject(), created: false };
  const cat = await Category.create({ visitorId, name });
  return { category: cat.toObject(), created: true };
}

export async function updateCategory(visitorId, id, name) {
  const cat = await Category.findOneAndUpdate(
    { _id: id, visitorId },
    { $set: { name } },
    { new: true, runValidators: true },
  ).lean();
  if (!cat) throw new AppError("Category not found", 404);
  return cat;
}

export async function deleteCategory(visitorId, id) {
  const result = await Category.deleteOne({ _id: id, visitorId });
  if (result.deletedCount === 0) throw new AppError("Category not found", 404);
  return { deleted: true };
}