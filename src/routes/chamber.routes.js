import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../utils/index.js';
import { chamberSchema, chamberUpdateSchema } from '../validators/chamber.validator.js';
import {
  getPublicChambers,
  getChambersAdmin,
  getChamberById,
  postChamber,
  putChamber,
  removeChamber,
} from '../controllers/chamber.controller.js';

const publicRouter = express.Router();
publicRouter.get('/', getPublicChambers);

const adminRouter = express.Router();
adminRouter.use(protect, authorize('SUPER_ADMIN', 'ADMIN'));

adminRouter.get('/', getChambersAdmin);
adminRouter.get('/:id', getChamberById);
adminRouter.post('/', validate(chamberSchema), postChamber);
adminRouter.put('/:id', validate(chamberUpdateSchema), putChamber);
adminRouter.delete('/:id', removeChamber);

export default { publicRouter, adminRouter };