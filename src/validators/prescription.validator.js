import { z } from 'zod';

// Dosage / frequency / duration accept either a single value or a list of
// values so one medicine row can carry several entries at once. Blank values
// are dropped rather than rejected, which lets the dynamic UI send partially
// filled rows without tripping validation.
const entries = () =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .nullable()
    .transform((value) => {
      if (value === null || value === undefined) return null;
      const list = (Array.isArray(value) ? value : [value])
        .map((v) => String(v).trim())
        .filter(Boolean);
      return list.length ? list : null;
    });

const optionalText = () => z.string().trim().optional().nullable();

export const prescriptionItemSchema = z.object({
  medicine: z.string().trim().min(1, 'Medicine name is required'),
  dosage: entries(),
  frequency: entries(),
  duration: entries(),
  notes: optionalText(),
});

const shape = {
  patientId: z.coerce.number().int().positive(),
  doctorId: z.coerce.number().int().positive(),
  // The branch the prescription is written against. When omitted, the service
  // falls back to the chamber of the patient's most recent appointment, so the
  // printed pad matches the branch that was selected at booking time.
  chamberId: z.coerce.number().int().positive().optional().nullable(),
  // Dynamic, unbounded (within reason) list of medicine rows.
  items: z
    .array(prescriptionItemSchema)
    .min(1, 'At least one medicine entry is required')
    .max(100, 'A prescription cannot hold more than 100 medicine entries')
    .optional(),
  // Legacy single-medicine payload, still accepted and folded into items[].
  medicine: optionalText(),
  dosage: entries(),
  frequency: entries(),
  duration: entries(),
  instructions: optionalText(),
  notes: optionalText(),
  followUpDate: optionalText(),
};

export const prescriptionSchema = z.object(shape).superRefine((data, ctx) => {
  const hasItems = Array.isArray(data.items) && data.items.length > 0;
  const hasLegacy = typeof data.medicine === 'string' && data.medicine.length > 0;
  if (!hasItems && !hasLegacy) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['items'],
      message: 'At least one medicine entry is required',
    });
  }
});

export const prescriptionUpdateSchema = z.object(shape).partial();
