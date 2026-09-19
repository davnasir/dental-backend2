import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

export const listDentalRecords = async (patientId) => {
  const patient = await prisma.patient.findUnique({ where: { id: Number(patientId) } });
  if (!patient) throw new ApiError(404, 'Patient not found');
  return prisma.dentalRecord.findMany({
    where: { patientId: patient.id },
    orderBy: { toothNumber: 'asc' },
  });
};

export const initDentalChart = async (patientId) => {
  const patient = await prisma.patient.findUnique({ where: { id: Number(patientId) } });
  if (!patient) throw new ApiError(404, 'Patient not found');

  const existing = await prisma.dentalRecord.count({ where: { patientId: patient.id } });
  if (existing === 0) {
    const data = [];
    for (let t = 1; t <= 32; t += 1) data.push({ patientId: patient.id, toothNumber: t, status: 'HEALTHY' });
    await prisma.dentalRecord.createMany({ data });
  }
  return prisma.dentalRecord.findMany({
    where: { patientId: patient.id },
    orderBy: { toothNumber: 'asc' },
  });
};

export const upsertTooth = async ({ patientId, toothNumber, ...rest }) => {
  const patient = await prisma.patient.findUnique({ where: { id: Number(patientId) } });
  if (!patient) throw new ApiError(404, 'Patient not found');

  return prisma.dentalRecord.upsert({
    where: { patientId_toothNumber: { patientId: patient.id, toothNumber } },
    create: { patientId: patient.id, toothNumber, ...rest },
    update: rest,
  });
};

export const bulkUpdateTeeth = async ({ patientId, teeth }) => {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw new ApiError(404, 'Patient not found');

  const existingMap = new Map(
    (await prisma.dentalRecord.findMany({ where: { patientId: patient.id } })).map((r) => [r.toothNumber, r.id])
  );

  const tx = teeth.map((t) => {
    const existingId = existingMap.get(t.toothNumber);
    if (existingId) {
      return prisma.dentalRecord.update({ where: { id: existingId }, data: t });
    }
    return prisma.dentalRecord.create({
      data: { patientId: patient.id, toothNumber: t.toothNumber, status: t.status || 'HEALTHY', ...t },
    });
  });

  await prisma.$transaction(tx);
  return prisma.dentalRecord.findMany({
    where: { patientId: patient.id },
    orderBy: { toothNumber: 'asc' },
  });
};