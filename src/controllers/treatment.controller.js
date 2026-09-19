import {
  listTreatments,
  getTreatment,
  createTreatment,
  updateTreatment,
  deleteTreatment,
} from '../services/treatment.service.js';
import { successResponse } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';
import { createNotification } from '../services/notification.service.js';

export const getTreatments = async (req, res) => {
  const data = await listTreatments(req.query);
  return successResponse(res, 200, 'Treatments fetched', data);
};

export const getTreatmentById = async (req, res) => {
  const treatment = await getTreatment(req.params.id);
  return successResponse(res, 200, 'Treatment fetched', { treatment });
};

export const postTreatment = async (req, res) => {
  const treatment = await createTreatment(req.body);
  await logAudit({ userId: req.user.id, action: 'TREATMENT_CREATED', entity: 'Treatment', entityId: treatment.id, ip: getClientIp(req) });
  await createNotification({
    broadcast: true,
    type: 'TREATMENT_COMPLETED',
    title: 'Treatment recorded',
    message: `Treatment completed for ${treatment.patient.firstName} ${treatment.patient.lastName}`,
    link: `/admin/treatments/${treatment.id}`,
  });
  return successResponse(res, 201, 'Treatment record created', { treatment });
};

export const putTreatment = async (req, res) => {
  const treatment = await updateTreatment(req.params.id, req.body);
  await logAudit({ userId: req.user.id, action: 'TREATMENT_UPDATED', entity: 'Treatment', entityId: treatment.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Treatment record updated', { treatment });
};

export const removeTreatment = async (req, res) => {
  await deleteTreatment(req.params.id);
  await logAudit({ userId: req.user.id, action: 'TREATMENT_DELETED', entity: 'Treatment', entityId: req.params.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Treatment record deleted');
};