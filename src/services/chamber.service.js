import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

export const toChamberId = (id) => {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, 'Invalid chamber id');
  return n;
};

export const publicChamberSelect = {
  id: true,
  name: true,
  address: true,
  phone: true,
  workingHours: true,
  status: true,
  sortOrder: true,
};

export const listChambers = async ({ status, search } = {}) => {
  const where = {
    ...(status ? { status } : {}),
    ...(search ? { name: { contains: search } } : {}),
  };
  return prisma.chamber.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: publicChamberSelect,
  });
};

export const listAdminChambers = async ({ page = 1, limit = 50, search } = {}) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = search ? { name: { contains: search } } : {};
  const [items, total] = await Promise.all([
    prisma.chamber.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { appointments: true } } },
    }),
    prisma.chamber.count({ where }),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
};

export const getChamber = async (id) => {
  const chamber = await prisma.chamber.findUnique({
    where: { id: toChamberId(id) },
    include: { _count: { select: { appointments: true } } },
  });
  if (!chamber) throw new ApiError(404, 'Chamber not found');
  return chamber;
};

export const createChamber = async (data) => {
  return prisma.chamber.create({ data });
};

export const updateChamber = async (id, data) => {
  await getChamber(id);
  return prisma.chamber.update({ where: { id: toChamberId(id) }, data });
};

export const deleteChamber = async (id) => {
  const chamberId = toChamberId(id);
  await getChamber(chamberId);
  const count = await prisma.appointment.count({ where: { chamberId } });
  if (count > 0) {
    await prisma.chamber.update({ where: { id: chamberId }, data: { status: 'INACTIVE' } });
    return { deactivated: true };
  }
  await prisma.chamber.delete({ where: { id: chamberId } });
  return { deleted: true };
};