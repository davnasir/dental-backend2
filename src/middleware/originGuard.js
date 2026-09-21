// import { config } from '../config/index.js';

// // Fallback allowlist used when ALLOWED_ORIGINS is not configured:
// // local dev servers and the clinic's own domain (+ subdomains).
// const DEFAULT_PATTERNS = [
//   /^http:\/\/localhost:\d+$/,
//   /^https?:\/\/([^/:]+\.)?naholdentalcare\.com\.bd$/,
// ];

// // Requests without an Origin header are same-origin / server-to-server calls;
// // they still require a valid JWT for every protected endpoint, so they are not
// // blocked here. Configuring ALLOWED_ORIGINS makes the check strict: only the
// // listed frontend origin(s) can exchange data with this API.
// export const isAllowedOrigin = (origin) => {
//   if (!origin) return true;
//   if (config.allowedOrigins.length > 0) {
//     return config.allowedOrigins.includes(origin);
//   }
//   if (origin === config.clientUrl) return true;
//   return DEFAULT_PATTERNS.some((re) => re.test(origin));
// };

// export const originGuard = (req, res, next) => {
//   if (!isAllowedOrigin(req.headers.origin)) {
//     return res.status(403).json({
//       success: false,
//       message: 'Cross-origin request blocked: this origin is not allowed.',
//     });
//   }
//   return next();
// };

import { config } from '../config/index.js';

// Default allowed origins.
// Used when ALLOWED_ORIGINS is not configured.
const DEFAULT_PATTERNS = [
  // Local development
  /^https?:\/\/localhost:\d+$/,

  // Clinic main domain and subdomains
  /^https?:\/\/([a-zA-Z0-9-]+\.)?naholdentalcare\.com\.bd$/,
];

export const isAllowedOrigin = (origin) => {
  // Requests without Origin header are allowed.
  // These requests are still protected by authentication
  // on protected API endpoints.
  if (!origin) return true;

  // If ALLOWED_ORIGINS is configured, use only those origins.
  if (config.allowedOrigins.length > 0) {
    return config.allowedOrigins.includes(origin);
  }

  // Allow the configured client URL.
  if (origin === config.clientUrl) {
    return true;
  }

  // Allow localhost and naholdentalcare.com.bd subdomains.
  return DEFAULT_PATTERNS.some((pattern) => pattern.test(origin));
};

export const originGuard = (req, res, next) => {
  const origin = req.headers.origin;

  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({
      success: false,
      message: 'Cross-origin request blocked: this origin is not allowed.',
    });
  }

  return next();
};