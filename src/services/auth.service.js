import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, decodeRefreshExpiry } from '../utils/token.js';
import { config } from '../config/index.js';
import { sendMail } from './email.service.js';
import { sendWhatsAppText } from './whatsapp.service.js';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MIN = 15;

export const loginWithCredentials = async ({ email, password, ip }) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (user.status !== 'ACTIVE') {
    throw new ApiError(403, 'Your account is not active. Contact the administrator.');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(
      429,
      'Account is temporarily locked due to too many failed attempts. Please try again later.'
    );
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    let attempts = user.loginAttempts + 1;
    let lockedUntil = null;
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      lockedUntil = new Date(Date.now() + LOCK_DURATION_MIN * 60 * 1000);
      attempts = 0;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: attempts, lockedUntil },
    });
    throw new ApiError(
      401,
      `Invalid email or password${lockedUntil ? `. Account locked for ${LOCK_DURATION_MIN} minutes.` : ''}`
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { loginAttempts: 0, lockedUntil: null, lastLogin: new Date() },
  });

  const accessToken = signAccessToken({ id: user.id, role: user.role });
  const refreshToken = signRefreshToken({ id: user.id, role: user.role });

  const expiresAt = decodeRefreshExpiry(refreshToken);
  await prisma.accessToken.create({
    data: {
      userId: user.id,
      token: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      expiresAt,
    },
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      lastLogin: user.lastLogin,
    },
    accessToken,
    refreshToken,
  };
};

export const issueTokenPair = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(401, 'User not found');
  if (user.status !== 'ACTIVE') throw new ApiError(403, 'Account is not active');

  const accessToken = signAccessToken({ id: user.id, role: user.role });
  const refreshToken = signRefreshToken({ id: user.id, role: user.role });
  const expiresAt = decodeRefreshExpiry(refreshToken);
  await prisma.accessToken.create({
    data: {
      userId: user.id,
      token: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      expiresAt,
    },
  });

  return { accessToken, refreshToken, user };
};

export const refreshSession = async (refreshToken, ip) => {
  if (!refreshToken) throw new ApiError(401, 'No refresh token provided');

  const payload = verifyRefreshToken(refreshToken);
  const hashed = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const stored = await prisma.accessToken.findUnique({ where: { token: hashed } });

  if (!stored || stored.expiresAt < new Date()) {
    throw new ApiError(401, 'Refresh token is invalid or expired. Please login again.');
  }

  await prisma.accessToken.delete({ where: { id: stored.id } });

  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user || user.status !== 'ACTIVE') throw new ApiError(401, 'Account not found or inactive.');

  const { accessToken, refreshToken: newRefresh } = await issueTokenPair(user.id);
  await logAuthAudit('REFRESH', user.id, ip);
  return { user: serializeUser(user), accessToken, refreshToken: newRefresh };
};

export const revokeSession = async (refreshToken, userId) => {
  if (refreshToken) {
    const hashed = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await prisma.accessToken.deleteMany({ where: { token: hashed } });
  }
  if (userId) {
    // Remove expired-session context; keep other sessions intact for multi-device
    await logAuthAudit('LOGOUT', userId, null);
  }
};

export const createPasswordResetToken = async (email) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ApiError(404, 'No account found with this email.');

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      token: crypto.createHash('sha256').update(token).digest('hex'),
      expiresAt,
    },
  });

  const resetUrl = `${config.clientUrl}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Password Reset Request - Nahol Dental Care',
    html: `
      <p>Hello ${user.name},</p>
      <p>You recently requested to reset your password. Click the button below to proceed:</p>
      <p><a href="${resetUrl}" style="display:inline-block;background:#0d9488;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Reset Password</a></p>
      <p>This link is valid for 1 hour. If you did not request this, you can safely ignore this email.</p>
    `,
  });
  return user;
};

export const resetPasswordWithToken = async (token, newPassword) => {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const reset = await prisma.passwordReset.findUnique({ where: { token: hashedToken } });

  if (!reset || reset.used || reset.expiresAt < new Date()) {
    throw new ApiError(400, 'Password reset token is invalid or expired.');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.passwordReset.update({ where: { id: reset.id }, data: { used: true } }),
    prisma.user.update({ where: { id: reset.userId }, data: { password: hashedPassword } }),
    prisma.accessToken.deleteMany({ where: { userId: reset.userId } }),
  ]);
};

export const changeUserPassword = async (userId, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) throw new ApiError(400, 'Current password is incorrect.');

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { password: hashedPassword } });
  await prisma.accessToken.deleteMany({ where: { userId } });
};

const logAuthAudit = async (action, userId, ip) => {
  const { logAudit } = await import('./auditLog.service.js');
  await logAudit({ userId, action, entity: 'User', entityId: userId, ip });
};

export const serializeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  status: user.status,
  lastLogin: user.lastLogin,
  createdAt: user.createdAt,
});