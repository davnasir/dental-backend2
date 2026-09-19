import {
  listDentalRecords,
  initDentalChart,
  upsertTooth,
  bulkUpdateTeeth,
} from '../services/dentalRecord.service.js';
import { successResponse } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';

export const getDentalRecords = async (req, res) => {
  const records = await listDentalRecords(req.params.patientId);
  return successResponse(res, 200, 'Dental records fetched', { teeth: records });
};

export const initDentalChartEndpoint = async (req, res) => {
  const teeth = await initDentalChart(req.params.patientId);
  return successResponse(res, 200, 'Dental chart initialized', { teeth });
};

export const updateTooth = async (req, res) => {
  const tooth = await upsertTooth({ ...req.body, patientId: Number(req.params.patientId) });
  await logAudit({ userId: req.user.id, action: 'DENTAL_CHART_UPDATED', entity: 'DentalRecord', entityId: tooth.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Tooth updated', { tooth });
};

export const bulkUpdateDentalChart = async (req, res) => {
  const teeth = await bulkUpdateTeeth(req.body);
  await logAudit({ userId: req.user.id, action: 'DENTAL_CHART_BULK_UPDATED', entity: 'DentalRecord', entityId: req.body.patientId, ip: getClientIp(req) });
  return successResponse(res, 200, 'Dental chart updated', { teeth });
};