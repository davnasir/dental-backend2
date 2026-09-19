import express from 'express';
import { protect, can } from '../middleware/auth.js';
import { validate } from '../utils/index.js';
import {
  patientSchema,
  patientUpdateSchema,
  patientSearchQuerySchema,
} from '../validators/patient.validator.js';
import {
  getPatients,
  getPatientById,
  postPatient,
  putPatient,
  deletePatient,
  searchPatientsHandler,
} from '../controllers/patient.controller.js';

const router = express.Router();

router.use(protect);

router.get('/', can('SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'RECEPTIONIST'), getPatients);
// Must be registered before get('/:id') so "search" is not matched as an id.
router.get('/search', can('SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'RECEPTIONIST'), validate(patientSearchQuerySchema, 'query'), searchPatientsHandler);
router.get('/:id', can('SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'RECEPTIONIST'), getPatientById);
router.post('/', can('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'), validate(patientSchema), postPatient);
router.put('/:id', can('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'), validate(patientUpdateSchema), putPatient);
router.delete('/:id', can('SUPER_ADMIN', 'ADMIN'), deletePatient);

export default router;