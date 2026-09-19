import { z } from 'zod';

const jsonField = z.record(z.string(), z.string()).optional().nullable();

export const reelSchema = z.object({
  title: z.record(z.string(), z.string()),
  tag: z.string().optional().nullable(),
  duration: z.string().optional().nullable(),
  views: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
  videoUrl: z.string().url().optional().nullable(),
  url: z.string().url().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  sortOrder: z.number().int().optional(),
});

export const reelUpdateSchema = reelSchema.partial();