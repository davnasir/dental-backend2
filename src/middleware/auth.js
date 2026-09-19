import { ApiError } from '../utils/apiResponse.js';
import { verifyAccessToken } from '../utils/token.js';
import { wrapAsync } from '../utils/index.js';
import prisma from '../config/prisma.js';

export const protect = wrapAsync(async (req, res, next) => {
  let token = null;

  if (req.cookies?.access_token) {
    token = req.cookies.access_token;
  } else {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) token = authHeader.slice(7);
  }

  if (!token) {
    throw new ApiError(401, 'Not authorized. Please login.');
  }

  const decoded = verifyAccessToken(token);
  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  if (!user) throw new ApiError(401, 'User no longer exists.');
  if (user.status !== 'ACTIVE') throw new ApiError(403, 'Your account is not active.');

  req.user = user;
  return next();
});

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(new ApiError(401, 'Not authorized. Please login.'));
  if (!roles.includes(req.user.role)) {
    return next(new ApiError(403, 'You do not have permission to perform this action.'));
  }
  return next();
};

export const can = (...roles) => {
  const allowed = new Set(roles);
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Not authorized. Please login.'));
    if (!allowed.has(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action.'));
    }
    return next();
  };
};