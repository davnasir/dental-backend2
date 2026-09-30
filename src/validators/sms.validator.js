import { z } from 'zod';

// API key is optional on save: an admin editing only the sender ID should not
// have to retype the key. Empty string is meaningful though -- it clears the
// stored key.
export const saveSmsConfigSchema = z.object({
  apiKey: z.string().max(200).optional(),
  senderId: z.string().max(32).optional(),
  type: z.enum(['text', 'unicode']).optional(),
  enabled: z.boolean().optional(),
});

export const testSmsSchema = z.object({
  to: z.string().min(8, 'A destination number is required'),
  message: z.string().max(500).optional(),
});
