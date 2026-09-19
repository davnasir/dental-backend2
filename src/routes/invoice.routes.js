import express from 'express';
import { protect, can } from '../middleware/auth.js';
import { validate } from '../utils/index.js';
import { createInvoiceSchema, updateInvoiceSchema, createPaymentSchema } from '../validators/invoice.validator.js';
import {
  getInvoices,
  getInvoiceById,
  postInvoice,
  putInvoice,
  removeInvoice,
  postPayment,
  getPayments,
} from '../controllers/invoice.controller.js';

const router = express.Router();

router.use(protect);

router.get('/invoices', can('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'), getInvoices);
router.get('/invoices/:id', can('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'), getInvoiceById);
router.post('/invoices', can('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'), validate(createInvoiceSchema), postInvoice);
router.put('/invoices/:id', can('SUPER_ADMIN', 'ADMIN'), validate(updateInvoiceSchema), putInvoice);
router.delete('/invoices/:id', can('SUPER_ADMIN', 'ADMIN'), removeInvoice);

router.get('/payments', can('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'), getPayments);
router.post('/payments', can('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'), validate(createPaymentSchema), postPayment);

export default router;