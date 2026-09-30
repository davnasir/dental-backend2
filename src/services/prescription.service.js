import crypto from 'node:crypto';
import prisma, { getDb, COLLECTIONS } from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const positiveInt = (raw) => {
  const n = parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// How long a prescription is kept before it is removed. The window is measured
// in MONTHS (default 6). `PRESCRIPTION_RETENTION_DAYS` still works as an
// explicit day-based override for deployments that need it.
//
// Each document carries its own `expireAt`, so every entry is deleted on its own
// schedule and one expiring never touches the others.
const monthsOverride = positiveInt(process.env.PRESCRIPTION_RETENTION_MONTHS);
const daysOverride = positiveInt(process.env.PRESCRIPTION_RETENTION_DAYS);

export const RETENTION_MONTHS = monthsOverride ?? 6;
export const RETENTION_DAYS = daysOverride;
export const RETENTION_LABEL = daysOverride
  ? `${daysOverride} day${daysOverride === 1 ? '' : 's'}`
  : `${RETENTION_MONTHS} month${RETENTION_MONTHS === 1 ? '' : 's'}`;

// Calendar-month arithmetic, so "6 months" means the same day six months later
// rather than a fixed number of milliseconds. End-of-month dates are clamped
// (31 Jan + 6 months -> 30 Jun) rather than overflowing into July.
export const computeExpireAt = (from = new Date()) => {
  const base = new Date(from);
  if (daysOverride) return new Date(base.getTime() + daysOverride * DAY_MS);
  const dayOfMonth = base.getDate();
  base.setMonth(base.getMonth() + RETENTION_MONTHS);
  if (base.getDate() < dayOfMonth) base.setDate(0);
  return base;
};

const toEntryList = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const list = (Array.isArray(value) ? value : [value])
    .map((v) => String(v).trim())
    .filter(Boolean);
  return list.length ? list : null;
};

// Folds the legacy single-medicine payload into the dynamic items[] array and
// guarantees every row stores dosage/frequency/duration as a list.
export const normalizeItems = (data = {}) => {
  const source = Array.isArray(data.items) && data.items.length
    ? data.items
    : data.medicine
      ? [{ medicine: data.medicine, dosage: data.dosage, frequency: data.frequency, duration: data.duration, notes: data.instructions }]
      : [];

  return source
    .filter((item) => item && String(item.medicine ?? '').trim())
    .map((item, index) => ({
      medicine: String(item.medicine).trim(),
      dosage: toEntryList(item.dosage),
      frequency: toEntryList(item.frequency),
      duration: toEntryList(item.duration),
      notes: item.notes ? String(item.notes).trim() : null,
      order: index,
    }));
};

// Mirrors the first row onto the legacy scalar fields so older consumers
// (patient timeline, reports) keep working.
const legacySummary = (items) => ({
  medicine: items.length ? items.map((i) => i.medicine).join(', ') : null,
  dosage: items[0]?.dosage ?? null,
  frequency: items[0]?.frequency ?? null,
  duration: items[0]?.duration ?? null,
});

let ttlIndexPromise = null;

// Public verification code printed as a QR code on the pad. Ambiguous glyphs
// (I/O/0/1) are excluded so a code read off a printed page cannot be mistyped.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomCode = (length = 10) => {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
};

const generateVerificationCode = async () => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomCode();
    const clash = await prisma.prescription.findFirst({ where: { verificationCode: code }, select: { id: true } });
    if (!clash) return code;
  }
  return `${randomCode()}${Date.now().toString(36).toUpperCase().slice(-4)}`;
};

let setupPromise = null;

// A native MongoDB TTL index is the primary retention mechanism: the database
// reclaims expired documents on its own, with no cron and no dependency on this
// process staying alive. A sparse unique index on the verification code backs
// the QR lookup.
export const ensurePrescriptionSetup = () => {
  if (!setupPromise) {
    setupPromise = (async () => {
      const db = await getDb();
      const col = db.collection(COLLECTIONS.prescription);
      await col.createIndex('expireAt', { expireAfterSeconds: 0, name: 'prescription_expire_at_ttl' });
      await col.createIndex('verificationCode', { unique: true, sparse: true, name: 'prescription_verification_code' });
      return true;
    })().catch((err) => {
      console.error('[Prescription] Could not create indexes:', err.message);
      setupPromise = null;
      return null;
    });
  }
  return setupPromise;
};

export const ensureRetentionIndex = ensurePrescriptionSetup;

let backfilled = false;

