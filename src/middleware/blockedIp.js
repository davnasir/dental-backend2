import prisma from '../config/prisma.js';
import { getClientIp } from '../utils/getClientIp.js';

export { getClientIp };

export const isIpBlocked = async (ip) => {
  if (!ip) return false;
  const block = await prisma.ipBlock.findUnique({ where: { ip }, select: { id: true, reason: true } });
  return block ? block : false;
};

export const blockedIpGuard = async (req, res, next) => {
  try {
    const ip = getClientIp(req);
    const rule = await isIpBlocked(ip);
    if (!rule) return next();
    return res.status(403).json({
      success: false,
      message: rule.reason
        ? `Your access has been blocked. Reason: ${rule.reason}`
        : 'Your access has been blocked. Please contact the clinic.',
    });
  } catch (err) {
    return next(err);
  }
};