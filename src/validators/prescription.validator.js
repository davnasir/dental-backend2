import { z } from 'zod';

export const prescriptionSchema = z.object({
  patientId: z.number().int().positive(),
  doctorId: z.number().int().positive(),
  medicine: z.string().min(1, 'Medicine name is required'),
  dosage: z.string().optional().nullable(),
  frequency: z.string().optional().nullable(),
  duration: z.string().optional().nullable(),
  instructions: z.string().optional().nullable(),
});

export const prescriptionUpdateSchema = prescriptionSchema.partial();