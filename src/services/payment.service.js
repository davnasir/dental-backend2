import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { toDateOrNull } from '../utils/date.js';

export const recordPayment = async (data, receivedById) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: data.invoiceId },
    include: { payments: true },
  });
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  if (invoice.paymentStatus === 'REFUNDED') throw new ApiError(400, 'Cannot pay for a refunded invoice.');
  if (Number(data.amount) <= 0) throw new ApiError(400, 'Payment amount must be greater than 0.');

  const existingPaid = Number(invoice.paid || 0);
  const newPaid = existingPaid + Number(data.amount);
  if (newPaid > invoice.total + 0.01) {
    throw new ApiError(400, 'Payment amount exceeds the outstanding balance.');
  }

  const paymentDate = toDateOrNull(data.paymentDate) || new Date();

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        patientId: invoice.patientId,
        amount: Number(data.amount),
        method: data.method || 'CASH',
        transactionRef: data.transactionRef || null,
        paymentDate,
        receivedById,
        note: data.note,
      },
    });

    const due = Math.max(0, invoice.total - newPaid);
    const paymentStatus = newPaid >= invoice.total ? 'PAID' : 'PARTIAL';
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paid: newPaid, due, paymentStatus },
    });

    return created;
  });

  return { payment, invoice: { id: invoice.id, paid: newPaid, due: Math.max(0, invoice.total - newPaid) } };
};

export const listPayments = async ({ page = 1, limit = 20, patientId, invoiceId, method, from, to }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {
    ...(patientId ? { patientId: Number(patientId) } : {}),
    ...(invoiceId ? { invoiceId: Number(invoiceId) } : {}),
    ...(method ? { method } : {}),
    ...(from || to
      ? { paymentDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        invoice: { select: { id: true, invoiceNumber: true, total: true } },
        patient: { select: { id: true, patientId: true, firstName: true, lastName: true, phone: true } },
        receivedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.payment.count({ where }),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
};