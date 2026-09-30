import { getDb } from '../config/prisma.js';
import { config } from '../config/index.js';
import { encryptSecret, decryptSecret, maskSecret } from '../utils/secret.js';

// Gateway settings entered from the admin panel.
//
// These deliberately do NOT live in the `setting` collection: that collection
// is served by an unauthenticated route (GET /api/v1/settings/:key), so an API
// key stored there would be readable by anyone on the internet. This uses its
// own collection with a single document, reachable only through the
// admin-protected routes in sms.routes.js.

const COLLECTION = 'smsConfig';
const DOC_KEY = 'gateway';
const CACHE_TTL_MS = 30_000;

let cache = null; // { value, expiresAt }

const truthy = (v) => ['1', 'true', 'yes', 'on'].includes(String(v ?? '').toLowerCase());

// Env is the fallback so deployments that prefer .env (or CI) keep working.
// Anything set in the panel wins, because that is the newer, deliberate value.
const fromEnv = () => ({
  provider: config.sms.provider,
  apiKey: config.sms.apiKey,
  senderId: config.sms.senderId,
  type: config.sms.type || 'text',
  endpoint: config.sms.endpoint,
  enabled: config.sms.enabled,
  source: config.sms.apiKey ? 'env' : 'none',
});

const readDoc = async () => {
  const db = await getDb();
  return db.collection(COLLECTION).findOne({ key: DOC_KEY });
};

// Resolved settings for the send path. Never returns the API key to a client.
export const getSmsSettings = async () => {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  const env = fromEnv();
  let value = env;

  try {
    const doc = await readDoc();
    if (doc) {
      const apiKey = doc.apiKeyEnc ? decryptSecret(doc.apiKeyEnc) : null;
      // A present-but-undecryptable value means the server secret changed; the
      // panel is told to re-enter the key instead of silently sending nothing.
      const unreadable = Boolean(doc.apiKeyEnc) && !apiKey;
      value = {
        provider: doc.provider || 'mram',
        apiKey: apiKey || env.apiKey,
        senderId: doc.senderId || env.senderId,
        type: doc.type === 'unicode' ? 'unicode' : 'text',
        endpoint: doc.endpoint || env.endpoint,
        enabled: doc.enabled !== undefined ? Boolean(doc.enabled) : env.enabled,
        source: apiKey ? 'panel' : env.source,
        needsReentry: unreadable,
        updatedAt: doc.updatedAt || null,
        updatedBy: doc.updatedBy || null,
      };
    }
  } catch (err) {
    // A database problem must not stop SMS from working off .env.
    console.error('[SMS] could not read gateway settings, falling back to env:', err.message);
  }

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
};

export const invalidateSmsSettingsCache = () => {
  cache = null;
};

// apiKey: pass a value to replace it, or undefined to leave the stored key
// untouched (the panel sends an empty field when the admin does not retype it).
export const saveSmsSettings = async ({ apiKey, senderId, type, enabled, userId }) => {
  const db = await getDb();
  const existing = await db.collection(COLLECTION).findOne({ key: DOC_KEY });

  const set = { updatedAt: new Date(), updatedBy: userId || null };
  if (senderId !== undefined) set.senderId = (senderId || '').trim();
  if (type !== undefined) set.type = type === 'unicode' ? 'unicode' : 'text';
  if (enabled !== undefined) set.enabled = Boolean(enabled);
  if (apiKey) set.apiKeyEnc = encryptSecret(apiKey.trim());
  // An explicit empty string means "forget the stored key".
  if (apiKey === '') set.apiKeyEnc = null;

  await db.collection(COLLECTION).updateOne({ key: DOC_KEY }, { $set: set }, { upsert: true });
  invalidateSmsSettingsCache();
  return { ...(existing || {}), ...set };
};

// Everything the admin panel needs, with the key masked and never decrypted on
// the way out.
export const getSmsSettingsForPanel = async () => {
  const s = await getSmsSettings();
  const dbKeyPresent = s.source === 'panel';
  return {
    provider: s.provider,
    senderId: s.senderId || '',
    type: s.type,
    enabled: Boolean(s.enabled),
    hasApiKey: Boolean(s.apiKey),
    apiKeyMasked: maskSecret(s.apiKey),
    // Tells the panel whether the key came from .env (read-only here).
    apiKeySource: s.source,
    needsReentry: Boolean(s.needsReentry),
    endpoint: s.endpoint || '',
    updatedAt: s.updatedAt || null,
    updatedBy: s.updatedBy || null,
    ready: Boolean(s.enabled && s.apiKey && s.senderId),
  };
};

export { truthy };
