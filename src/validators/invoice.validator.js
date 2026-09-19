import { z } from 'zod';

export const invoiceItemSchema = z.object({
  description: z.string().min(1),
  amount: z.number().nonnegative(),
});

export const createInvoiceSchema = z.object({
  patientId: z.number().int().positive(),
  appointmentId: z.number().int().positive().optional().nullable(),
  subtotal: z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
  tax: z.number().nonnegative().default(0),
  note: z.string().optional().nullable(),
  items: z.array(invoiceItemSchema).optional(),
});

export const updateInvoiceSchema = z.object({
  subtotal: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  tax: z.number().nonnegative().optional(),
  note: z.string().optional().nullable(),
});

export const createPaymentSchema = z.object({
  invoiceId: z.number().int().positive(),
  amount: z.number().positive('Payment amount must be greater than 0'),
  method: z.enum(['CASH', 'CARD', 'BANK', 'MOBILE_BANKING', 'OTHER']).default('CASH'),
  transactionRef: z.string().optional().nullable(),
  paymentDate: z
    .string()
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isNaN(Date.parse(v)), 'Please enter a valid date')
    .optional(),
  note: z.string().optional().nullable(),
});