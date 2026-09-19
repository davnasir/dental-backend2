import { ApiError } from '../utils/apiResponse.js';

export const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const notFoundHandler = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler = (err, req, res, next) => {
  let { statusCode = 500, message = 'Something went wrong' } = err;

  // Malformed JSON body or unsupported content type from express.json/urlencoded.
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON payload.';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large.';
  }

  if (err.name === 'MulterError') {
    statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File size limit exceeded' : err.message;
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = err.name === 'TokenExpiredError' ? 'Session expired. Please login again.' : 'Invalid token. Please login again.';
  }

  if (err.code === 'P2002') {
    statusCode = 409;
    message = 'Duplicate entry. A record with this value already exists.';
  }

  if (err.code === 'P2025') {
    statusCode = 404;
    message = 'Record not found.';
  }

  if (err.code === 'P2003') {
    statusCode = 409;
    message = 'Cannot delete: this record is referenced by other data. Remove related records first.';
  }

  const errors = Array.isArray(err.errors) ? err.errors : [];

  if (![400, 401, 403, 404, 409, 413, 422, 429].includes(statusCode)) {
    // eslint-disable-next-line no-console
    console.error('[Error]', err);
  }

  if (process.env.NODE_ENV === 'production') {
    return res.status(statusCode).json({ success: false, message, errors });
  }

  return res.status(statusCode).json({
    success: false,
    message,
    errors,
    stack: err.stack,
  });
};