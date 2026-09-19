import { z } from 'zod';

const json = z.record(z.string(), z.unknown()).optional().nullable();

// --- Reviews ---
export const reviewSchema = z.object({
  author: z.string().min(2),
  treatment: json,
  rating: z.number().int().min(1).max(5).default(5),
  date: z.string().optional().nullable(),
  avatar: z.string().optional().nullable(),
  comment: json,
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  sortOrder: z.number().int().optional(),
});
export const reviewUpdateSchema = reviewSchema.partial();

// --- Gallery ---
export const gallerySchema = z.object({
  category: z.string().optional().nullable(),
  title: z.record(z.string(), z.string()),
  description: json,
  beforeImg: z.string().optional().nullable(),
  afterImg: z.string().optional().nullable(),
  treatmentType: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  sortOrder: z.number().int().optional(),
});
export const galleryUpdateSchema = gallerySchema.partial();

// --- Blog ---
export const blogSchema = z.object({
  title: z.record(z.string(), z.string()),
  slug: z.string().min(2).optional(),
  excerpt: json,
  content: json,
  featuredImage: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  categoryTitle: json,
  author: z.string().optional().nullable(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  seoTitle: z.string().optional().nullable(),
  seoDescription: z.string().optional().nullable(),
  readTime: z.string().optional().nullable(),
});
export const blogUpdateSchema = blogSchema.partial();

// --- FAQ ---
export const faqSchema = z.object({
  question: z.record(z.string(), z.string()),
  answer: z.record(z.string(), z.string()),
  category: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  sortOrder: z.number().int().optional(),
});
export const faqUpdateSchema = faqSchema.partial();

// --- Settings ---
export const settingsSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

// --- IP Blocks ---
export const ipBlockSchema = z.object({
  ip: z.string().min(1).max(191),
  reason: z.string().max(191).optional().nullable(),
  createdById: z.number().int().positive().optional().nullable(),
});

export const ipBlockListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  q: z.string().max(191).optional(),
});