// Re-stamps expireAt from createdAt so a change to the retention window also
// applies to prescriptions that were already created, and issues a
// verification code for any older record that predates the QR feature.
// Idempotent: it only writes rows whose stored value disagrees.
export const backfillRetention = async ({ force = false } = {}) => {
  if (backfilled && !force) return null;
  backfilled = true;
  try {
    // Only rows still inside a plausible window need revisiting.
    const horizon = new Date(Date.now() - (RETENTION_MONTHS + 1) * 31 * DAY_MS);
    const rows = await prisma.prescription.findMany({ where: { createdAt: { gte: horizon } } });
    let restamped = 0;
    let coded = 0;
    for (const row of rows) {
      const patch = {};
      const desired = computeExpireAt(row.createdAt || row.updatedAt);
      const current = row.expireAt ? new Date(row.expireAt).getTime() : 0;
      if (current !== desired.getTime()) {
        patch.expireAt = desired;
        restamped += 1;
      }
      if (!row.verificationCode) {
        patch.verificationCode = await generateVerificationCode();
        coded += 1;
      }
      if (Object.keys(patch).length) {
        await prisma.prescription.update({ where: { id: row.id }, data: patch });
      }
    }
    if (restamped > 0) {
      console.log(`[Prescription] Retention window is ${RETENTION_LABEL}; re-stamped ${restamped} existing prescription(s)`);
    }
    if (coded > 0) {
      console.log(`[Prescription] Issued verification codes for ${coded} existing prescription(s)`);
    }
    return { restamped, coded };
  } catch (err) {
    console.error('[Prescription] Retention backfill failed:', err.message);
    return null;
  }
};

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
let lastSweep = 0;
let sweeping = false;

// Belt-and-braces sweep in case TTL is disabled on the deployment. Runs at most
// once an hour and never blocks a request.
export const runRetentionSweep = async ({ force = false } = {}) => {
  if (sweeping) return null;
  const now = Date.now();
  if (!force && now - lastSweep < SWEEP_INTERVAL_MS) return null;
  sweeping = true;
  lastSweep = now;
  try {
    const { count } = await prisma.prescription.deleteMany({ where: { expireAt: { lte: new Date() } } });
    if (count > 0) console.log(`[Prescription] Retention sweep removed ${count} expired prescription(s)`);
    return count;
  } catch (err) {
    console.error('[Prescription] Retention sweep failed:', err.message);
    return null;
  } finally {
    sweeping = false;
  }
};

// Expired documents are hidden from reads immediately, even in the window
// before the TTL monitor has actually reclaimed them.
const notExpired = (now) => ({
  OR: [{ expireAt: null }, { expireAt: { gt: now } }],
});

const daysRemaining = (expireAt) => {
  if (!expireAt) return null;
  return Math.max(0, Math.ceil((new Date(expireAt).getTime() - Date.now()) / DAY_MS));
};

const decorate = (doc) => {
  if (!doc) return doc;
  const items = Array.isArray(doc.items) ? doc.items : normalizeItems(doc);
  return {
    ...doc,
    items,
    medicineCount: items.length,
    daysRemaining: daysRemaining(doc.expireAt),
  };
};

const include = {
  patient: { select: { id: true, patientId: true, firstName: true, lastName: true, gender: true, age: true } },
  doctor: { select: { id: true, name: true, specialization: true } },
  chamber: { select: { id: true, name: true, address: true, phone: true } },
};

export const getAllPrescriptions = async ({ page = 1, limit = 20, patientId, doctorId, includeExpired = 'false' } = {}) => {
  await ensurePrescriptionSetup();
  backfillRetention();
  runRetentionSweep();
  backfillDefaultChamber();

  const skip = (Number(page) - 1) * Number(limit);
  const now = new Date();
  const showExpired = String(includeExpired) === 'true';

  const where = {
    ...(patientId ? { patientId: Number(patientId) } : {}),
    ...(doctorId ? { doctorId: Number(doctorId) } : {}),
    ...(showExpired ? {} : notExpired(now)),
  };

  const [items, total] = await Promise.all([
    prisma.prescription.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      include,
    }),
    prisma.prescription.count({ where }),
  ]);

  return {
    items: items.map(decorate),
    total,
    page: Number(page),
    limit: Number(limit),
    retentionLabel: RETENTION_LABEL,
    retentionMonths: RETENTION_MONTHS,
  };
};

export const getPrescription = async (id) => {
  const prescription = await prisma.prescription.findUnique({
    where: { id: Number(id) },
    include,
  });
  if (!prescription) throw new ApiError(404, 'Prescription not found');
  if (prescription.expireAt && new Date(prescription.expireAt).getTime() <= Date.now()) {
    throw new ApiError(404, 'Prescription not found');
  }
  return decorate(prescription);
};

// Public, unauthenticated lookup backing the QR code printed on the pad. It
// deliberately exposes no clinical detail beyond the issuing doctor and dates,
// so a scanned code cannot leak a patient's medicines.
export const verifyPrescription = async (code) => {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) throw new ApiError(400, 'Verification code is required');

  const doc = await prisma.prescription.findFirst({
    where: { verificationCode: normalized },
    include,
  });

  if (!doc) {
    return { valid: false, status: 'NOT_FOUND', message: 'No prescription matches this code.' };
  }

  const expired = Boolean(doc.expireAt) && new Date(doc.expireAt).getTime() <= Date.now();
  const p = doc.patient || {};

  return {
    valid: !expired,
    status: expired ? 'EXPIRED' : 'VALID',
    message: expired
      ? `This prescription expired on ${new Date(doc.expireAt).toISOString().slice(0, 10)}.`
      : 'This is a genuine, currently valid Nahol Dental Care prescription.',
    verificationCode: normalized,
    patientName: [p.firstName, p.lastName].filter(Boolean).join(' ') || null,
    doctorName: doc.doctor?.name || null,
    issuedAt: doc.createdAt,
    validUntil: doc.expireAt,
    medicineCount: Array.isArray(doc.items) ? doc.items.length : 0,
  };
};

