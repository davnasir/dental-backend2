import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

export const registerUser = async ({ name, email, phone, password, role = 'STAFF' }, actingUserId) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, 'A user with this email already exists');

  const hashedPassword = await bcrypt.hash(password, 12);
  return prisma.user.create({
    data: { name, email, phone, password: hashedPassword, role },
  });
};

export const updateUser = async (id, data, actingUserId) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new ApiError(404, 'User not found');

  const patch = {};
  if (data.name) patch.name = data.name;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.status) patch.status = data.status;
  if (data.role) patch.role = data.role;
  if (data.password) patch.password = await bcrypt.hash(data.password, 12);

  return prisma.user.update({ where: { id }, data: patch });
};

export const listUsers = async ({ page = 1, limit = 20, search = '', role }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {
    AND: [
      search
        ? {
            OR: [
              { name: { contains: search } },
              { email: { contains: search } },
              { phone: { contains: search } },
            ],
          }
        : {},
      role ? { role } : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        lastLogin: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
};