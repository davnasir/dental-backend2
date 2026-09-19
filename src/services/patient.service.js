import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { toDateOrNull } from '../utils/date.js';

const YEAR = new Date().getFullYear();

export const generatePatientId = async () => {
  const prefix = `PT-${YEAR}-`;
  const last = await prisma.patient.findFirst({
    where: { patientId: { startsWith: prefix } },
    orderBy: { patientId: 'desc' },
    select: { patientId: true },
  });
  const next = last ? parseInt(last.patientId.split('-').pop(), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(5, '0')}`;
};

export const listPatients = async ({ page = 1, limit = 20, q = '', gender, bloodGroup, sortBy = 'createdAt', sortOrder = 'desc' }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {
    isArchived: false,
    ...(gender ? { gender } : {}),
    ...(bloodGroup ? { bloodGroup } : {}),
    ...(q
      ? {
          OR: [
            { patientId: { contains: q } },
            { firstName: { contains: q } },
            { lastName: { contains: q } },
            { phone: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { [sortBy]: sortOrder },
      include: {
        _count: { select: { appointments: true, invoices: true } },
      },
    }),
    prisma.patient.count({ where }),
  ]);

  return { items, total, page: Number(page), limit: Number(limit) };
};

// Lightweight lookup used by the "New Invoice" flow: find patients by mobile
// number or name so staff can attach an invoice without scrolling a huge list.
export const searchPatients = async ({ q = '', limit = 15 }) => {
  const query = String(q).trim();
  if (!query) return [];

  const where = {
    isArchived: false,
    OR: [
      { firstName: { contains: query } },
      { lastName: { contains: query } },
      { phone: { contains: query } },
      { patientId: { contains: query } },
    ],
  };

  return prisma.patient.findMany({
    where,
    take: Number(limit) || 15,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true,
      patientId: true,
      firstName: true,
      lastName: true,
      phone: true,
      gender: true,
      bloodGroup: true,
      address: true,
    },
  });
};

export const getPatient = async (id) => {
  const patient = await prisma.patient.findUnique({
    where: { id: Number(id) },
    include: {
      appointments: {
        orderBy: { appointmentDate: 'desc' },
        include: { doctor: { select: { name: true, specialization: true } }, service: { select: { name: true } } },
      },
      treatments: { orderBy: { createdAt: 'desc' }, include: { doctor: { select: { name: true } } } },
      prescriptions: { orderBy: { createdAt: 'desc' }, include: { doctor: { select: { name: true } } } },
      invoices: { orderBy: { createdAt: 'desc' } },
      payments: { orderBy: { createdAt: 'desc' }, include: { receivedBy: { select: { name: true } } } },
      dentalRecords: { orderBy: { toothNumber: 'asc' } },
    },
  });
  if (!patient || patient.isArchived) throw new ApiError(404, 'Patient not found');
  return patient;
};

export const createPatient = async (data, actingUserId) => {
  const normalized = {
    ...data,
    email: data.email || null,
    phone: data.phone || null,
    dateOfBirth: toDateOrNull(data.dateOfBirth),
  };
  if (normalized.phone) {
    const existing = await prisma.patient.findFirst({ where: { phone: normalized.phone, isArchived: false } });
    if (existing) throw new ApiError(409, 'A patient with this phone number already exists');
  }
  const patientId = await generatePatientId();
  return prisma.patient.create({
    data: {
      ...normalized,
      patientId,
      createdById: actingUserId,
    },
  });
};

export const updatePatient = async (id, data, actingUserId) => {
  const patient = await prisma.patient.findUnique({ where: { id: Number(id) } });
  if (!patient || patient.isArchived) throw new ApiError(404, 'Patient not found');

  if (data.phone && data.phone !== patient.phone) {
    const existing = await prisma.patient.findFirst({
      where: { phone: data.phone, id: { not: patient.id }, isArchived: false },
    });
    if (existing) throw new ApiError(409, 'Another patient already uses this phone number');
  }

  return prisma.patient.update({
    where: { id: patient.id },
    data: {
      ...data,
      dateOfBirth: 'dateOfBirth' in data ? toDateOrNull(data.dateOfBirth) : undefined,
      updatedById: actingUserId,
      email: data.email || null,
      phone: data.phone || null,
    },
  });
};

export const softDeletePatient = async (id) => {
  const patient = await prisma.patient.findUnique({ where: { id: Number(id) } });
  if (!patient || patient.isArchived) throw new ApiError(404, 'Patient not found');

  const hasRecords = await prisma.appointment.count({ where: { patientId: patient.id } })
    || await prisma.treatmentRecord.count({ where: { patientId: patient.id } })
    || await prisma.prescription.count({ where: { patientId: patient.id } })
    || await prisma.invoice.count({ where: { patientId: patient.id } })
    || await prisma.dentalRecord.count({ where: { patientId: patient.id } });

  if (hasRecords > 0) {
    await prisma.patient.update({ where: { id: patient.id }, data: { isArchived: true } });
    return { softDeleted: true };
  }
  await prisma.patient.delete({ where: { id: patient.id } });
  return { softDeleted: false };
};

export const findOrCreatePatient = async ({ fullName, phone, email }) => {
  let patient = null;
  if (phone) {
    patient = await prisma.patient.findFirst({ where: { phone, isArchived: false } });
  }
  if (!patient && email) {
    patient = await prisma.patient.findFirst({ where: { email, isArchived: false } });
  }
  if (patient) return patient;

  const names = (fullName || '').trim().split(/\s+/);
  const firstName = names[0] || 'Patient';
  const lastName = names.slice(1).join(' ');
  const patientId = await generatePatientId();
  return prisma.patient.create({
    data: { firstName, lastName, phone: phone || null, email: email || null, patientId },
  });
};