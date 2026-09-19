import express from 'express';
import { protect, can } from '../middleware/auth.js';
import { getMyNotifications, markAsRead, markAllRead } from '../controllers/notification.controller.js';

const router = express.Router();

router.use(protect, can('SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'RECEPTIONIST', 'STAFF'));

router.get('/', getMyNotifications);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markAsRead);

export default router;