import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

const publicFaqSelect = {
  id: true,
  question: true,
  answer: true,
  category: true,
  sortOrder: true,
};

const publicReviewSelect = {
  id: true,
  author: true,
  treatment: true,
  rating: true,
  date: true,
  avatar: true,
  comment: true,
  sortOrder: true,
};

const publicGallerySelect = {
  id: true,
  category: true,
  title: true,
  description: true,
  beforeImg: true,
  afterImg: true,
  treatmentType: true,
  sortOrder: true,
};

export const listFaqs = async () =>
  prisma.faq.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { sortOrder: 'asc' },
    select: publicFaqSelect,
  });

export const getAllFaqs = async ({ page = 1, limit = 100 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    prisma.faq.findMany({ skip, take: Number(limit), orderBy: { sortOrder: 'asc' } }),
    prisma.faq.count(),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
};

export const listPublicReviews = async () =>
  prisma.review.findMany({
    where: { status: 'APPROVED' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: publicReviewSelect,
  });

export const getAllReviews = async ({ page = 1, limit = 100, status }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([
    prisma.review.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' } }),
    prisma.review.count({ where }),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
};

export const listPublicGallery = async () =>
  prisma.galleryItem.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: publicGallerySelect,
  });

export const getAllGallery = async ({ page = 1, limit = 100, status }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([
    prisma.galleryItem.findMany({ where, skip, take: Number(limit), orderBy: { sortOrder: 'asc' } }),
    prisma.galleryItem.count({ where }),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
};

export const upsertFaq = async (id, data) => {
  if (id) {
    const existing = await prisma.faq.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new ApiError(404, 'FAQ not found');
    return prisma.faq.update({ where: { id: existing.id }, data });
  }
  const sortOrder = data.sortOrder ?? (await prisma.faq.count());
  return prisma.faq.create({ data: { ...data, sortOrder } });
};

export const deleteFaq = async (id) => {
  try {
    await prisma.faq.delete({ where: { id: Number(id) } });
  } catch (err) {
    if (err.code === 'P2025') throw new ApiError(404, 'FAQ not found');
    throw err;
  }
};

export const upsertReview = async (id, data) => {
  if (id) {
    const existing = await prisma.review.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new ApiError(404, 'Review not found');
    return prisma.review.update({ where: { id: existing.id }, data });
  }
  return prisma.review.create({ data });
};

export const deleteReview = async (id) => {
  try {
    await prisma.review.delete({ where: { id: Number(id) } });
  } catch (err) {
    if (err.code === 'P2025') throw new ApiError(404, 'Review not found');
    throw err;
  }
};

export const upsertGallery = async (id, data) => {
  if (id) {
    const existing = await prisma.galleryItem.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new ApiError(404, 'Gallery item not found');
    return prisma.galleryItem.update({ where: { id: existing.id }, data });
  }
  const sortOrder = data.sortOrder ?? (await prisma.galleryItem.count());
  return prisma.galleryItem.create({ data: { ...data, sortOrder } });
};

export const deleteGallery = async (id) => {
  try {
    await prisma.galleryItem.delete({ where: { id: Number(id) } });
  } catch (err) {
    if (err.code === 'P2025') throw new ApiError(404, 'Gallery item not found');
    throw err;
  }
};