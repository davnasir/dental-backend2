import { z } from 'zod';

export const treatmentSchema = z.object({
  patientId: z.number().int().positive(),
  doctorId: z.number().int().positive(),
  appointmentId: z.number().int().positive().optional().nullable(),
  diagnosis: z.record(z.string(), z.unknown()).optional().nullable(),
  treatment: z.record(z.string(), z.unknown()).optional().nullable(),
  notes: z.string().optional().nullable(),
  prescription: z.record(z.string(), z.unknown()).optional().nullable(),
  followUpDate: z.string().datetime({ offset: true }).optional().nullable().or(z.string().optional()).nullable(),
});

export const treatmentUpdateSchema = treatmentSchema.partial();