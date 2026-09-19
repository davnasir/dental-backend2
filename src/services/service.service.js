import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

const toPublicService = (s) => ({
  id: s.slug,
  slug: s.slug,
  name: s.name,
  category: s.category,
  categoryKey: s.categoryKey,
  shortDesc: s.shortDesc,
  description: s.description,
  priceMin: s.priceMin,
  priceMax: s.priceMax,
  priceFormatted: s.priceFormatted,
  duration: s.duration,
  image: s.image,
  badge: s.badge,
  benefits: s.benefits,
  procedure: s.procedure,
  recovery: s.recovery,
});

const toAdminService = (s) => ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  category: s.category,
  categoryKey: s.categoryKey,
  description: s.description,
  shortDesc: s.shortDesc,
  image: s.image,
  duration: s.duration,
  priceMin: s.priceMin,
  priceMax: s.priceMax,
  priceFormatted: s.priceFormatted,
  benefits: s.benefits,
  procedure: s.procedure,
  recovery: s.recovery,
  badge: s.badge,
  status: s.status,
  sortOrder: s.sortOrder,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

export const listPublicServices = async ({ category, search, lang }) => {
  const where = {
    status: 'ACTIVE',
    ...(category && category !== 'all'
      ? { OR: [{ category }, { categoryKey: category }] }
      : {}),
    ...(search
      ? {
          OR: [
            { name: { path: [lang || 'en'], string_contains: search } },
            { shortDesc: { path: [lang || 'en'], string_contains: search } },
          ],
        }
      : {}),
  };

  const services = await prisma.service.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });

  return services.map(toPublicService);
};

export const listAdminServices = async ({ page = 1, limit: rawLimit = 100, category, status, search }) => {
  const limit = Number(rawLimit);
  const skip = (Number(page) - 1) * limit;
  const where = {
    ...(status ? { status } : { status: { not: 'INACTIVE' } }),
    ...(category && category !== 'all' ? { category } : {}),
    ...(search
      ? {
          OR: [
            { slug: { contains: search } },
            { category: { contains: search } },
            { name: { path: ['en'], string_contains: search } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.service.findMany({ where, skip, take: Number(limit), orderBy: { sortOrder: 'asc' } }),
    prisma.service.count({ where }),
  ]);
  return { items: items.map(toAdminService), total, page: Number(page), limit: Number(limit) };
};

export const createService = async (data) => {
  const slug = data.slug || slugify(data.name.en || data.name.bn || 'service');
  const existing = await prisma.service.findUnique({ where: { slug } });
  if (existing) throw new ApiError(409, 'A service with this slug already exists');

  const categoryExists = await prisma.service.count({ where: { category: data.category } });
  const sortOrder = data.sortOrder ?? categoryExists;

  return prisma.service.create({
    data: {
      ...data,
      slug,
      sortOrder,
    },
  });
};

export const updateService = async (id, data) => {
  const service = await prisma.service.findUnique({ where: { id: Number(id) } });
  if (!service) throw new ApiError(404, 'Service not found');
  return prisma.service.update({ where: { id: Number(id) }, data });
};

export const deleteService = async (id) => {
  const service = await prisma.service.findUnique({ where: { id: Number(id) } });
  if (!service) throw new ApiError(404, 'Service not found');
  const activeCount = await prisma.appointment.count({
    where: { serviceId: service.id, status: { notIn: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] } },
  });
  if (activeCount > 0) {
    await prisma.service.update({ where: { id: service.id }, data: { status: 'INACTIVE' } });
    return { softDeleted: true };
  }
  await prisma.service.delete({ where: { id: service.id } });
  return { softDeleted: false };
};

export const reorderServices = async (orderedIds) => {
  const tx = [];
  orderedIds.forEach((id, index) => {
    tx.push(
      prisma.service.update({ where: { id: Number(id) }, data: { sortOrder: index } })
    );
  });
  await prisma.$transaction(tx);
};

const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);