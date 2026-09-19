import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { toLocalDateStr } from '../utils/date.js';
import { findOrCreatePatient } from './patient.service.js';

const YEAR = new Date().getFullYear();

export const generateAppointmentNumber = async () => {
  const prefix = `APT-${YEAR}-`;
  const last = await prisma.appointment.findFirst({
    where: { appointmentNumber: { startsWith: prefix } },
    orderBy: { appointmentNumber: 'desc' },
    select: { appointmentNumber: true },
  });
  const next = last ? parseInt(last.appointmentNumber.split('-').pop(), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(6, '0')}`;
};

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const DEFAULT_WORKING_HOURS = {
  saturday: { start: '10:00', end: '21:00' },
  sunday: { start: '10:00', end: '21:00' },
  monday: { start: '10:00', end: '21:00' },
  tuesday: { start: '10:00', end: '21:00' },
  wednesday: { start: '10:00', end: '21:00' },
  thursday: { start: '10:00', end: '21:00' },
  friday: { start: '16:00', end: '21:00' },
};

const toMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const fromMinutes = (min) => {
  const hh = String(Math.floor(min / 60)).padStart(2, '0');
  const mm = String(min % 60).padStart(2, '0');
  return `${hh}:${mm}`;
};

const getWorkingHoursFor = (entity, date) => {
  const day = DAYS[new Date(`${date}T00:00:00`).getDay()];
  const custom = entity?.workingHours || {};
  return custom[day] || DEFAULT_WORKING_HOURS[day] || null;
};

// Combine doctor + chamber availability for a given date into start/end minutes.
const availabilityWindow = (doctor, chamber, date) => {
  const doctorH = getWorkingHoursFor(doctor, date);
  const chamberH = chamber ? getWorkingHoursFor(chamber, date) : null;

  if (!doctorH && !chamberH) return null;
  let start = doctorH ? toMinutes(doctorH.start) : toMinutes(chamberH.start);
  let end = doctorH ? toMinutes(doctorH.end) : toMinutes(chamberH.end);

  if (doctorH && chamberH) {
    start = Math.max(start, toMinutes(chamberH.start));
    end = Math.min(end, toMinutes(chamberH.end));
  }
  return { start, end };
};

const isDayOff = (entity, date) => {
  const availability = entity?.availability || {};
  const day = DAYS[new Date(`${date}T00:00:00`).getDay()];
  if (Array.isArray(availability.daysOff)) {
    if (availability.daysOff.includes(date)) return true;
    if (availability.daysOff.includes(day)) return true;
  }
  return false;
};

export const validateAppointmentWindow = async ({
  doctorId,
  chamberId,
  date,
  time,
  excludeAppointmentId = null,
}) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) throw new ApiError(404, 'Doctor not found');
  if (doctor.status !== 'ACTIVE') throw new ApiError(400, 'Doctor is not active');

  const chamber = chamberId
    ? await prisma.chamber.findUnique({ where: { id: chamberId } })
    : null;

  const window = availabilityWindow(doctor, chamber, date);
  if (!window) throw new ApiError(400, 'Clinic is closed on this day. Please select another date.');

  if (isDayOff(doctor, date)) {
    throw new ApiError(400, 'Doctor is on leave on this date. Please select another date.');
  }
  if (chamber && isDayOff(chamber, date)) {
    throw new ApiError(400, 'Chamber is closed on this date. Please select another date.');
  }

  const timeMin = toMinutes(time);
  const within = timeMin >= window.start && timeMin <= window.end;

  const isFuture = new Date(`${date}T${time}:00`) > new Date();
  if (!isFuture) throw new ApiError(400, 'Selected date and time is in the past.');

  if (!within) {
    throw new ApiError(
      400,
      `Selected time is outside the chamber's opening hours (${fromMinutes(window.start)} - ${fromMinutes(window.end)}).`
    );
  }

  const conflict = await prisma.appointment.findFirst({
    where: {
      doctorId,
      chamberId: chamberId || null,
      appointmentDate: new Date(`${date}T00:00:00`),
      appointmentTime: time,
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
  });

  if (conflict) {
    throw new ApiError(409, 'This time slot is already booked. Please select another time.');
  }
};

