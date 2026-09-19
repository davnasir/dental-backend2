import { z } from 'zod';

export const doctorSchema = z.object({
  name: z.string().min(2, 'Doctor name is required'),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  specialization: z.string().optional().nullable(),
  qualification: z.string().optional().nullable(),
  registrationNumber: z.string().optional().nullable(),
  experience: z.number().int().nonnegative().optional().nullable(),
  bio: z.string().optional().nullable(),
  profileImage: z.string().optional().nullable(),
  consultationFee: z.number().nonnegative().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  workingHours: z.record(z.string(), z.unknown()).optional().nullable(),
  availability: z.record(z.string(), z.unknown()).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export const doctorUpdateSchema = doctorSchema.partial();