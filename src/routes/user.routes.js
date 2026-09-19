import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../utils/index.js';
import { z } from 'zod';
import { getUsers, patchUser, removeUser } from '../controllers/user.controller.js';

const router = express.Router();

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional().nullable(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'RECEPTIONIST', 'STAFF']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  password: z.string().min(8).optional(),
});

router.use(protect, authorize('SUPER_ADMIN', 'ADMIN'));

router.get('/', getUsers);
router.patch('/:id', validate(updateUserSchema), patchUser);
router.delete('/:id', removeUser);

export default router;