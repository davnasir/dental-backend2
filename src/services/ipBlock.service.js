import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

export const listIpBlocks = async ({ page = 1, limit = 50, q = '' } = {}) => {
  const pageNum = Math.max(Number(page) || 1, 1);
  const limitNum = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const where = q
    ? {
        OR: [
          { ip: { contains: q } },
          { reason: { contains: q } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.ipBlock.findMany({
      where,
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    }),
    prisma.ipBlock.count({ where }),
  ]);
  return { items, total, page: pageNum, limit: limitNum };
};

export const blockIp = async (ip, reason, createdById = null) => {
  const normalized = ip?.trim();
  if (!normalized) throw new ApiError(400, 'IP address is required');
  const existing = await prisma.ipBlock.findUnique({ where: { ip: normalized } });
  if (existing) {
    return prisma.ipBlock.update({
      where: { id: existing.id },
      data: { reason: reason || existing.reason },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
  }
  return prisma.ipBlock.create({
    data: { ip: normalized, reason: reason || null, createdById },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  });
};

export const unblockIp = async (id) => {
  const block = await prisma.ipBlock.findUnique({ where: { id: Number(id) } });
  if (!block) throw new ApiError(404, 'Blocked IP not found');
  await prisma.ipBlock.delete({ where: { id: block.id } });
  return block;
};