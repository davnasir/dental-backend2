/**
 * Database bootstrap, wired to `npm install` via the postinstall hook.
 *
 * Goals, in priority order:
 *   1. A fresh clone comes up with a working, populated database with no extra
 *      steps -- just `npm install && npm run dev`.
 *   2. An existing installation is never modified. Running `npm install` again
 *      (adding a dependency, rebuilding an image) must not touch real data.
 *   3. `npm install` must never fail because a database is not reachable yet.
 *      Container builds copy package.json before the sources and have no
 *      MongoDB at build time, so problems are reported as warnings and the
 *      process exits 0.
 *
 * Opt out with SKIP_DB_SETUP=1, force a re-seed with SEED_FORCE=1.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const log = (...args) => console.log('[db-setup]', ...args);
const warn = (...args) => console.warn('[db-setup]', ...args);

const truthy = (value) => /^(1|true|yes|on)$/i.test(String(value ?? ''));

const COLLECTIONS_TO_SUMMARY = [
  ['users', 'user'],
  ['patients', 'patient'],
  ['doctors', 'doctor'],
  ['appointments', 'appointment'],
  ['prescriptions', 'prescription'],
  ['invoices', 'invoice'],
];

const runSeed = (seedPath) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [seedPath], {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', (err) => {
      warn('could not start the seed script:', err.message);
      resolve(1);
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });

async function main() {
  if (truthy(process.env.SKIP_DB_SETUP)) {
    log('skipped: SKIP_DB_SETUP is set');
    return 0;
  }

  const seedPath = path.join(__dirname, 'seed.js');

  // Container builds run `npm ci` before the sources are copied in, so this
  // script may legitimately not exist yet.
  if (!fs.existsSync(seedPath)) {
    log('skipped: seed script is not present in this install');
    return 0;
  }

  // Give a fresh clone a .env to work from instead of failing on a missing one.
  const envPath = path.join(root, '.env');
  const examplePath = path.join(root, '.env.example');
  if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    log('created .env from .env.example');
  }
  dotenv.config({ path: envPath });

  // The seed refuses to run without an admin password. Generate one rather
  // than failing the install, and print it once so it is not lost.
  if (!process.env.SEED_ADMIN_PASSWORD) {
    process.env.SEED_ADMIN_PASSWORD = crypto.randomBytes(12).toString('base64url');
    warn('SEED_ADMIN_PASSWORD was not set. Generated one for the initial admin:');
    warn(`    ${process.env.SEED_ADMIN_PASSWORD}`);
    warn('  Copy it down now, then change it after your first login.');
  }

  const prismaModule = await import('../src/config/prisma.js');
  const prisma = prismaModule.default;

  let db;
  try {
    // Connecting also creates the collection indexes defined in src/config/prisma.js.
    db = await prismaModule.getDb();
  } catch (err) {
    warn(`could not reach MongoDB: ${err.message}`);
    warn('  Install finished, but the database was not prepared.');
    warn(`  Start MongoDB, then run: npm run db:setup`);
    return 0;
  }

  try {
    const target = db.databaseName || 'dental_clinic';
    log(`connected to "${target}"`);

    // The prescription retention TTL index lives in the feature service, not in
    // the shared bootstrap list, so it has to be requested explicitly. The
    // backfill re-stamps expireAt and issues verification codes for any rows
    // that predate those features -- including rows written by the seed script,
    // which bypasses the service layer.
    const { ensurePrescriptionSetup, backfillRetention } = await import('../src/services/prescription.service.js');
    await ensurePrescriptionSetup();
    await backfillRetention();
    log('indexes ready (including prescription retention)');

    const userCount = await prisma.user.count();

    if (userCount > 0 && !truthy(process.env.SEED_FORCE)) {
      log(`database already has ${userCount} user(s) - existing data left untouched`);
      return 0;
    }

    log(userCount > 0 ? 'SEED_FORCE set - re-running the seed' : 'empty database - importing data');
    const code = await runSeed(seedPath);
    if (code !== 0) {
      warn(`seed script exited with code ${code}`);
      warn(`  Re-run it manually with: npm run prisma:seed`);
      return 0;
    }

    const summary = [];
    for (const [label, model] of COLLECTIONS_TO_SUMMARY) {
      summary.push(`${label}=${await prisma[model].count()}`);
    }
    // Seeded rows are written straight to the collection, so they only pick up
    // an expiry and a verification code once the backfill has run.
    const backfill = await backfillRetention({ force: true });
    if (backfill) log(`backfill: re-stamped ${backfill.restamped}, issued ${backfill.coded} verification code(s)`);
    log('import complete:', summary.join(' '));
    return 0;
  } catch (err) {
    warn(`database setup failed: ${err.message}`);
    warn(`  Re-run it manually with: npm run db:setup`);
    return 0;
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      /* already closed */
    }
  }
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    // Never break `npm install`.
    warn('unexpected error:', err?.message || err);
    process.exit(0);
  });
