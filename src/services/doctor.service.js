import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

const publicDoctorSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  specialization: true,
  qualification: true,
  registrationNumber: true,
  experience: true,
  bio: true,
  profileImage: true,
  consultationFee: true,
  workingHours: true,
  availability: true,
  sortOrder: true,
  status: true,
};

const toDoctorId = (id) => {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, 'Invalid doctor id');
  return n;
};

export const listPublicDoctors = async () => {
  return prisma.doctor.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: publicDoctorSelect,
  });
};

export const listDoctors = async ({ page = 1, limit = 50, search = '', status, specialization }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {
    ...(status ? { status } : { status: { not: 'INACTIVE' } }),
    ...(specialization ? { specialization: { contains: specialization } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { specialization: { contains: search } },
            { qualification: { contains: search } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.doctor.findMany({ where, skip, take: Number(limit), orderBy: { id: 'asc' } }),
    prisma.doctor.count({ where }),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
};

export const getDoctor = async (id) => {
  const doctor = await prisma.doctor.findUnique({
    where: { id: toDoctorId(id) },
    include: {
      appointments: {
        orderBy: { appointmentDate: 'desc' },
        take: 20,
        include: { patient: { select: { id: true, firstName: true, lastName: true, patientId: true } } },
      },
      _count: { select: { appointments: true, treatments: true, prescriptions: true } },
    },
  });
  if (!doctor) throw new ApiError(404, 'Doctor not found');
  return doctor;
};

export const getPublicDoctor = async (id) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: toDoctorId(id) }, select: publicDoctorSelect });
  if (!doctor || doctor.status !== 'ACTIVE') throw new ApiError(404, 'Doctor not found');
  return doctor;
};

export const createDoctor = async (data) => {
  const { email } = data;
  if (email) {
    const existing = await prisma.doctor.findUnique({ where: { email } });
    if (existing) throw new ApiError(409, 'A doctor with this email already exists');
  }
  return prisma.doctor.create({ data });
};

export const updateDoctor = async (id, data) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: toDoctorId(id) } });
  if (!doctor) throw new ApiError(404, 'Doctor not found');

  if (data.email && data.email !== doctor.email) {
    const existing = await prisma.doctor.findUnique({ where: { email: data.email } });
    if (existing) throw new ApiError(409, 'A doctor with this email already exists');
  }
  const patch = { ...data };
  patch.email = data.email || null;
  return prisma.doctor.update({ where: { id: doctor.id }, data: patch });
};

export const removeDoctor = async (id) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: toDoctorId(id) } });
  if (!doctor) throw new ApiError(404, 'Doctor not found');

  const activeAppointments = await prisma.appointment.count({
    where: { doctorId: doctor.id, status: { notIn: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] } },
  });
  if (activeAppointments > 0) {
    await prisma.doctor.update({ where: { id: doctor.id }, data: { status: 'INACTIVE' } });
    return { deactivated: true };
  }
  try {
    await prisma.doctor.delete({ where: { id: doctor.id } });
    return { deactivated: false };
  } catch (err) {
    if (err.code === 'P2003') {
      await prisma.doctor.update({ where: { id: doctor.id }, data: { status: 'INACTIVE' } });
      return { deactivated: true };
    }
    throw err;
  }
};

export const setDoctorAvailability = async (id, data) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: toDoctorId(id) } });
  if (!doctor) throw new ApiError(404, 'Doctor not found');
  return prisma.doctor.update({
    where: { id: doctor.id },
    data: { availability: data.availability, workingHours: data.workingHours },
  });
};