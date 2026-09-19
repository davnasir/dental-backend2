import {
  listPublicDoctors,
  listDoctors,
  getDoctor,
  getPublicDoctor,
  createDoctor,
  updateDoctor,
  removeDoctor,
  setDoctorAvailability,
} from '../services/doctor.service.js';
import { successResponse } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';
import { toUploadUrl } from '../utils/uploadUrl.js';

export const getPublicDoctors = async (req, res) => {
  const data = await listPublicDoctors();
  return successResponse(res, 200, 'Doctors fetched', { items: data });
};

export const getPublicDoctorById = async (req, res) => {
  const doctor = await getPublicDoctor(req.params.id);
  return successResponse(res, 200, 'Doctor fetched', { doctor });
};

export const getDoctors = async (req, res) => {
  const data = await listDoctors(req.query);
  return successResponse(res, 200, 'Doctors fetched', data);
};

export const getDoctorById = async (req, res) => {
  const doctor = await getDoctor(req.params.id);
  return successResponse(res, 200, 'Doctor fetched', { doctor });
};

export const postDoctor = async (req, res) => {
  const doctor = await createDoctor({ ...req.body, profileImage: toUploadUrl(req.file) || req.body.profileImage });
  await logAudit({ userId: req.user.id, action: 'DOCTOR_CREATED', entity: 'Doctor', entityId: doctor.id, ip: getClientIp(req) });
  return successResponse(res, 201, 'Doctor created successfully', { doctor });
};

export const putDoctor = async (req, res) => {
  const doctor = await updateDoctor(req.params.id, { ...req.body, profileImage: toUploadUrl(req.file) || req.body.profileImage });
  await logAudit({ userId: req.user.id, action: 'DOCTOR_UPDATED', entity: 'Doctor', entityId: doctor.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Doctor updated successfully', { doctor });
};

export const deleteDoctor = async (req, res) => {
  const result = await removeDoctor(req.params.id);
  await logAudit({ userId: req.user.id, action: 'DOCTOR_DELETED', entity: 'Doctor', entityId: req.params.id, metadata: result, ip: getClientIp(req) });
  return successResponse(res, 200, result.deactivated ? 'Doctor deactivated (has active appointments)' : 'Doctor removed', result);
};

export const updateAvailability = async (req, res) => {
  const doctor = await setDoctorAvailability(req.params.id, req.body);
  await logAudit({ userId: req.user.id, action: 'DOCTOR_AVAILABILITY_UPDATED', entity: 'Doctor', entityId: doctor.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Availability updated', { doctor });
};