import {
  listPublicReels,
  listAdminReels,
  createReel,
  updateReel,
  deleteReel,
} from '../services/reel.service.js';
import { successResponse } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';
import { toUploadUrl } from '../utils/uploadUrl.js';

export const getPublicReels = async (req, res) => {
  const items = await listPublicReels();
  return successResponse(res, 200, 'Reels fetched', { items });
};

export const getReelsAdmin = async (req, res) => {
  const data = await listAdminReels(req.query);
  return successResponse(res, 200, 'Reels fetched', data);
};

export const postReel = async (req, res) => {
  const reel = await createReel({ ...req.body, image: toUploadUrl(req.file) || req.body.image });
  await logAudit({ userId: req.user.id, action: 'REEL_CREATED', entity: 'Reel', entityId: reel.id, ip: getClientIp(req) });
  return successResponse(res, 201, 'Reel created', { reel });
};

export const putReel = async (req, res) => {
  const reel = await updateReel(req.params.id, { ...req.body, image: toUploadUrl(req.file) || req.body.image });
  await logAudit({ userId: req.user.id, action: 'REEL_UPDATED', entity: 'Reel', entityId: reel.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Reel updated', { reel });
};

export const removeReel = async (req, res) => {
  const result = await deleteReel(req.params.id);
  await logAudit({ userId: req.user.id, action: 'REEL_DELETED', entity: 'Reel', entityId: req.params.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Reel deleted', result);
};