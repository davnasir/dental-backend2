import { z } from 'zod';

const jsonField = z.record(z.string(), z.unknown()).optional().nullable();

export const serviceSchema = z.object({
  name: z.record(z.string(), z.string()),
  slug: z.string().min(2).optional(),
  category: z.string().min(1),
  categoryKey: z.string().optional().nullable(),
  shortDesc: jsonField,
  description: jsonField,
  image: z.string().optional().nullable(),
  duration: z.string().optional().nullable(),
  priceMin: z.number().nonnegative().optional(),
  priceMax: z.number().nonnegative().optional(),
  priceFormatted: z.string().optional().nullable(),
  benefits: jsonField,
  procedure: jsonField,
  recovery: jsonField,
  badge: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  sortOrder: z.number().int().optional(),
});

export const serviceUpdateSchema = serviceSchema.partial();