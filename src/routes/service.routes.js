import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../utils/index.js';
import { singleImage } from '../middleware/upload.js';
import { z } from 'zod';
import { serviceSchema, serviceUpdateSchema } from '../validators/service.validator.js';
import {
  getPublicServices,
  getPublicServiceBySlug,
  getServicesAdmin,
  postService,
  putService,
  deleteServiceAdmin,
  reorderServiceAdmin,
} from '../controllers/service.controller.js';

const publicRouter = express.Router();
publicRouter.get('/', getPublicServices);
publicRouter.get('/:slug', getPublicServiceBySlug);

const adminRouter = express.Router();
adminRouter.use(protect, authorize('SUPER_ADMIN', 'ADMIN'));

const reorderSchema = z.object({ orderedIds: z.array(z.number().int()).min(1) });

adminRouter.get('/', getServicesAdmin);
adminRouter.post('/', singleImage, validate(serviceSchema), postService);
adminRouter.put('/:id', singleImage, validate(serviceUpdateSchema), putService);
adminRouter.delete('/:id', deleteServiceAdmin);
adminRouter.patch('/reorder', validate(reorderSchema), reorderServiceAdmin);

export default { publicRouter, adminRouter };