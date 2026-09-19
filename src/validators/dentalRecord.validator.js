import { z } from 'zod';

export const toothStatusEnum = z.enum([
  'HEALTHY',
  'DECAY',
  'FILLED',
  'MISSING',
  'ROOT_CANAL',
  'CROWN',
  'IMPLANT',
  'EXTRACTION_REQUIRED',
]);

export const dentalRecordSchema = z.object({
  patientId: z.number().int().positive(),
  toothNumber: z.number().int().min(1).max(32),
  condition: z.string().optional().nullable(),
  treatment: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: toothStatusEnum.optional().default('HEALTHY'),
});

export const dentalChartUpdateSchema = z.object({
  toothNumber: z.number().int().min(1).max(32),
  condition: z.string().optional().nullable(),
  treatment: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: toothStatusEnum.optional(),
});

export const bulkDentalUpdateSchema = z.object({
  patientId: z.number().int().positive(),
  teeth: z.array(dentalChartUpdateSchema).min(1),
});