// A prescription is normally written for a patient who just sat in the chair at
// one branch, so the printed pad should name that branch. If the caller did not
// say which chamber it belongs to, assume it is the one from the patient's most
// recent appointment -- the branch that was actually selected at booking time.
const inferChamberIdFromBooking = async (patientId) => {
  const latest = await prisma.appointment.findFirst({
    where: { patientId: Number(patientId) },
    orderBy: [{ appointmentDate: 'desc' }, { createdAt: 'desc' }],
    select: { chamberId: true },
  });
  return latest?.chamberId ?? null;
};

let chamberBackfilled = false;

// One-time stamp so prescriptions that were written before the chamber field
// existed still print the branch their patient actually booked at. Idempotent:
// only rows with no chamberId are touched, and each patient's latest booking is
// looked up once. Runs alongside the retention backfill on every list/create
// and is a no-op once the table is fully stamped.
export const backfillDefaultChamber = async ({ force = false } = {}) => {
  if (chamberBackfilled && !force) return 0;
  chamberBackfilled = true;
  try {
    const rows = await prisma.prescription.findMany({
      where: { chamberId: null },
      select: { id: true, patientId: true },
    });
    if (!rows.length) return 0;
    const byPatient = new Map();
    let stamped = 0;
    for (const row of rows) {
      if (!row.patientId) continue;
      let chamberId = byPatient.get(row.patientId);
      if (chamberId === undefined) {
        chamberId = await inferChamberIdFromBooking(row.patientId);
        byPatient.set(row.patientId, chamberId);
      }
      if (!chamberId) continue;
      await prisma.prescription.update({ where: { id: row.id }, data: { chamberId } });
      stamped += 1;
    }
    if (stamped > 0) {
      console.log(`[Prescription] Stamped ${stamped} existing prescription(s) with their booked branch`);
    }
    return stamped;
  } catch (err) {
    console.error('[Prescription] Chamber backfill failed:', err.message);
    return null;
  }
};

export const createPrescription = async (data) => {
  await ensurePrescriptionSetup();
  backfillRetention();
  runRetentionSweep();
  backfillDefaultChamber();

  const items = normalizeItems(data);
  if (!items.length) throw new ApiError(422, 'At least one medicine entry is required');

  const createdAt = new Date();
  const prescription = await prisma.prescription.create({
    data: {
      patientId: Number(data.patientId),
      doctorId: Number(data.doctorId),
      chamberId: data.chamberId || (await inferChamberIdFromBooking(data.patientId)),
      items,
      ...legacySummary(items),
      instructions: data.instructions ?? data.notes ?? null,
      notes: data.notes ?? data.instructions ?? null,
      followUpDate: data.followUpDate || null,
      verificationCode: await generateVerificationCode(),
      createdAt,
      expireAt: computeExpireAt(createdAt),
    },
    include,
  });

  return decorate(prescription);
};

export const updatePrescription = async (id, data) => {
  const existing = await prisma.prescription.findUnique({ where: { id: Number(id) } });
  if (!existing) throw new ApiError(404, 'Prescription not found');
  if (existing.expireAt && new Date(existing.expireAt).getTime() <= Date.now()) {
    throw new ApiError(404, 'Prescription not found');
  }

  const payload = {};
  if (data.patientId !== undefined) payload.patientId = Number(data.patientId);
  if (data.doctorId !== undefined) payload.doctorId = Number(data.doctorId);
  if (data.chamberId !== undefined) payload.chamberId = data.chamberId ?? null;
  if (data.instructions !== undefined) payload.instructions = data.instructions ?? null;
  if (data.notes !== undefined) payload.notes = data.notes ?? null;
  if (data.followUpDate !== undefined) payload.followUpDate = data.followUpDate || null;

  // Editing never extends the retention window: expireAt stays pinned to the
  // original creation time, so the clock cannot be reset by re-saving.
  if (data.items !== undefined || data.medicine !== undefined) {
    const merged = { ...data };
    if (!merged.items?.length && !merged.medicine) merged.items = existing.items ?? normalizeItems(existing);
    const items = normalizeItems(merged);
    if (!items.length) throw new ApiError(422, 'At least one medicine entry is required');
    payload.items = items;
    Object.assign(payload, legacySummary(items));
  }

  const prescription = await prisma.prescription.update({
    where: { id: existing.id },
    data: payload,
    include,
  });

  return decorate(prescription);
};

export const deletePrescription = async (id) => {
  const existing = await prisma.prescription.findUnique({ where: { id: Number(id) } });
  if (!existing) throw new ApiError(404, 'Prescription not found');
  await prisma.prescription.delete({ where: { id: existing.id } });
};
