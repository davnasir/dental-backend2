import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { notFoundHandler, errorHandler, catchAsync } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { originGuard, isAllowedOrigin } from './middleware/originGuard.js';

import authRoutes from './routes/auth.routes.js';
import patientRoutes from './routes/patient.routes.js';
import appointmentRoutes from './routes/appointment.routes.js';
import doctorRoutes from './routes/doctor.routes.js';
import serviceRoutes from './routes/service.routes.js';
import treatmentRoutes from './routes/treatment.routes.js';
import dentalRecordRoutes from './routes/dentalRecord.routes.js';
import prescriptionRoutes from './routes/prescription.routes.js';
import invoiceRoutes from './routes/invoice.routes.js';
import chamberRoutes from './routes/chamber.routes.js';
import reelRoutes from './routes/reel.routes.js';
import categoryRoutes from './routes/category.routes.js';
import contentRoutes from './routes/content.routes.js';
import userRoutes from './routes/user.routes.js';
import auditLogRoutes from './routes/auditLog.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import ipBlockRoutes from './routes/ipBlock.routes.js';
import smsRoutes from './routes/sms.routes.js';
import prisma from './config/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.set('trust proxy', 1);

app.disable('x-powered-by');

// Reject traffic from origins that are not our frontend before anything else.
// The WebSocket server enforces the same check for /realtime connections.
app.use(originGuard);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin(origin, cb) {
      // Only the frontend(s) in the allowlist may read cross-origin responses.
      // Same-origin requests (no Origin header) are always permitted.
      if (!origin) return cb(null, true);
      if (!isAllowedOrigin(origin)) return cb(null, false);
      return cb(null, true);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(config.isProd ? 'combined' : 'dev'));

// Never cache API responses that may contain sensitive patient/billing data.
app.use('/api/v1', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  return next();
});


const uploadsPath = path.resolve(__dirname, '../', config.uploads.dir);
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
app.use('/uploads', express.static(uploadsPath, { maxAge: '7d', immutable: true }));

app.use('/api/v1', apiLimiter);

app.get('/api/v1/health', (req, res) => {
  return res.status(200).json({ success: true, message: 'API is running' });
});

// --- Search-engine plumbing -------------------------------------------------
// /sitemap.xml and /robots.txt are served by the API so every published blog
// post is listed automatically the moment it is created -- no manual uploads.
// Point SITE_URL at the production origin; crawlers send no Origin header, so
// the origin guard lets them through and these routes stay public.

const xmlEscape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

app.get('/sitemap.xml', catchAsync(async (req, res) => {
  const blogs = await prisma.blog.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    select: { slug: true, publishedAt: true, updatedAt: true },
  });

  const urlset = [
    { loc: `${config.siteUrl}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${config.siteUrl}/blog`, changefreq: 'weekly', priority: '0.9' },
    ...blogs.map((post) => ({
      loc: `${config.siteUrl}/blog/${xmlEscape(post.slug)}`,
      lastmod: (post.publishedAt || post.updatedAt || new Date()).toISOString().slice(0, 10),
      changefreq: 'monthly',
      priority: '0.8',
    })),
  ].map((u) => `<url>${Object.entries(u).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</url>`);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlset.join('\n')}\n</urlset>`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(xml);
}));

app.get('/robots.txt', (req, res) => {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /admin/login',
    'Disallow: /api/',
    'Disallow: /verify-prescription',
    '',
    `Sitemap: ${config.siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(body);
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/patients', patientRoutes);
app.use('/api/v1/appointments/public', appointmentRoutes.publicRouter);
app.use('/api/v1/appointments', appointmentRoutes.adminRouter);
app.use('/api/v1/doctors/public', doctorRoutes.publicRouter);
app.use('/api/v1/doctors', doctorRoutes.adminRouter);
app.use('/api/v1/services/public', serviceRoutes.publicRouter);
app.use('/api/v1/services', serviceRoutes.adminRouter);
app.use('/api/v1/treatments', treatmentRoutes);
app.use('/api/v1/dental-chart', dentalRecordRoutes);
app.use('/api/v1/prescriptions', prescriptionRoutes);
app.use('/api/v1/billing', invoiceRoutes);
app.use('/api/v1/chambers/public', chamberRoutes.publicRouter);
app.use('/api/v1/chambers', chamberRoutes.adminRouter);
app.use('/api/v1/reels/public', reelRoutes.publicRouter);
app.use('/api/v1/reels', reelRoutes.adminRouter);
app.use('/api/v1/categories/public', categoryRoutes.publicRouter);
app.use('/api/v1/categories', categoryRoutes.adminRouter);
app.use('/api/v1', contentRoutes.publicRouter);
app.use('/api/v1/admin', contentRoutes.adminRouter);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/audit-logs', auditLogRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/ip-blocks', ipBlockRoutes);
app.use('/api/v1/sms', smsRoutes);

// Express 4 does not forward rejections from async route handlers to the error
// middleware automatically. Wrap every route handler so a thrown/rejected error
// is returned as a JSON error instead of crashing the whole API process.
const wrapAsyncHandlers = (layer) => {
  if (layer.route) {
    layer.route.stack.forEach((handler) => {
      if (handler.handle.length <= 2) handler.handle = catchAsync(handler.handle);
    });
  } else if (layer.name === 'router' && layer.handle.stack) {
    layer.handle.stack.forEach(wrapAsyncHandlers);
  }
};
app._router.stack.forEach(wrapAsyncHandlers);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;