import {
  listPublicCategories,
  listAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../services/category.service.js';
import { successResponse } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';

export const getPublicCategories = async (req, res) => {
  const items = await listPublicCategories();
  return successResponse(res, 200, 'Categories fetched', { items });
};

export const getCategoriesAdmin = async (req, res) => {
  const data = await listAdminCategories(req.query);
  return successResponse(res, 200, 'Categories fetched', data);
};

export const postCategory = async (req, res) => {
  const category = await createCategory(req.body);
  await logAudit({ userId: req.user.id, action: 'CATEGORY_CREATED', entity: 'Category', entityId: category.id, ip: getClientIp(req) });
  return successResponse(res, 201, 'Category created', { category });
};

export const putCategory = async (req, res) => {
  const category = await updateCategory(req.params.id, req.body);
  await logAudit({ userId: req.user.id, action: 'CATEGORY_UPDATED', entity: 'Category', entityId: category.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Category updated', { category });
};

export const removeCategory = async (req, res) => {
  const result = await deleteCategory(req.params.id);
  await logAudit({ userId: req.user.id, action: 'CATEGORY_DELETED', entity: 'Category', entityId: req.params.id, metadata: result, ip: getClientIp(req) });
  return successResponse(res, 200, result.deactivated ? 'Category deactivated (has services)' : 'Category deleted', result);
};