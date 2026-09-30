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
  // Canonical public origin used for the sitemap, robots.txt and on-page SEO
  // URLs. Must be the real production domain so Google indexes the right host.
  siteUrl: env('SITE_URL', 'https://naholdentalcare.com.bd').replace(/\/+$/, ''),
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
  // Outbound SMS. Provider-agnostic: point SMS_PROVIDER at a bundled driver
  // ("mram" | "mock" | "generic" | "sslwireless") or add one under
  // src/services/sms/providers. MRAM is the default because the gateway is
  // configured from the admin panel (Settings -> SMS Gateway) rather than here.
  // The "generic" driver is fully field-mapped through env vars, so most
  // Bangladeshi aggregators work with no code change.
  //
  // Note: anything set in the admin panel overrides these values at runtime.
  sms: {
    enabled: ['1', 'true', 'yes', 'on'].includes(String(env('SMS_ENABLED', '')).toLowerCase()),
    provider: env('SMS_PROVIDER', 'mram').toLowerCase(),
    apiKey: env('SMS_API_KEY', ''),
    apiSecret: env('SMS_API_SECRET', ''),
    senderId: env('SMS_SENDER_ID', ''),
    endpoint: env('SMS_ENDPOINT', ''),
    // 'text' is GSM-7 English; 'unicode' is required for Bangla bodies.
    type: env('SMS_TYPE', 'text').toLowerCase(),
    timeoutMs: parseInt(env('SMS_TIMEOUT_MS', '10000'), 10),
    generic: {
      method: env('SMS_HTTP_METHOD', 'POST').toUpperCase(),
      // Where the credentials are placed: 'body' | 'query' | 'header' | 'bearer' | 'none'
      authStyle: env('SMS_AUTH_STYLE', 'body').toLowerCase(),
      // 'json' sends a JSON object, 'form' sends application/x-www-form-urlencoded.
      contentType: env('SMS_CONTENT_TYPE', 'json').toLowerCase(),
      numberField: env('SMS_NUMBER_FIELD', 'to'),
      messageField: env('SMS_MESSAGE_FIELD', 'message'),
      apiKeyField: env('SMS_API_KEY_FIELD', 'api_key'),
      apiSecretField: env('SMS_API_SECRET_FIELD', 'api_secret'),
      senderIdField: env('SMS_SENDER_ID_FIELD', 'sender_id'),
      headerName: env('SMS_AUTH_HEADER', 'Authorization'),
    },
    sslwireless: {
      // Both values are shown on the SSL Wireless dashboard and are account
      // specific; the defaults are the values they issue to new accounts.
      serviceType: env('SMS_SSLWIRELESS_SERVICE_TYPE', 'transactional'),
      route: env('SMS_SSLWIRELESS_ROUTE', 'default'),
    },
    // A 2xx from a gateway is not always a success -- many report rejected
    // numbers, bad credentials and empty balances in the body of a 200. The
    // driver scans the response for these markers before reporting success.
    failKeywords: (env('SMS_FAIL_KEYWORDS', '') || 'fail,error,invalid,unauthorized,forbidden,denied,reject,insufficient,no credit,blacklist')
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean),
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