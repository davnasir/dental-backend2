import {
  listChambers,
  listAdminChambers,
  getChamber,
  createChamber,
  updateChamber,
  deleteChamber,
} from '../services/chamber.service.js';
import { successResponse } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';

export const getPublicChambers = async (req, res) => {
  const items = await listChambers({ status: 'ACTIVE' });
  return successResponse(res, 200, 'Chambers fetched', { items });
};

export const getChambersAdmin = async (req, res) => {
  const data = await listAdminChambers(req.query);
  return successResponse(res, 200, 'Chambers fetched', data);
};

export const getChamberById = async (req, res) => {
  const chamber = await getChamber(req.params.id);
  return successResponse(res, 200, 'Chamber fetched', { chamber });
};

export const postChamber = async (req, res) => {
  const chamber = await createChamber(req.body);
  await logAudit({ userId: req.user.id, action: 'CHAMBER_CREATED', entity: 'Chamber', entityId: chamber.id, ip: getClientIp(req) });
  return successResponse(res, 201, 'Chamber created', { chamber });
};

export const putChamber = async (req, res) => {
  const chamber = await updateChamber(req.params.id, req.body);
  await logAudit({ userId: req.user.id, action: 'CHAMBER_UPDATED', entity: 'Chamber', entityId: chamber.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Chamber updated', { chamber });
};

export const removeChamber = async (req, res) => {
  const result = await deleteChamber(req.params.id);
  await logAudit({ userId: req.user.id, action: 'CHAMBER_DELETED', entity: 'Chamber', entityId: req.params.id, metadata: result, ip: getClientIp(req) });
  return successResponse(res, 200, result.deactivated ? 'Chamber deactivated (has appointments)' : 'Chamber deleted', result);
};