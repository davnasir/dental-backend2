import prisma from '../config/prisma.js';
import { successResponse } from '../utils/apiResponse.js';

export const getMyNotifications = async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: req.user.id },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where: { userId: req.user.id } }),
    prisma.notification.count({ where: { userId: req.user.id, state: 'UNREAD' } }),
  ]);

  return successResponse(res, 200, 'Notifications fetched', { items, total, unreadCount, page, limit });
};

export const markAsRead = async (req, res) => {
  const id = Number(req.params.id);
  await prisma.notification.updateMany({
    where: { id, userId: req.user.id },
    data: { state: 'READ' },
  });
  return successResponse(res, 200, 'Notification marked as read');
};

export const markAllRead = async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, state: 'UNREAD' },
    data: { state: 'READ' },
  });
  return successResponse(res, 200, 'All notifications marked as read');
};