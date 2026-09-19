import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

export const toCategoryId = (id) => {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, 'Invalid category id');
  return n;
};

export const listPublicCategories = async () => prisma.category.findMany({
  where: { status: 'ACTIVE' },
  orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
});

export const listAdminCategories = async ({ page = 1, limit = 50, search } = {}) => {
  const take = Number(limit);
  const skip = (Number(page) - 1) * take;
  const where = search
    ? { name: { contains: search } }
    : {};
  const [items, total] = await Promise.all([
    prisma.category.findMany({
      where, skip, take,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { services: { select: { id: true } } },
    }),
    prisma.category.count({ where }),
  ]);
  return {
    items: items.map(({ services = [], ...row }) => ({ ...row, _count: { services: services.length } })),
    total,
    page: Number(page),
    limit: take,
  };
};

export const createCategory = async (data) => prisma.category.create({ data });

export const updateCategory = async (id, data) => {
  const categoryId = toCategoryId(id);
  const existing = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!existing) throw new ApiError(404, 'Category not found');
  return prisma.category.update({ where: { id: categoryId }, data });
};

export const deleteCategory = async (id) => {
  const categoryId = toCategoryId(id);
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new ApiError(404, 'Category not found');
  const serviceCount = await prisma.service.count({ where: { categoryKey: category.key } });
  if (serviceCount > 0) {
    await prisma.category.update({ where: { id: category.id }, data: { status: 'INACTIVE' } });
    return { deactivated: true };
  }
  await prisma.category.delete({ where: { id: category.id } });
  return { deleted: true };
};
