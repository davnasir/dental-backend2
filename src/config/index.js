import dotenv from 'dotenv';
dotenv.config();

const env = (key, fallback = '') => process.env[key] ?? fallback;

export const config = {
  nodeEnv: env('NODE_ENV', 'development'),
  port: parseInt(env('PORT', '5000'), 10),
  databaseUrl: env(
    'DATABASE_URL',
    env('MONGODB_URI', 'mongodb://127.0.0.1:27017/dental_clinic')
  ),
  jwt: {
    accessSecret: env('JWT_ACCESS_SECRET', 'dev_access_secret'),
    refreshSecret: env('JWT_REFRESH_SECRET', 'dev_refresh_secret'),
    accessExpires: env('JWT_ACCESS_EXPIRES', '15m'),
    refreshExpires: env('JWT_REFRESH_EXPIRES', '7d'),
  },
  clientUrl: env('CLIENT_URL', 'http://localhost:5173'),
  // Comma-separated list of frontend origins that may exchange data with this
  // API. When set, requests carrying an `Origin` header that is NOT in this list
  // are rejected (403). This guarantees data is only served to the frontend.
  allowedOrigins: (env('ALLOWED_ORIGINS', '') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  smtp: {
    host: env('SMTP_HOST', ''),
    port: parseInt(env('SMTP_PORT', '587'), 10),
    user: env('SMTP_USER', ''),
    password: env('SMTP_PASSWORD', ''),
    from: env('SMTP_FROM', 'Nahol Dental Care <noreply@example.com>'),
  },
  whatsapp: {
    number: env('WHATSAPP_NUMBER', ''),
  },
  uploads: {
    dir: env('UPLOAD_DIR', 'uploads'),
    maxFileSize: parseInt(env('MAX_FILE_SIZE', '5242880'), 10),
  },
  // Cross-site deployments (frontend and API on different domains) require
  // SameSite=None + Secure so the auth cookies are sent over HTTPS. Same-site
  // deployments can override this back to "lax".
  cookieSameSite: env(
    'COOKIE_SAME_SITE',
    env('NODE_ENV', 'development') === 'production' ? 'none' : 'lax'
  ),
  isProd: env('NODE_ENV', 'development') === 'production',
};