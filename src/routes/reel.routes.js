import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../utils/index.js';
import { singleImage } from '../middleware/upload.js';
import { reelSchema, reelUpdateSchema } from '../validators/reel.validator.js';
import {
  getPublicReels,
  getReelsAdmin,
  postReel,
  putReel,
  removeReel,
} from '../controllers/reel.controller.js';

const publicRouter = express.Router();
publicRouter.get('/', getPublicReels);

const adminRouter = express.Router();
adminRouter.use(protect, authorize('SUPER_ADMIN', 'ADMIN'));

adminRouter.get('/', getReelsAdmin);
adminRouter.post('/', singleImage, validate(reelSchema), postReel);
adminRouter.put('/:id', singleImage, validate(reelUpdateSchema), putReel);
adminRouter.delete('/:id', removeReel);

export default { publicRouter, adminRouter };