export const listAppointments = async (query) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const { status, doctorId, chamberId, patientId, fromDate, toDate, date, q } = query;

  const where = {
    ...(status ? { status } : {}),
    ...(doctorId ? { doctorId } : {}),
    ...(chamberId ? { chamberId } : {}),
    ...(patientId ? { patientId } : {}),
    ...(date
      ? { appointmentDate: new Date(`${date}T00:00:00`) }
      : fromDate || toDate
        ? {
            appointmentDate: {
              ...(fromDate ? { gte: new Date(`${fromDate}T00:00:00`) } : {}),
              ...(toDate ? { lte: new Date(`${toDate}T23:59:59`) } : {}),
            },
          }
        : {}),
    ...(q
      ? {
          OR: [
            { appointmentNumber: { contains: q } },
            { patient: { firstName: { contains: q } } },
            { patient: { lastName: { contains: q } } },
            { patient: { phone: { contains: q } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'asc' }],
      include: {
        patient: { select: { id: true, patientId: true, firstName: true, lastName: true, phone: true, email: true } },
        doctor: { select: { id: true, name: true, specialization: true, profileImage: true } },
        service: { select: { id: true, slug: true, name: true } },
        chamber: { select: { id: true, name: true, address: true } },
      },
    }),
    prisma.appointment.count({ where }),
  ]);

  return { items, total, page, limit };
};

export const getAppointment = async (id) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: Number(id) },
    include: {
      patient: { include: { dentalRecords: { orderBy: { toothNumber: 'asc' } } } },
      doctor: true,
      service: true,
      chamber: true,
      treatments: { orderBy: { createdAt: 'desc' } },
      invoice: { include: { payments: { orderBy: { createdAt: 'desc' } } } },
    },
  });
  if (!appointment) throw new ApiError(404, 'Appointment not found');
  return appointment;
};

export const createAppointment = async (data, options = {}) => {
  const { actingUserId = null, isPublic = false, ip = null } = options;

  let patientId = data.patientId;
  if (!patientId && data.patient) {
    const patient = await findOrCreatePatient(data.patient);
    patientId = patient.id;
  }
  if (!patientId) throw new ApiError(400, 'Patient information is required');

  let serviceId = data.serviceId;
  if (!serviceId && data.serviceSlug) {
    const service = await prisma.service.findFirst({
      where: { slug: data.serviceSlug, status: 'ACTIVE' },
    });
    if (!service) throw new ApiError(404, 'Service not found');
    serviceId = service.id;
  }

  await validateAppointmentWindow({
    doctorId: data.doctorId,
    chamberId: data.chamberId,
    date: data.appointmentDate,
    time: data.appointmentTime,
  });

  const appointmentNumber = await generateAppointmentNumber();

  const appointment = await prisma.appointment.create({
    data: {
      appointmentNumber,
      patientId,
      doctorId: data.doctorId,
      serviceId,
      chamberId: data.chamberId || null,
      appointmentDate: new Date(`${data.appointmentDate}T00:00:00`),
      appointmentTime: data.appointmentTime,
      reason: data.reason || null,
      notes: data.notes || null,
      status: isPublic ? 'PENDING' : data.status || 'PENDING',
      publicBooking: isPublic,
      ipAddress: ip || null,
    },
    include: {
      patient: { select: { id: true, patientId: true, firstName: true, lastName: true, phone: true, email: true } },
      doctor: { select: { id: true, name: true, specialization: true } },
      service: { select: { id: true, slug: true, name: true } },
      chamber: { select: { id: true, name: true } },
    },
  });

  return { appointment, patientId, serviceId };
};

