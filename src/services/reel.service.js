import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

export const toReelId = (id) => {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, 'Invalid reel id');
  return n;
};

export const listPublicReels = async () => {
  return prisma.reel.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
};

export const listAdminReels = async ({ page = 1, limit = 50, search } = {}) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = search ? { title: { path: ['en'], string_contains: search } } : {};
  const [items, total] = await Promise.all([
    prisma.reel.findMany({ where, skip, take: Number(limit), orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    prisma.reel.count({ where }),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
};

export const createReel = async (data) => prisma.reel.create({ data });
export const updateReel = async (id, data) => prisma.reel.update({ where: { id: toReelId(id) }, data });
export const deleteReel = async (id) => {
  const reel = await prisma.reel.findUnique({ where: { id: toReelId(id) } });
  if (!reel) throw new ApiError(404, 'Reel not found');
  await prisma.reel.delete({ where: { id: reel.id } });
  return { deleted: true };
};