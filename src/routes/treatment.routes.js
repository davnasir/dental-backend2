import express from 'express';
import { protect, authorize, can } from '../middleware/auth.js';
import { validate } from '../utils/index.js';
import { treatmentSchema, treatmentUpdateSchema } from '../validators/treatment.validator.js';
import {
  getTreatments,
  getTreatmentById,
  postTreatment,
  putTreatment,
  removeTreatment,
} from '../controllers/treatment.controller.js';

const router = express.Router();

router.use(protect, can('SUPER_ADMIN', 'ADMIN', 'DOCTOR'));

router.get('/', getTreatments);
router.get('/:id', getTreatmentById);
router.post('/', validate(treatmentSchema), postTreatment);
router.put('/:id', validate(treatmentUpdateSchema), putTreatment);
router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), removeTreatment);

export default router;