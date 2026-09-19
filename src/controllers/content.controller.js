import {
  listFaqs,
  getAllFaqs,
  listPublicReviews,
  getAllReviews,
  listPublicGallery,
  getAllGallery,
  upsertFaq,
  deleteFaq,
  upsertReview,
  deleteReview,
  upsertGallery,
  deleteGallery,
} from '../services/content.service.js';
import {
  listPublicBlogs,
  getPublicBlogBySlug,
  getAllBlogs,
  createBlog,
  updateBlog,
  deleteBlog,
} from '../services/blog.service.js';
import { successResponse } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';
import { toLocalDateStr } from '../utils/date.js';
import { toUploadUrl } from '../utils/uploadUrl.js';

// --- FAQ ---
export const getFaqs = async (req, res) => {
  const items = await listFaqs();
  return successResponse(res, 200, 'FAQs fetched', { items });
};
export const getAdminFaqs = async (req, res) => {
  const data = await getAllFaqs(req.query);
  return successResponse(res, 200, 'FAQs fetched', data);
};
export const postFaq = async (req, res) => {
  const item = await upsertFaq(null, req.body);
  await logAudit({ userId: req.user.id, action: 'FAQ_CREATED', entity: 'Faq', entityId: item.id, ip: getClientIp(req) });
  return successResponse(res, 201, 'FAQ created', { item });
};
export const putFaq = async (req, res) => {
  const item = await upsertFaq(req.params.id, req.body);
  await logAudit({ userId: req.user.id, action: 'FAQ_UPDATED', entity: 'Faq', entityId: item.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'FAQ updated', { item });
};
export const removeFaq = async (req, res) => {
  await deleteFaq(req.params.id);
  await logAudit({ userId: req.user.id, action: 'FAQ_DELETED', entity: 'Faq', entityId: req.params.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'FAQ deleted');
};

// --- Reviews ---
export const getReviews = async (req, res) => {
  const items = await listPublicReviews();
  return successResponse(res, 200, 'Reviews fetched', { items });
};
export const getAdminReviews = async (req, res) => {
  const data = await getAllReviews(req.query);
  return successResponse(res, 200, 'Reviews fetched', data);
};
export const postReview = async (req, res) => {
  const item = await upsertReview(null, { ...req.body, status: 'PENDING', date: toLocalDateStr(new Date()) });
  return successResponse(res, 201, 'Review submitted. It will appear once approved.', { item });
};
export const putReview = async (req, res) => {
  const item = await upsertReview(req.params.id, req.body);
  await logAudit({ userId: req.user.id, action: 'REVIEW_UPDATED', entity: 'Review', entityId: item.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Review updated', { item });
};
export const approveReview = async (req, res) => {
  const prisma = await import('../config/prisma.js');
  const item = await prisma.default.review.update({
    where: { id: Number(req.params.id) },
    data: { status: 'APPROVED' },
  });
  return successResponse(res, 200, 'Review approved', { item });
};
export const removeReview = async (req, res) => {
  await deleteReview(req.params.id);
  await logAudit({ userId: req.user.id, action: 'REVIEW_DELETED', entity: 'Review', entityId: req.params.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Review deleted');
};

// --- Gallery ---
export const getGallery = async (req, res) => {
  const items = await listPublicGallery();
  return successResponse(res, 200, 'Gallery fetched', { items });
};
export const getAdminGallery = async (req, res) => {
  const data = await getAllGallery(req.query);
  return successResponse(res, 200, 'Gallery fetched', data);
};
export const postGalleryItem = async (req, res) => {
  const files = req.files || [];
  const before = req.body.beforeImg || toUploadUrl(files[0]);
  const after = req.body.afterImg || toUploadUrl(files[1]) || toUploadUrl(files[0]);
  const item = await upsertGallery(null, { ...req.body, beforeImg: before, afterImg: after });
  await logAudit({ userId: req.user.id, action: 'GALLERY_CREATED', entity: 'GalleryItem', entityId: item.id, ip: getClientIp(req) });
  return successResponse(res, 201, 'Gallery item created', { item });
};
export const putGalleryItem = async (req, res) => {
  const files = req.files || [];
  const item = await upsertGallery(req.params.id, {
    ...req.body,
    beforeImg: req.body.beforeImg || toUploadUrl(files[0]) || undefined,
    afterImg: req.body.afterImg || toUploadUrl(files[1]) || toUploadUrl(files[0]) || undefined,
  });
  await logAudit({ userId: req.user.id, action: 'GALLERY_UPDATED', entity: 'GalleryItem', entityId: item.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Gallery item updated', { item });
};
export const removeGalleryItem = async (req, res) => {
  await deleteGallery(req.params.id);
  await logAudit({ userId: req.user.id, action: 'GALLERY_DELETED', entity: 'GalleryItem', entityId: req.params.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Gallery item deleted');
};

// --- Blog ---
export const getBlogs = async (req, res) => {
  const items = await listPublicBlogs(req.query);
  return successResponse(res, 200, 'Blog posts fetched', { items });
};
export const getBlogBySlug = async (req, res) => {
  const blog = await getPublicBlogBySlug(req.params.slug);
  return successResponse(res, 200, 'Blog post fetched', { blog });
};
export const getAdminBlogs = async (req, res) => {
  const data = await getAllBlogs(req.query);
  return successResponse(res, 200, 'Blog posts fetched', data);
};
export const postBlog = async (req, res) => {
  const blog = await createBlog({ ...req.body, featuredImage: toUploadUrl(req.file) || req.body.featuredImage });
  await logAudit({ userId: req.user.id, action: 'BLOG_CREATED', entity: 'Blog', entityId: blog.id, ip: getClientIp(req) });
  return successResponse(res, 201, 'Blog post created', { blog });
};
export const putBlog = async (req, res) => {
  const blog = await updateBlog(req.params.id, { ...req.body, featuredImage: toUploadUrl(req.file) || req.body.featuredImage });
  await logAudit({ userId: req.user.id, action: 'BLOG_UPDATED', entity: 'Blog', entityId: blog.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Blog post updated', { blog });
};
export const removeBlog = async (req, res) => {
  await deleteBlog(req.params.id);
  await logAudit({ userId: req.user.id, action: 'BLOG_DELETED', entity: 'Blog', entityId: req.params.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Blog post deleted');
};

// --- Settings ---
export const getSettings = async (req, res) => {
  const prisma = await import('../config/prisma.js');
  const settings = await prisma.default.setting.findMany();
  return successResponse(res, 200, 'Settings fetched', { items: settings });
};
export const getPublicSetting = async (req, res) => {
  const prisma = await import('../config/prisma.js');
  const setting = await prisma.default.setting.findUnique({ where: { key: req.params.key } });
  return successResponse(res, 200, 'Setting fetched', { item: setting });
};
export const upsertSetting = async (req, res) => {
  const prisma = await import('../config/prisma.js');
  const item = await prisma.default.setting.upsert({
    where: { key: req.body.key },
    create: { key: req.body.key, value: req.body.value },
    update: { value: req.body.value },
  });
  await logAudit({ userId: req.user.id, action: 'SETTING_UPDATED', entity: 'Setting', entityId: item.key, ip: getClientIp(req) });
  return successResponse(res, 200, 'Setting saved', { item });
};