export const updateAppointment = async (id, data) => {
  const appointment = await prisma.appointment.findUnique({ where: { id: Number(id) } });
  if (!appointment) throw new ApiError(404, 'Appointment not found');
  if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appointment.status)) {
    throw new ApiError(400, 'Cannot modify a completed or cancelled appointment.');
  }

  const nextDate = data.appointmentDate || toLocalDateStr(appointment.appointmentDate);
  const nextTime = data.appointmentTime || appointment.appointmentTime;

  if (data.appointmentDate || data.appointmentTime || data.doctorId || data.chamberId !== undefined) {
    await validateAppointmentWindow({
      doctorId: data.doctorId || appointment.doctorId,
      chamberId: data.chamberId !== undefined ? data.chamberId : appointment.chamberId,
      date: nextDate,
      time: nextTime,
      excludeAppointmentId: appointment.id,
    });
  }

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      ...(data.appointmentDate ? { appointmentDate: new Date(`${data.appointmentDate}T00:00:00`) } : {}),
      ...(data.appointmentTime ? { appointmentTime: data.appointmentTime } : {}),
      ...(data.doctorId ? { doctorId: data.doctorId } : {}),
      ...(data.serviceId !== undefined ? { serviceId: data.serviceId } : {}),
      ...(data.chamberId !== undefined ? { chamberId: data.chamberId ? Number(data.chamberId) : null } : {}),
      ...(data.reason !== undefined ? { reason: data.reason } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      doctor: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, slug: true } },
      chamber: { select: { id: true, name: true } },
    },
  });
  return updated;
};

export const deleteAppointment = async (id) => {
  try {
    const appointment = await prisma.appointment.findUnique({ where: { id: Number(id) } });
    if (!appointment) throw new ApiError(404, 'Appointment not found');
    await prisma.appointment.delete({ where: { id: appointment.id } });
    return appointment;
  } catch (err) {
    if (err.code === 'P2025') throw new ApiError(404, 'Appointment not found');
    throw err;
  }
};

export const changeAppointmentStatus = async (id, status, cancellationReason = null) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: Number(id) },
    include: { patient: true, doctor: true, service: true },
  });
  if (!appointment) throw new ApiError(404, 'Appointment not found');

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status, ...(cancellationReason ? { cancellationReason } : {}) },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      doctor: { select: { id: true, name: true, specialization: true } },
      service: { select: { id: true, name: true, slug: true } },
      chamber: { select: { id: true, name: true } },
    },
  });
  return { appointment: updated, previous: appointment };
};

export const getAvailableSlots = async (doctorId, date, chamberId = null) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: Number(doctorId) } });
  if (!doctor) throw new ApiError(404, 'Doctor not found');

  let chamber = null;
  if (chamberId) {
    chamber = await prisma.chamber.findUnique({ where: { id: Number(chamberId) } });
    if (!chamber) throw new ApiError(404, 'Chamber not found');
  }

  const window = availabilityWindow(doctor, chamber, date);
  if (!window || isDayOff(doctor, date) || (chamber && isDayOff(chamber, date))) {
    return { slots: [], workingHours: null };
  }

  const booked = await prisma.appointment.findMany({
    where: {
      doctorId: doctor.id,
      chamberId: chamberId ? Number(chamberId) : null,
      appointmentDate: new Date(`${date}T00:00:00`),
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
    },
    select: { appointmentTime: true },
  });
  const bookedSet = new Set(booked.map((b) => b.appointmentTime));

  const slots = [];
  let min = window.start;
  while (min <= window.end) {
    const time = fromMinutes(min);
    const isPast = new Date(`${date}T${time}:00`) <= new Date();
    if (!bookedSet.has(time) && !isPast) slots.push(time);
    min += 30;
  }
  return { slots, workingHours: { start: fromMinutes(window.start), end: fromMinutes(window.end) } };
};