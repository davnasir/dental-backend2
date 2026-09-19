import {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  voidInvoice,
} from '../services/invoice.service.js';
import { recordPayment, listPayments } from '../services/payment.service.js';
import { successResponse } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';
import { createNotification } from '../services/notification.service.js';
import { sendAppointmentEmail } from '../services/email.service.js';

export const getInvoices = async (req, res) => {
  const data = await listInvoices(req.query);
  return successResponse(res, 200, 'Invoices fetched', data);
};

export const getInvoiceById = async (req, res) => {
  const invoice = await getInvoice(req.params.id);
  return successResponse(res, 200, 'Invoice fetched', { invoice });
};

export const postInvoice = async (req, res) => {
  const invoice = await createInvoice(req.body, req.user.id);
  await logAudit({ userId: req.user.id, action: 'INVOICE_CREATED', entity: 'Invoice', entityId: invoice.id, ip: getClientIp(req) });
  await createNotification({
    broadcast: true,
    type: 'INVOICE_CREATED',
    title: 'New invoice generated',
    message: `${invoice.invoiceNumber} for ${invoice.patient.firstName} ${invoice.patient.lastName}`,
    link: `/admin/invoices/${invoice.id}`,
  });
  if (invoice.patient.email) {
    sendAppointmentEmail({
      email: invoice.patient.email,
      name: `${invoice.patient.firstName} ${invoice.patient.lastName}`.trim(),
      appointmentNumber: invoice.invoiceNumber,
      doctorName: 'Nahol Dental Care',
      serviceName: 'Invoice',
      date: '',
      time: '',
      status: 'Generated',
    });
  }
  return successResponse(res, 201, 'Invoice created', { invoice });
};

export const putInvoice = async (req, res) => {
  const invoice = await updateInvoice(req.params.id, req.body);
  await logAudit({ userId: req.user.id, action: 'INVOICE_UPDATED', entity: 'Invoice', entityId: invoice.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Invoice updated', { invoice });
};

export const removeInvoice = async (req, res) => {
  const result = await voidInvoice(req.params.id);
  await logAudit({ userId: req.user.id, action: 'INVOICE_VOIDED', entity: 'Invoice', entityId: req.params.id, metadata: result, ip: getClientIp(req) });
  return successResponse(res, 200, result.refunded ? 'Invoice voided and marked refunded' : 'Invoice deleted', result);
};

export const postPayment = async (req, res) => {
  const { payment, invoice } = await recordPayment(req.body, req.user.id);
  await logAudit({ userId: req.user.id, action: 'PAYMENT_RECORDED', entity: 'Payment', entityId: payment.id, metadata: { amount: payment.amount, method: payment.method }, ip: getClientIp(req) });
  await createNotification({
    broadcast: true,
    type: 'PAYMENT_RECEIVED',
    title: 'Payment received',
    message: `৳${payment.amount} received on invoice ${invoice.id}`,
  });
  return successResponse(res, 201, 'Payment recorded successfully', { payment });
};

export const getPayments = async (req, res) => {
  const data = await listPayments(req.query);
  return successResponse(res, 200, 'Payments fetched', data);
};