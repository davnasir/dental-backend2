import {
  listPatients,
  searchPatients,
  getPatient,
  createPatient,
  updatePatient,
  softDeletePatient,
} from '../services/patient.service.js';
import { successResponse } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';
import { createNotification } from '../services/notification.service.js';

export const searchPatientsHandler = async (req, res) => {
  const items = await searchPatients(req.query);
  return successResponse(res, 200, 'Patients found', { items });
};

export const getPatients = async (req, res) => {
  const data = await listPatients(req.query);
  return successResponse(res, 200, 'Patients fetched', data);
};

export const getPatientById = async (req, res) => {
  const data = await getPatient(req.params.id);
  return successResponse(res, 200, 'Patient fetched', { patient: data });
};

export const postPatient = async (req, res) => {
  const patient = await createPatient(req.body, req.user.id);
  await logAudit({ userId: req.user.id, action: 'PATIENT_CREATED', entity: 'Patient', entityId: patient.id, ip: getClientIp(req) });
  await createNotification({
    broadcast: true,
    type: 'PATIENT_NEW',
    title: 'New patient registered',
    message: `${patient.firstName} ${patient.lastName} (${patient.patientId}) has been added.`,
    link: `/admin/patients/${patient.id}`,
  });
  return successResponse(res, 201, 'Patient created successfully', { patient });
};

export const putPatient = async (req, res) => {
  const patient = await updatePatient(req.params.id, req.body, req.user.id);
  await logAudit({ userId: req.user.id, action: 'PATIENT_UPDATED', entity: 'Patient', entityId: patient.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Patient updated successfully', { patient });
};

export const deletePatient = async (req, res) => {
  const result = await softDeletePatient(req.params.id);
  await logAudit({ userId: req.user.id, action: 'PATIENT_DELETED', entity: 'Patient', entityId: req.params.id, metadata: result, ip: getClientIp(req) });
  return successResponse(res, 200, result.softDeleted ? 'Patient archived' : 'Patient deleted', result);
};