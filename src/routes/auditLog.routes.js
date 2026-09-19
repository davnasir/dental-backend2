import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { getAuditLogs } from '../controllers/auditLog.controller.js';

const router = express.Router();

router.use(protect, authorize('SUPER_ADMIN', 'ADMIN'));
router.get('/', getAuditLogs);

export default router;