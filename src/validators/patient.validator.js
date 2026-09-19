import { z } from 'zod';

// Native date inputs send YYYY-MM-DD. Also accept full ISO-8601 datetimes and
// empty strings (stored as NULL). Anything else is rejected early with a clear
// message instead of crashing Prisma with "Expected ISO-8601 DateTime".
const dateSchema = z
  .string()
  .refine(
    (value) =>
      value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isNaN(Date.parse(value)),
    'Please enter a valid date (YYYY-MM-DD)'
  )
  .optional()
  .nullable();

export const patientSchema = z.object({
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().optional().default(''),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional().nullable(),
  dateOfBirth: dateSchema,
  phone: z.string().min(8).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  emergencyContact: z.string().optional().nullable(),
  bloodGroup: z.string().optional().nullable(),
  allergies: z.string().optional().nullable(),
  medicalHistory: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const patientUpdateSchema = patientSchema.partial();

// Query used by the type-ahead patient search (mobile number / name) in the
// "New Invoice" flow.
export const patientSearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Type at least one character to search').max(60),
  limit: z.coerce.number().int().positive().max(50).optional(),
});
export const patientSearchSchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  gender: z.string().optional(),
  bloodGroup: z.string().optional(),
});