import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { singleImage } from '../middleware/upload.js';
import { successResponse } from '../utils/apiResponse.js';
import { getDashboardStats, getDashboardCharts } from '../controllers/dashboard.controller.js';

const router = express.Router();

router.use(protect);

router.get('/stats', authorize('SUPER_ADMIN', 'ADMIN'), getDashboardStats);
router.get('/charts', authorize('SUPER_ADMIN', 'ADMIN'), getDashboardCharts);

router.post('/upload', authorize('SUPER_ADMIN', 'ADMIN', 'DOCTOR'), singleImage, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  return successResponse(res, 201, 'File uploaded', { url: `/uploads/${req.file.filename}`, filename: req.file.filename });
});

export default router;