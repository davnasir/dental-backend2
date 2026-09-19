import prisma from '../config/prisma.js';
import { listUsers, updateUser } from '../services/user.service.js';
import { successResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';

export const getUsers = async (req, res) => {
  const { page, limit, search, role } = req.query;
  const result = await listUsers({ page, limit, search, role });
  return successResponse(res, 200, 'Users fetched', result);
};

export const patchUser = async (req, res) => {
  const user = await updateUser(Number(req.params.id), req.body, req.user.id);
  await logAudit({
    userId: req.user.id,
    action: 'USER_UPDATED',
    entity: 'User',
    entityId: user.id,
    metadata: { changed: req.body },
    ip: getClientIp(req),
  });
  return successResponse(res, 200, 'User updated', { user: {
    id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, status: user.status,
  } });
};

export const removeUser = async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: Number(req.params.id) } });
  if (!target) throw new ApiError(404, 'User not found');
  if (target.id === req.user.id) throw new ApiError(400, 'You cannot delete your own account.');

  if (['DOCTOR', 'RECEPTIONIST', 'STAFF'].includes(target.role)) {
    await prisma.user.delete({ where: { id: target.id } });
  } else {
    await prisma.user.update({ where: { id: target.id }, data: { status: 'INACTIVE' } });
  }

  await logAudit({
    userId: req.user.id,
    action: 'USER_DELETED',
    entity: 'User',
    entityId: target.id,
    metadata: { role: target.role },
    ip: getClientIp(req),
  });
  return successResponse(res, 200, 'User removed');
};