import { z } from 'zod';

export const chamberSchema = z.object({
  name: z.string().min(2),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  workingHours: z.record(z.string(), z.unknown()).optional().nullable(),
  daysOff: z.array(z.number().int()).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  sortOrder: z.number().int().optional(),
});

export const chamberUpdateSchema = chamberSchema.partial();