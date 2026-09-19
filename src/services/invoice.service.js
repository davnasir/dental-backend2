import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

const YEAR = new Date().getFullYear();

export const generateInvoiceNumber = async () => {
  const prefix = `INV-${YEAR}-`;
  const last = await prisma.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });
  const next = last ? parseInt(last.invoiceNumber.split('-').pop(), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(5, '0')}`;
};

export const computeInvoiceTotals = ({ subtotal = 0, discount = 0, tax = 0 }) => {
  const cleanSubtotal = Number(subtotal) || 0;
  const cleanDiscount = Number(discount) || 0;
  const cleanTax = Number(tax) || 0;
  const total = Math.max(0, cleanSubtotal - cleanDiscount + cleanTax);
  return { subtotal: cleanSubtotal, discount: cleanDiscount, tax: cleanTax, total };
};

export const listInvoices = async ({ page = 1, limit = 20, patientId, status, q }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {
    ...(patientId ? { patientId: Number(patientId) } : {}),
    ...(status ? { paymentStatus: status } : { paymentStatus: { not: 'REFUNDED' } }),
    ...(q
      ? { OR: [{ invoiceNumber: { contains: q } }, { patient: { firstName: { contains: q } } }, { patient: { phone: { contains: q } } }] }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        patient: { select: { id: true, patientId: true, firstName: true, lastName: true, phone: true } },
        appointment: { select: { id: true, appointmentNumber: true } },
        payments: { orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.invoice.count({ where }),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
};

export const getInvoice = async (id) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: Number(id) },
    include: {
      patient: true,
      appointment: { include: { service: true } },
      payments: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  return invoice;
};

export const createInvoice = async (data, actingUserId = null) => {
  const patient = await prisma.patient.findUnique({ where: { id: data.patientId } });
  if (!patient) throw new ApiError(404, 'Patient not found');

  const totals = computeInvoiceTotals(data);
  const invoiceNumber = await generateInvoiceNumber();

  return prisma.invoice.create({
    data: {
      invoiceNumber,
      patientId: data.patientId,
      appointmentId: data.appointmentId || null,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      paid: 0,
      due: totals.total,
      paymentStatus: totals.total === 0 ? 'PAID' : 'UNPAID',
      note: data.note,
    },
    include: { patient: true },
  });
};

export const updateInvoice = async (id, data) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: Number(id) } });
  if (!invoice) throw new ApiError(404, 'Invoice not found');

  const totals = computeInvoiceTotals({
    subtotal: data.subtotal ?? invoice.subtotal,
    discount: data.discount ?? invoice.discount,
    tax: data.tax ?? invoice.tax,
  });

  const paid = invoice.paid;
  const due = Math.max(0, totals.total - paid);
  const paymentStatus = paid >= totals.total && totals.total > 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';

  return prisma.invoice.update({
    where: { id: invoice.id },
    data: { ...totals, due, paymentStatus, note: data.note ?? invoice.note },
    include: { patient: true, payments: true },
  });
};

export const voidInvoice = async (id) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: Number(id) }, include: { payments: true } });
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  if (invoice.payments.length > 0) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { paymentStatus: 'REFUNDED' },
    });
    return { refunded: true };
  }
  await prisma.invoice.delete({ where: { id: invoice.id } });
  return { deleted: true };
};