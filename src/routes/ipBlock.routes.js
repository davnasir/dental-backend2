import express from 'express';
import { protect, can } from '../middleware/auth.js';
import { validate } from '../utils/index.js';
import { ipBlockSchema, ipBlockListQuerySchema } from '../validators/content.validator.js';
import { getIpBlocks, postIpBlock, deleteIpBlock } from '../controllers/ipBlock.controller.js';

const router = express.Router();
router.use(protect, can('SUPER_ADMIN', 'ADMIN'));

router.get('/', validate(ipBlockListQuerySchema, 'query'), getIpBlocks);
router.post('/', validate(ipBlockSchema), postIpBlock);
router.delete('/:id', deleteIpBlock);

export default router;