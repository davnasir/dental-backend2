import {
  listAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  changeAppointmentStatus,
  getAvailableSlots,
} from '../services/appointment.service.js';
import { successResponse } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';
import { createNotification } from '../services/notification.service.js';
import { sendAppointmentWhatsApp } from '../services/whatsapp.service.js';
import { sendAppointmentEmail } from '../services/email.service.js';
import { toLocalDateStr } from '../utils/date.js';

const notificationMeta = (appointment) => ({
  appointmentId: appointment.id,
  appointmentNumber: appointment.appointmentNumber,
  patientName: [appointment.patient?.firstName, appointment.patient?.lastName].filter(Boolean).join(' '),
  patientPhone: appointment.patient?.phone,
  doctorName: appointment.doctor?.name,
  date: toLocalDateStr(appointment.appointmentDate),
  time: appointment.appointmentTime,
  status: appointment.status,
});

export const getAppointments = async (req, res) => {
  const data = await listAppointments(req.query);
  return successResponse(res, 200, 'Appointments fetched', data);
};

export const getAppointmentById = async (req, res) => {
  const appointment = await getAppointment(req.params.id);
  return successResponse(res, 200, 'Appointment fetched', { appointment });
};

export const postAppointment = async (req, res) => {
  const { appointment } = await createAppointment(req.body, {
    actingUserId: req.user.id,
    ip: getClientIp(req),
  });

  await logAudit({ userId: req.user.id, action: 'APPOINTMENT_CREATED', entity: 'Appointment', entityId: appointment.id, ip: getClientIp(req) });
  await createNotification({
    broadcast: true,
    type: 'APPOINTMENT_NEW',
    title: 'New appointment booked',
    message: `${appointment.appointmentNumber} for ${appointment.patient.firstName} ${appointment.patient.lastName}`,
    link: `/admin/appointments/${appointment.id}`,
    meta: notificationMeta(appointment),
  });

  return successResponse(res, 201, 'Appointment created successfully', { appointment });
};

export const publicBookAppointment = async (req, res) => {
  const { appointment } = await createAppointment(req.body, {
    isPublic: true,
    ip: getClientIp(req),
  });
  const patient = appointment.patient;
  const serviceName = appointment.service?.name?.en || 'Consultation';

  const waPayload = {
    patientName: `${patient.firstName} ${patient.lastName}`.trim(),
    appointmentNumber: appointment.appointmentNumber,
    doctorName: appointment.doctor?.name,
    treatment: serviceName,
    date: toLocalDateStr(appointment.appointmentDate),
    time: appointment.appointmentTime,
  };
  const whatsappLink = sendAppointmentWhatsApp(waPayload);

  await logAudit({ userId: null, action: 'APPOINTMENT_PUBLIC_BOOKED', entity: 'Appointment', entityId: appointment.id, ip: getClientIp(req) });
  await createNotification({
    broadcast: true,
    type: 'APPOINTMENT_NEW',
    title: 'New public appointment requested',
    message: `${appointment.appointmentNumber} for ${patient.firstName} ${patient.lastName}`,
    link: `/admin/appointments/${appointment.id}`,
    meta: notificationMeta(appointment),
  });
  sendAppointmentEmail({
    email: patient.email,
    name: `${patient.firstName} ${patient.lastName}`.trim(),
    appointmentNumber: appointment.appointmentNumber,
    doctorName: appointment.doctor?.name,
    serviceName,
    date: toLocalDateStr(appointment.appointmentDate),
    time: appointment.appointmentTime,
    status: 'Requested',
  });

  return successResponse(res, 201, 'Appointment requested successfully. We will confirm shortly.', {
    appointment,
    whatsappLink,
  });
};

export const putAppointment = async (req, res) => {
  const appointment = await updateAppointment(req.params.id, req.body);
  await logAudit({ userId: req.user.id, action: 'APPOINTMENT_UPDATED', entity: 'Appointment', entityId: appointment.id, ip: getClientIp(req) });
  await createNotification({
    broadcast: true,
    type: 'APPOINTMENT_UPDATED',
    title: 'Appointment rescheduled',
    message: `${appointment.appointmentNumber} moved to ${toLocalDateStr(appointment.appointmentDate)} at ${appointment.appointmentTime}`,
    link: `/admin/appointments/${appointment.id}`,
  });
  return successResponse(res, 200, 'Appointment updated successfully', { appointment });
};

export const patchStatus = async (req, res) => {
  const { appointment } = await changeAppointmentStatus(
    req.params.id,
    req.body.status,
    req.body.cancellationReason
  );
  await logAudit({ userId: req.user.id, action: `APPOINTMENT_${req.body.status}`, entity: 'Appointment', entityId: appointment.id, ip: getClientIp(req) });

  await createNotification({
    broadcast: true,
    type: `APPOINTMENT_${req.body.status}`,
    title: `Appointment ${req.body.status.toLowerCase().replace(/_/g, ' ')}`,
    message: `${appointment.appointmentNumber} is now ${req.body.status.toLowerCase().replace(/_/g, ' ')}`,
    link: `/admin/appointments/${appointment.id}`,
  });

  if (req.body.status === 'CONFIRMED' || req.body.status === 'CANCELLED') {
    sendAppointmentEmail({
      email: appointment.patient.email,
      name: `${appointment.patient.firstName} ${appointment.patient.lastName}`.trim(),
      appointmentNumber: appointment.appointmentNumber,
      doctorName: appointment.doctor?.name,
      serviceName: appointment.service?.name?.en,
      date: toLocalDateStr(appointment.appointmentDate),
      time: appointment.appointmentTime,
      status: req.body.status === 'CONFIRMED' ? 'confirmed' : 'cancelled',
    });
  }

  return successResponse(res, 200, 'Appointment status updated', { appointment });
};

export const removeAppointment = async (req, res) => {
  await deleteAppointment(req.params.id);
  await logAudit({ userId: req.user.id, action: 'APPOINTMENT_DELETED', entity: 'Appointment', entityId: req.params.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Appointment deleted successfully');
};

export const getSlots = async (req, res) => {
  const data = await getAvailableSlots(req.query.doctorId, req.query.date, req.query.chamberId || null);
  return successResponse(res, 200, 'Available slots fetched', data);
};