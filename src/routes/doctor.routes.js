import express from 'express';
import { protect, authorize, can } from '../middleware/auth.js';
import { validate } from '../utils/index.js';
import { singleImage } from '../middleware/upload.js';
import { z } from 'zod';
import { doctorSchema, doctorUpdateSchema } from '../validators/doctor.validator.js';
import {
  getPublicDoctors,
  getPublicDoctorById,
  getDoctors,
  getDoctorById,
  postDoctor,
  putDoctor,
  deleteDoctor,
  updateAvailability,
} from '../controllers/doctor.controller.js';

const publicRouter = express.Router();
publicRouter.get('/', getPublicDoctors);
publicRouter.get('/:id', getPublicDoctorById);

const adminRouter = express.Router();
adminRouter.use(protect, authorize('SUPER_ADMIN', 'ADMIN'));

const availabilitySchema = z.object({
  availability: z.record(z.string(), z.unknown()).optional(),
  workingHours: z.record(z.string(), z.unknown()).optional(),
});

adminRouter.get('/', getDoctors);
adminRouter.get('/:id', getDoctorById);
adminRouter.post('/', singleImage, validate(doctorSchema), postDoctor);
adminRouter.put('/:id', singleImage, validate(doctorUpdateSchema), putDoctor);
adminRouter.delete('/:id', deleteDoctor);
adminRouter.patch('/:id/availability', validate(availabilitySchema), updateAvailability);

export default { publicRouter, adminRouter };