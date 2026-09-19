import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../utils/index.js';
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  registerUserSchema,
} from '../validators/auth.validator.js';
import {
  login,
  logout,
  refresh,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword,
  registerStaff,
} from '../controllers/auth.controller.js';

const router = express.Router();

router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.get('/me', protect, getMe);
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);
router.post('/change-password', protect, validate(changePasswordSchema), changePassword);
router.post('/register', protect, authorize('SUPER_ADMIN', 'ADMIN'), validate(registerUserSchema), registerStaff);

export default router;