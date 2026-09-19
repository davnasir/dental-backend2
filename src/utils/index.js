import { ApiError } from './apiResponse.js';

export const wrapAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const validate = (schema, source = 'body') => (req, res, next) => {
  const parsed = schema.safeParse(req[source]);
  if (!parsed.success) {
    const errors = parsed.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return next(new ApiError(422, 'Validation failed', errors));
  }
  req[source] = parsed.data;
  return next();
};

export const paginate = ({ page = 1, limit = 20 }) => {
  const p = Math.max(parseInt(page, 10) || 1, 1);
  const l = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  return { skip: (p - 1) * l, take: l, page: p, limit: l };
};