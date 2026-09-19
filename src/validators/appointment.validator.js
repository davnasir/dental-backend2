import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const baseAppointmentSchema = z.object({
  patientId: z.number().int().positive().optional(),
  patient: z
    .object({
      fullName: z.string().min(2),
      phone: z.string().min(8).optional(),
      email: z.string().email().optional().or(z.literal('')),
    })
    .optional(),
  doctorId: z.number().int().positive(),
  serviceId: z.number().int().positive().optional(),
  serviceSlug: z.string().optional(),
  chamberId: z.number().int().positive().optional(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  appointmentTime: z.string().regex(timeRegex, 'Time must be HH:mm (24h format)'),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
});

export const createAppointmentSchema = baseAppointmentSchema.refine(
  (data) => data.patientId || data.patient,
  'patientId or patient info is required'
);

export const updateAppointmentSchema = z.object({
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  appointmentTime: z.string().regex(timeRegex).optional(),
  doctorId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive().optional().nullable(),
  chamberId: z.number().int().positive().optional().nullable(),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const changeStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  cancellationReason: z.string().optional().nullable(),
});

export const availabilityQuerySchema = z.object({
  doctorId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const appointmentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.string().optional(),
  doctorId: z.coerce.number().int().positive().optional(),
  patientId: z.coerce.number().int().positive().optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().optional(),
});