import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../utils/index.js';
import { categorySchema, categoryUpdateSchema } from '../validators/category.validator.js';
import {
  getPublicCategories,
  getCategoriesAdmin,
  postCategory,
  putCategory,
  removeCategory,
} from '../controllers/category.controller.js';

const publicRouter = express.Router();
publicRouter.get('/', getPublicCategories);

const adminRouter = express.Router();
adminRouter.use(protect, authorize('SUPER_ADMIN', 'ADMIN'));

adminRouter.get('/', getCategoriesAdmin);
adminRouter.post('/', validate(categorySchema), postCategory);
adminRouter.put('/:id', validate(categoryUpdateSchema), putCategory);
adminRouter.delete('/:id', removeCategory);

export default { publicRouter, adminRouter };