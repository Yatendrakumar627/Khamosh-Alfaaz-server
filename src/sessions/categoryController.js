import * as categoryService from "../services/categoryService.js";
import { categoryCreateSchema, categoryUpdateSchema } from "../validators/schemas.js";

export async function listCategoriesHandler(req, res, next) {
  try {
    const categories = await categoryService.listCategories(req.visitor._id);
    res.json({ ok: true, categories });
  } catch (err) {
    next(err);
  }
}

export async function createCategoryHandler(req, res, next) {
  try {
    const data = categoryCreateSchema.parse(req.body);
    const { category, created } = await categoryService.createCategory(req.visitor._id, data.name);
    res.status(created ? 201 : 200).json({ ok: true, category });
  } catch (err) {
    next(err);
  }
}

export async function updateCategoryHandler(req, res, next) {
  try {
    const data = categoryUpdateSchema.parse(req.body);
    const category = await categoryService.updateCategory(req.visitor._id, req.params.id, data.name);
    res.json({ ok: true, category });
  } catch (err) {
    next(err);
  }
}

export async function deleteCategoryHandler(req, res, next) {
  try {
    await categoryService.deleteCategory(req.visitor._id, req.params.id);
    res.json({ ok: true, deleted: true });
  } catch (err) {
    next(err);
  }
}