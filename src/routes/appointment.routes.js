import express from 'express';
import { protect, can } from '../middleware/auth.js';
import { validate } from '../utils/index.js';
import { publicLimiter } from '../middleware/rateLimiter.js';
import { blockedIpGuard } from '../middleware/blockedIp.js';
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  changeStatusSchema,
  appointmentListQuerySchema,
} from '../validators/appointment.validator.js';
import {
  getAppointments,
  getAppointmentById,
  postAppointment,
  publicBookAppointment,
  putAppointment,
  removeAppointment,
  patchStatus,
  getSlots,
} from '../controllers/appointment.controller.js';

const publicRouter = express.Router();
publicRouter.use(blockedIpGuard);
publicRouter.post('/book', publicLimiter, validate(createAppointmentSchema), publicBookAppointment);
publicRouter.get('/slots', getSlots);

const adminRouter = express.Router();
adminRouter.use(protect, can('SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'RECEPTIONIST'));

adminRouter.get('/', validate(appointmentListQuerySchema, 'query'), getAppointments);
adminRouter.get('/:id', getAppointmentById);
adminRouter.post('/', validate(createAppointmentSchema), postAppointment);
adminRouter.put('/:id', validate(updateAppointmentSchema), putAppointment);
adminRouter.delete('/:id', removeAppointment);
adminRouter.patch('/:id/status', validate(changeStatusSchema), patchStatus);

export default { publicRouter, adminRouter };