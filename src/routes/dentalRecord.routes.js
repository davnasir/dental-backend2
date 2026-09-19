import express from 'express';
import { protect, can } from '../middleware/auth.js';
import { validate } from '../utils/index.js';
import { dentalChartUpdateSchema, bulkDentalUpdateSchema } from '../validators/dentalRecord.validator.js';
import {
  getDentalRecords,
  initDentalChartEndpoint,
  updateTooth,
  bulkUpdateDentalChart,
} from '../controllers/dentalRecord.controller.js';

const router = express.Router();

router.use(protect, can('SUPER_ADMIN', 'ADMIN', 'DOCTOR'));

router.get('/patient/:patientId', getDentalRecords);
router.post('/patient/:patientId/init', initDentalChartEndpoint);
router.post('/patient/:patientId/tooth', validate(dentalChartUpdateSchema), updateTooth);
router.post('/patient/:patientId/bulk', validate(bulkDentalUpdateSchema), bulkUpdateDentalChart);

export default router;