import crypto from 'node:crypto';
import { config } from '../config/index.js';

// Secrets entered through the admin panel (currently the MRAM API key) are
// encrypted before they touch MongoDB, so a database dump or a stolen backup
// cannot be turned into a billable SMS account.
//
// AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
// than silently producing garbage. The key is derived from a server-side secret
// with scrypt. If that secret is ever rotated the stored value becomes
// unreadable, which is why decrypt() reports failure instead of throwing and
// the caller asks for the key to be re-entered.

const SALT = 'nahol.sms.secret.v1';

// Falls back to the JWT secret so encryption works with no extra configuration;
// SMS_SECRET_KEY can be set to keep the two concerns separate.
const masterSecret = () =>
  process.env.SMS_SECRET_KEY || config.jwt.accessSecret || 'dev_access_secret';

const deriveKey = () =>
  crypto.scryptSync(masterSecret(), SALT, 32);

export const encryptSecret = (plain) => {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
};

export const decryptSecret = (stored) => {
  if (!stored || typeof stored !== 'string') return null;
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  const [, ivB64, tagB64, dataB64] = parts;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Wrong secret or tampered payload.
    return null;
  }
};

// Shows enough of a key for an admin to recognise which one is stored, without
// ever returning the value itself to the browser.
export const maskSecret = (plain) => {
  if (!plain) return null;
  const s = String(plain);
  // Short values are masked all but the final character; revealing a third of a
  // 3-character key would defeat the point.
  if (s.length <= 4) return `${'*'.repeat(Math.max(s.length - 1, 1))}${s.slice(-1)}`;
  return `${s.slice(0, 6)}${'*'.repeat(8)}${s.slice(-4)}`;
};
