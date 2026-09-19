import {
  getAllPrescriptions,
  getPrescription,
  createPrescription,
  updatePrescription,
  deletePrescription,
} from '../services/prescription.service.js';
import { successResponse } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';

export const getPrescriptions = async (req, res) => {
  const data = await getAllPrescriptions(req.query);
  return successResponse(res, 200, 'Prescriptions fetched', data);
};

export const getPrescriptionById = async (req, res) => {
  const prescription = await getPrescription(req.params.id);
  return successResponse(res, 200, 'Prescription fetched', { prescription });
};

export const postPrescription = async (req, res) => {
  const prescription = await createPrescription(req.body);
  await logAudit({ userId: req.user.id, action: 'PRESCRIPTION_CREATED', entity: 'Prescription', entityId: prescription.id, ip: getClientIp(req) });
  return successResponse(res, 201, 'Prescription created', { prescription });
};

export const putPrescription = async (req, res) => {
  const prescription = await updatePrescription(req.params.id, req.body);
  await logAudit({ userId: req.user.id, action: 'PRESCRIPTION_UPDATED', entity: 'Prescription', entityId: prescription.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Prescription updated', { prescription });
};

export const removePrescription = async (req, res) => {
  await deletePrescription(req.params.id);
  await logAudit({ userId: req.user.id, action: 'PRESCRIPTION_DELETED', entity: 'Prescription', entityId: req.params.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Prescription deleted');
};