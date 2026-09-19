import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { toDateOrNull } from '../utils/date.js';

export const listTreatments = async ({ page = 1, limit = 20, patientId, doctorId }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {
    ...(patientId ? { patientId: Number(patientId) } : {}),
    ...(doctorId ? { doctorId: Number(doctorId) } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.treatmentRecord.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        patient: { select: { id: true, patientId: true, firstName: true, lastName: true } },
        doctor: { select: { id: true, name: true, specialization: true } },
        appointment: { select: { id: true, appointmentNumber: true } },
      },
    }),
    prisma.treatmentRecord.count({ where }),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
};

export const getTreatment = async (id) => {
  const treatment = await prisma.treatmentRecord.findUnique({
    where: { id: Number(id) },
    include: {
      patient: { select: { id: true, patientId: true, firstName: true, lastName: true, phone: true } },
      doctor: { select: { id: true, name: true, specialization: true } },
      appointment: { select: { id: true, appointmentNumber: true, appointmentDate: true } },
    },
  });
  if (!treatment) throw new ApiError(404, 'Treatment record not found');
  return treatment;
};

export const createTreatment = async (data) => {
  const patient = await prisma.patient.findUnique({ where: { id: data.patientId } });
  if (!patient) throw new ApiError(404, 'Patient not found');

  if (data.appointmentId) {
    const appointment = await prisma.appointment.findUnique({ where: { id: data.appointmentId } });
    if (!appointment) throw new ApiError(404, 'Appointment not found');
  }

  const record = await prisma.treatmentRecord.create({
    data: {
      ...data,
      followUpDate: 'followUpDate' in data ? toDateOrNull(data.followUpDate) : null,
    },
    include: { patient: true, doctor: true },
  });

  if (data.appointmentId) {
    await prisma.appointment.update({
      where: { id: data.appointmentId },
      data: { status: 'COMPLETED' },
    });
  }

  return record;
};

export const updateTreatment = async (id, data) => {
  const existing = await prisma.treatmentRecord.findUnique({ where: { id: Number(id) } });
  if (!existing) throw new ApiError(404, 'Treatment record not found');

  return prisma.treatmentRecord.update({
    where: { id: existing.id },
    data: { ...data, followUpDate: 'followUpDate' in data ? toDateOrNull(data.followUpDate) : undefined },
    include: { patient: true, doctor: true, appointment: { select: { id: true, appointmentNumber: true } } },
  });
};

export const deleteTreatment = async (id) => {
  const existing = await prisma.treatmentRecord.findUnique({ where: { id: Number(id) } });
  if (!existing) throw new ApiError(404, 'Treatment record not found');
  await prisma.treatmentRecord.delete({ where: { id: existing.id } });
};