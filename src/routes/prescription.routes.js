import express from 'express';
import { protect, can } from '../middleware/auth.js';
import { validate } from '../utils/index.js';
import { prescriptionSchema, prescriptionUpdateSchema } from '../validators/prescription.validator.js';
import {
  getPrescriptions,
  getPrescriptionById,
  getVerifyPrescription,
  postPrescription,
  putPrescription,
  removePrescription,
} from '../controllers/prescription.controller.js';

const router = express.Router();

// Public: backs the QR code printed on the prescription pad, so it must be
// registered before the auth guard below.
router.get('/verify/:code', getVerifyPrescription);

router.use(protect, can('SUPER_ADMIN', 'ADMIN', 'DOCTOR'));

router.get('/', getPrescriptions);
router.get('/:id', getPrescriptionById);
router.post('/', validate(prescriptionSchema), postPrescription);
router.put('/:id', validate(prescriptionUpdateSchema), putPrescription);
router.delete('/:id', removePrescription);

export default router;