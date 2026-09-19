import { z } from 'zod';

export const categorySchema = z.object({
  key: z.string().min(2),
  name: z.record(z.string(), z.string()),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  sortOrder: z.number().int().optional(),
});

export const categoryUpdateSchema = categorySchema.partial();