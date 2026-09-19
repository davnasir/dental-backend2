import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

export const getAllPrescriptions = async ({ page = 1, limit = 20, patientId }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = { ...(patientId ? { patientId: Number(patientId) } : {}) };
  const [items, total] = await Promise.all([
    prisma.prescription.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        patient: { select: { id: true, patientId: true, firstName: true, lastName: true } },
        doctor: { select: { id: true, name: true, specialization: true } },
      },
    }),
    prisma.prescription.count({ where }),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
};

export const getPrescription = async (id) => {
  const prescription = await prisma.prescription.findUnique({
    where: { id: Number(id) },
    include: {
      patient: true,
      doctor: true,
    },
  });
  if (!prescription) throw new ApiError(404, 'Prescription not found');
  return prescription;
};

export const createPrescription = async (data) => {
  return prisma.prescription.create({
    data,
    include: { patient: true, doctor: true },
  });
};

export const updatePrescription = async (id, data) => {
  const existing = await prisma.prescription.findUnique({ where: { id: Number(id) } });
  if (!existing) throw new ApiError(404, 'Prescription not found');
  return prisma.prescription.update({
    where: { id: existing.id },
    data,
    include: { patient: true, doctor: true },
  });
};

export const deletePrescription = async (id) => {
  const existing = await prisma.prescription.findUnique({ where: { id: Number(id) } });
  if (!existing) throw new ApiError(404, 'Prescription not found');
  await prisma.prescription.delete({ where: { id: existing.id } });
};