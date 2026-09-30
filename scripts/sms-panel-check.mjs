// Exercises the admin-panel configuration path against a real database:
// panel-over-env precedence, encryption at rest, key masking, and that the API
// key never leaves the server in plaintext.
import { createServer } from 'node:http';

// Stub gateway, started before the service modules are imported so the
// SMS_ENDPOINT env var is picked up by config.
let lastBody = null;
const stub = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    lastBody = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"error_code":"0","error_msg":"success","shoot_id":"P1"}');
  });
});
await new Promise((r) => stub.listen(5095, r));

process.env.SMS_ENDPOINT = 'http://127.0.0.1:5095/smsapi';
process.env.SMS_PROVIDER = 'mram';
process.env.SMS_ENABLED = '1';
process.env.SMS_API_KEY = 'env-key-should-lose';
process.env.SMS_SENDER_ID = 'EnvSender';
process.env.SMS_TYPE = 'text';

const { getSmsSettings, getSmsSettingsForPanel, saveSmsSettings, invalidateSmsSettingsCache } =
  await import('../src/services/smsConfig.service.js');
const { sendSms } = await import('../src/services/sms.service.js');
const { getDb } = await import('../src/config/prisma.js');

let pass = 0, fail = 0;
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}\n       got      ${a}\n       expected ${e}`); }
};

const PANEL_KEY = 'demo63REALKEY123.SECRET456';
const db = await getDb();

// 1. Nothing saved yet -> env is used.
await db.collection('smsConfig').deleteMany({});
invalidateSmsSettingsCache();
let s = await getSmsSettings();
check('falls back to env when nothing saved', s.apiKey, 'env-key-should-lose');
check('env sender id used', s.senderId, 'EnvSender');
check('source is env', s.source, 'env');

let panel = await getSmsSettingsForPanel();
check('panel reports a key exists', panel.hasApiKey, true);
check('panel reports env source', panel.apiKeySource, 'env');
check('panel never returns the raw key', JSON.stringify(panel).includes('env-key-should-lose'), false);

// 2. Saving from the panel must win over env, and must be encrypted at rest.
await saveSmsSettings({ apiKey: PANEL_KEY, senderId: 'NaholDental', type: 'text', enabled: true, userId: 7 });
s = await getSmsSettings();
check('panel value overrides env', s.apiKey, PANEL_KEY);
check('panel sender id wins', s.senderId, 'NaholDental');
check('source is panel', s.source, 'panel');
check('enabled from panel', s.enabled, true);
check('recorded who changed it', s.updatedBy, 7);

const doc = await db.collection('smsConfig').findOne({ key: 'gateway' });
const raw = JSON.stringify(doc);
check('raw document is not the key', raw.includes(PANEL_KEY), false);
check('raw document is not the env key', raw.includes('env-key-should-lose'), false);
check('raw document holds a v1 ciphertext', typeof doc.apiKeyEnc === 'string' && doc.apiKeyEnc.startsWith('v1:'), true);
check('ciphertext decrypts back to the key', (await import('../src/utils/secret.js')).decryptSecret(doc.apiKeyEnc), PANEL_KEY);

// 3. The panel payload must never contain the secret.
panel = await getSmsSettingsForPanel();
const panelJson = JSON.stringify(panel);
check('panel payload has no plaintext key', panelJson.includes(PANEL_KEY), false);
check('panel payload has no ciphertext', panelJson.includes('v1:'), false);
check('panel masks the key', /demo63\*+/.test(panel.apiKeyMasked), true);
check('panel reports hasApiKey', panel.hasApiKey, true);
check('panel reports ready', panel.ready, true);

// 4. A real send must use the panel key on the wire.
lastBody = null;
const sent = await sendSms({ to: '01712345678', message: 'Panel configured hello' });
check('send succeeded', sent.ok, true);
check('wire carried the panel key', lastBody.api_key, PANEL_KEY);
check('wire carried the panel sender id', lastBody.senderid, 'NaholDental');
check('wire normalised the number', lastBody.contacts, '8801712345678');

// 5. Saving other fields must not wipe the stored key (the panel sends an empty
//    field when the admin does not retype it).
await saveSmsSettings({ senderId: 'NaholDental2', type: 'unicode', userId: 7 });
s = await getSmsSettings();
check('key survives an unrelated save', s.apiKey, PANEL_KEY);
check('sender id updated', s.senderId, 'NaholDental2');
check('type updated', s.type, 'unicode');
lastBody = null;
await sendSms({ to: '01712345678', message: 'x' });
check('unicode type reaches the wire', lastBody.type, 'unicode');

// 6. Turning sending off stops messages but keeps the key.
await saveSmsSettings({ enabled: false });
const off = await sendSms({ to: '01712345678', message: 'should not send' });
check('disabled skips the send', off.skipped === true && off.reason === 'disabled', true);
check('key still stored while disabled', (await getSmsSettings()).apiKey, PANEL_KEY);

// 7. An empty string explicitly clears the key.
await saveSmsSettings({ apiKey: '' });
s = await getSmsSettings();
check('explicit empty string clears the key', s.apiKey, 'env-key-should-lose');
check('cleared state reported to panel', (await getSmsSettingsForPanel()).apiKeySource, 'env');

// 8. A ciphertext written under a different server secret must be survivable.
await saveSmsSettings({ apiKey: PANEL_KEY, senderId: 'NaholDental', enabled: true });
const { config } = await import('../src/config/index.js');
const realKey = process.env.SMS_SECRET_KEY || config.jwt.accessSecret;
process.env.SMS_SECRET_KEY = 'a-completely-different-secret';
invalidateSmsSettingsCache();
panel = await getSmsSettingsForPanel();
check('undecryptable key is flagged for re-entry', panel.needsReentry, true);
// Falls back to the env key rather than stopping sends dead, but the admin is
// told the active key is not the one from the panel.
check('undecryptable key falls back to env', panel.apiKeySource, 'env');
lastBody = null;
await sendSms({ to: '01712345678', message: 'x' });
check('undecryptable key is not sent', lastBody.api_key !== PANEL_KEY, true);
process.env.SMS_SECRET_KEY = realKey;
invalidateSmsSettingsCache();
check('restoring the secret restores access', (await getSmsSettingsForPanel()).hasApiKey, true);

// 9. With no env key to fall back on, an unreadable key must be reported as
//    "no key" so the panel asks for a re-entry. fromEnv() reads the config
//    object captured at import, so config is what has to be overridden here.
const savedEnvKey = config.sms.apiKey;
config.sms.apiKey = '';
process.env.SMS_SECRET_KEY = 'a-completely-different-secret';
invalidateSmsSettingsCache();
panel = await getSmsSettingsForPanel();
check('no fallback: hasApiKey false', panel.hasApiKey, false);
check('no fallback: needsReentry true', panel.needsReentry, true);
check('no fallback: not ready', panel.ready, false);
const noKey = await sendSms({ to: '01712345678', message: 'x' });
check('no fallback: send refused', noKey.ok, false);
check('no fallback: refuses for missing key', noKey.reason, 'not-configured');
config.sms.apiKey = savedEnvKey;
process.env.SMS_SECRET_KEY = realKey;
invalidateSmsSettingsCache();
check('cleanup: panel key usable again', (await getSmsSettings()).apiKey, PANEL_KEY);

await db.collection('smsConfig').deleteMany({});
stub.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
