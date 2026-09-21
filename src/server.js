import app from './app.js';
import { config } from './config/index.js';
import { initRealtime } from './realtime.js';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from './config/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

if (config.isProd) {
  // Seed the database with demo data only when the instance is brand-new
  // (no admin user yet) so existing production records are never overwritten.
  if (process.env.SEED_ADMIN_PASSWORD) {
    try {
      const userCount = await prisma.user.count();
      if (userCount === 0) {
        console.log('[Startup] Empty database detected – seeding demo data…');
        execSync('node prisma/seed.js', { cwd: projectRoot, stdio: 'inherit' });
        console.log('[Startup] Seed complete.');
      }
    } catch (err) {
      console.error('[Startup] Auto-seed skipped:', err.message);
    }
  }
}


const server = app.listen(config.port, () => {
  console.log(`[Server] Dental Clinic API running on http://localhost:${config.port} (${config.nodeEnv})`);
});

initRealtime(server);

process.on('unhandledRejection', (err) => {
  console.error('[Unhandled Rejection]', err);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
  server.close(() => process.exit(1));
});
