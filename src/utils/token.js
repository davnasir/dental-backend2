import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export const signAccessToken = (payload) =>
  jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpires,
  });

export const signRefreshToken = (payload) =>
  jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpires,
  });

export const verifyAccessToken = (token) =>
  jwt.verify(token, config.jwt.accessSecret);

export const verifyRefreshToken = (token) =>
  jwt.verify(token, config.jwt.refreshSecret);

export const decodeRefreshExpiry = (token) => {
  const decoded = jwt.decode(token);
  return decoded ? new Date(decoded.exp * 1000) : null;
};