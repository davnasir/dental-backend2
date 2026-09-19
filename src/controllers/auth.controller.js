import {
  loginWithCredentials,
  refreshSession,
  revokeSession,
  createPasswordResetToken,
  resetPasswordWithToken,
  changeUserPassword,
  serializeUser,
} from '../services/auth.service.js';
import { successResponse } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';
import { config } from '../config/index.js';
import prisma from '../config/prisma.js';

const cookieOptions = (maxAge) => ({
  httpOnly: true,
  sameSite: config.cookieSameSite,
  secure: config.isProd,
  path: '/',
  maxAge,
});

const ACCESS_COOKIE_MS = 15 * 60 * 1000;
const REFRESH_COOKIE_MS = 7 * 24 * 60 * 60 * 1000;

const setAuthCookies = (res, { accessToken, refreshToken }) => {
  res.cookie('access_token', accessToken, cookieOptions(ACCESS_COOKIE_MS));
  res.cookie('refresh_token', refreshToken, {
    ...cookieOptions(REFRESH_COOKIE_MS),
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie('access_token', { ...cookieOptions(1), maxAge: undefined });
  res.clearCookie('refresh_token', { ...cookieOptions(1), maxAge: undefined });
};

export const login = async (req, res) => {
  const ip = getClientIp(req);
  const { user, accessToken, refreshToken } = await loginWithCredentials({
    ...req.body,
    ip,
  });

  setAuthCookies(res, { accessToken, refreshToken });
  await logAudit({ userId: user.id, action: 'LOGIN', entity: 'Auth', entityId: user.id, ip });

  return successResponse(res, 200, 'Login successful', { user, accessToken });
};

export const logout = async (req, res) => {
  const refreshToken = req.cookies?.refresh_token
    ? req.cookies.refresh_token
    : req.body?.refreshToken;
  const ip = getClientIp(req);
  await revokeSession(refreshToken, req.user?.id || null);
  clearAuthCookies(res);
  return successResponse(res, 200, 'Logged out successfully');
};

export const refresh = async (req, res) => {
  const refreshToken = req.cookies?.refresh_token
    ? req.cookies.refresh_token
    : req.body?.refreshToken;
  const ip = getClientIp(req);
  const { user, accessToken, refreshToken: newRefresh } = await refreshSession(refreshToken, ip);
  setAuthCookies(res, { accessToken, refreshToken: newRefresh });
  return successResponse(res, 200, 'Session refreshed', { user, accessToken });
};

export const getMe = async (req, res) => {
  return successResponse(res, 200, 'Current user fetched', { user: req.user });
};

export const forgotPassword = async (req, res) => {
  const { logAudit: audit } = await import('../services/auditLog.service.js');
  await createPasswordResetToken(req.body.email);
  await audit({ userId: null, action: 'FORGOT_PASSWORD', entity: 'Auth' });
  return successResponse(
    res,
    200,
    'If an account exists with this email, a password reset link has been sent.'
  );
};

export const resetPassword = async (req, res) => {
  await resetPasswordWithToken(req.body.token, req.body.password);
  return successResponse(res, 200, 'Password has been reset successfully. You can now login.');
};

export const changePassword = async (req, res) => {
  await changeUserPassword(req.user.id, req.body.currentPassword, req.body.newPassword);
  const ip = getClientIp(req);
  await logAudit({ userId: req.user.id, action: 'CHANGE_PASSWORD', entity: 'Auth', entityId: req.user.id, ip });
  return successResponse(res, 200, 'Password changed successfully. Please login again.');
};

export const registerStaff = async (req, res) => {
  const { registerUser } = await import('../services/user.service.js');
  const user = await registerUser(req.body, req.user.id);
  await logAudit({ userId: req.user.id, action: 'USER_CREATED', entity: 'User', entityId: user.id, ip: getClientIp(req) });
  return successResponse(res, 201, 'User created successfully', { user: serializeUser(user) });
};