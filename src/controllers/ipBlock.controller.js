import { listIpBlocks, blockIp, unblockIp } from '../services/ipBlock.service.js';
import { successResponse } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';

export const getIpBlocks = async (req, res) => {
  const data = await listIpBlocks(req.query);
  return successResponse(res, 200, 'Blocked IPs fetched', data);
};

export const postIpBlock = async (req, res) => {
  const item = await blockIp(req.body.ip, req.body.reason, req.user.id);
  await logAudit({ userId: req.user.id, action: 'IP_BLOCKED', entity: 'IpBlock', entityId: item.id, metadata: { ip: item.ip }, ip: getClientIp(req) });
  return successResponse(res, 201, 'IP address blocked successfully', { item });
};

export const deleteIpBlock = async (req, res) => {
  const item = await unblockIp(req.params.id);
  await logAudit({ userId: req.user.id, action: 'IP_UNBLOCKED', entity: 'IpBlock', entityId: item.id, metadata: { ip: item.ip }, ip: getClientIp(req) });
  return successResponse(res, 200, 'IP address unblocked successfully', { item });
};