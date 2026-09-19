import prisma from '../config/prisma.js';
import { broadcastRealtime } from '../realtime.js';

export const createNotification = async ({
  userId = null,
  type,
  title,
  message,
  link = null,
  meta = null,
  broadcast = false,
}) => {
  try {
    if (broadcast) {
      const admins = await prisma.user.findMany({
        where: {
          role: { in: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'] },
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (admins.length === 0) return null;
      await prisma.notification.createMany({
        data: admins.map((u) => ({
          userId: u.id,
          type,
          title,
          message,
          link,
        })),
      });
      broadcastRealtime({ type, title, message, link, ...(meta ? { meta } : {}) });
      return;
    }
    const notification = await prisma.notification.create({
      data: { userId, type, title, message, link },
    });
    broadcastRealtime({ type, title, message, link, ...(meta ? { meta } : {}), userId });
    return notification;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Notification Error]', err.message);
    return null;
  }
};