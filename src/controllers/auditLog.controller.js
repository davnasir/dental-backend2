import prisma from '../config/prisma.js';
import { successResponse } from '../utils/apiResponse.js';

export const getAuditLogs = async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const { action, entity, userId } = req.query;
  const where = {
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
    ...(userId ? { userId: Number(userId) } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return successResponse(res, 200, 'Audit logs fetched', { items, total, page, limit });
};