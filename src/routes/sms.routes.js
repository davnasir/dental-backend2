import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../utils/index.js';
import { saveSmsConfigSchema, testSmsSchema } from '../validators/sms.validator.js';
import {
  getSmsConfig,
  putSmsConfig,
  postSmsTest,
  getSmsBalance,
} from '../controllers/sms.controller.js';

// Gateway configuration holds a billing credential, so this router is mounted
// behind authentication on every path. There is deliberately no public route
// for SMS settings -- see the note in smsConfig.service.js about the `setting`
// collection being readable without auth.
const router = express.Router();
router.use(protect, authorize('SUPER_ADMIN', 'ADMIN'));

router.get('/', getSmsConfig);
router.put('/', validate(saveSmsConfigSchema), putSmsConfig);
router.post('/test', validate(testSmsSchema), postSmsTest);
router.get('/balance', getSmsBalance);

export default router;
