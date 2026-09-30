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

export const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const SHORT_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const DEFAULT_WORKING_HOURS = {
  saturday: { start: '10:00', end: '21:00' },
  sunday: { start: '10:00', end: '21:00' },
  monday: { start: '10:00', end: '21:00' },
  tuesday: { start: '10:00', end: '21:00' },
  wednesday: { start: '10:00', end: '21:00' },
  thursday: { start: '10:00', end: '21:00' },
  friday: { start: '16:00', end: '21:00' },
};

const SLOT_STEP_MINUTES = 30;

// A booking only holds its slot for two days. Once two days have elapsed the
// hold expires and the same doctor/branch/date/time becomes bookable again, so a
// stale or abandoned request cannot lock a slot out forever. `gt` (not `gte`)
// means the hold is released the moment it reaches exactly two days old.
const SLOT_HOLD_DAYS = 2;

const slotHoldCutoff = () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SLOT_HOLD_DAYS);
  return cutoff;
};

const CLOSED_MARKERS = new Set(['', 'closed', 'close', 'off', 'none', 'null', '-', 'holiday']);

// Accepts "sunday" | "sun" | "sat" | "0".."6" -> full lowercase day name.
const normalizeDayKey = (key) => {
  const k = String(key ?? '').trim().toLowerCase();
  if (!k) return null;
  if (/^[0-6]$/.test(k)) return DAYS[Number(k)];
  const idx = SHORT_DAYS.indexOf(k.slice(0, 3));
  return idx === -1 ? null : DAYS[idx];
};

const normalizeTime = (value) => {
  const m = String(value ?? '').trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 24) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
};

// Accepts { start, end } objects and "10:00-21:00" strings. Returns null when the
// day is explicitly marked closed so admins can switch a branch off per weekday.
const parseHourValue = (value) => {
  if (value === null || value === undefined || value === false) return null;

  if (typeof value === 'string') {
    const raw = value.trim();
    if (CLOSED_MARKERS.has(raw.toLowerCase())) return null;
    const m = raw.match(/^(\d{1,2}:[0-5]\d)\s*(?:-|–|—|to)\s*(\d{1,2}:[0-5]\d)$/i);
    if (!m) return null;
    const start = normalizeTime(m[1]);
    const end = normalizeTime(m[2]);
    return start && end ? { start, end } : null;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const start = normalizeTime(value.start);
    const end = normalizeTime(value.end);
    return start && end ? { start, end } : null;
  }

  return null;
};

const isClosedMarker = (value) => {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === 'string') return CLOSED_MARKERS.has(value.trim().toLowerCase());
  return false;
};

const toMinutes = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};

const fromMinutes = (min) => {
  const hh = String(Math.floor(min / 60)).padStart(2, '0');
  const mm = String(min % 60).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const dayNameFor = (date) => DAYS[new Date(`${date}T00:00:00`).getDay()];

// Returns the hours for a day, or null when the day is explicitly closed.
// Unparseable values fall back to the defaults rather than silently closing
// the branch, so a typo cannot take a branch offline.
export const getWorkingHoursFor = (entity, date) => {
  const day = dayNameFor(date);
  const raw = entity?.workingHours;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const match = Object.entries(raw).find(([key]) => normalizeDayKey(key) === day);
    if (match) {
      if (isClosedMarker(match[1])) return null;
      const parsed = parseHourValue(match[1]);
      if (parsed) return parsed;
    }
  }
  return DEFAULT_WORKING_HOURS[day] || null;
};

// Combine doctor + chamber (branch) availability for a given date into start/end
// minutes. A branch is only open when the doctor and the branch overlap, so
// booking can never be offered or accepted outside the branch's operating hours.
export const availabilityWindow = (doctor, chamber, date) => {
  const doctorH = getWorkingHoursFor(doctor, date);
  const chamberH = chamber ? getWorkingHoursFor(chamber, date) : null;

  // A selected branch that is closed leaves nothing bookable, even if the
  // doctor is working elsewhere that day.
  if (chamber && !chamberH) return null;
  if (!doctorH) return null;

  let start = toMinutes(doctorH.start);
  let end = toMinutes(doctorH.end);

  if (chamberH) {
    start = Math.max(start, toMinutes(chamberH.start));
    end = Math.min(end, toMinutes(chamberH.end));
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
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

  const branchName = chamber?.name || null;
  const closedOnDay = branchName
    ? `${branchName} is closed on this day. Please select another date or branch.`
    : 'Clinic is closed on this day. Please select another date.';

  const window = availabilityWindow(doctor, chamber, date);
  if (!window) throw new ApiError(400, closedOnDay);

  if (isDayOff(doctor, date)) {
    throw new ApiError(400, 'Doctor is on leave on this date. Please select another date.');
  }
  if (chamber && isDayOff(chamber, date)) {
    throw new ApiError(400, closedOnDay);
  }

  const timeMin = toMinutes(time);
  const within = timeMin >= window.start && timeMin <= window.end;

  const isFuture = new Date(`${date}T${time}:00`) > new Date();
  if (!isFuture) throw new ApiError(400, 'Selected date and time is in the past.');

  if (!within) {
    throw new ApiError(
      400,
      `Selected time is outside the operating hours of ${branchName || 'the clinic'} (${fromMinutes(window.start)} - ${fromMinutes(window.end)}).`
    );
  }

  const conflict = await prisma.appointment.findFirst({
    where: {
      doctorId,
      chamberId: chamberId || null,
      appointmentDate: new Date(`${date}T00:00:00`),
      appointmentTime: time,
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      createdAt: { gt: slotHoldCutoff() },
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

  const day = dayNameFor(date);
  const dayOff = isDayOff(doctor, date) || (chamber && isDayOff(chamber, date));
  const window = dayOff ? null : availabilityWindow(doctor, chamber, date);

  if (!window) {
    return { slots: [], workingHours: null, closed: true, day, branch: chamber?.name || null };
  }

  const booked = await prisma.appointment.findMany({
    where: {
      doctorId: doctor.id,
      chamberId: chamberId ? Number(chamberId) : null,
      appointmentDate: new Date(`${date}T00:00:00`),
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      // Mirrors the booking check: a hold older than two days no longer blocks
      // the slot, so the form offers exactly what createAppointment will accept.
      createdAt: { gt: slotHoldCutoff() },
    },
    select: { appointmentTime: true },
  });
  const bookedSet = new Set(booked.map((b) => b.appointmentTime));

  const slots = [];
  for (let min = window.start; min <= window.end; min += SLOT_STEP_MINUTES) {
    const time = fromMinutes(min);
    const isPast = new Date(`${date}T${time}:00`) <= new Date();
    if (!bookedSet.has(time) && !isPast) slots.push(time);
  }

  return {
    slots,
    workingHours: { start: fromMinutes(window.start), end: fromMinutes(window.end) },
    closed: false,
    day,
    branch: chamber?.name || null,
  };
};