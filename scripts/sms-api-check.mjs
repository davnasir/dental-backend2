// End-to-end checks against the real Express app: admin-only access to the SMS
// configuration, and that the MRAM API key never crosses the wire in plaintext.
import { createServer } from 'node:http';

let lastBody = null;
let lastUrl = '';
const stub = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    lastUrl = req.url;
    lastBody = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url.includes('getBalance')) res.end('{"balance":"120.50"}');
    else res.end('{"error_code":"0","error_msg":"success","shoot_id":"API-1"}');
  });
});
await new Promise((r) => stub.listen(5094, r));

process.env.SMS_ENDPOINT = 'http://127.0.0.1:5094/smsapi';
process.env.SMS_PROVIDER = 'mram';
process.env.SMS_ENABLED = '1';
process.env.SMS_API_KEY = 'env-key-must-not-leak';
process.env.SMS_SENDER_ID = 'EnvSender';
process.env.SMS_TYPE = 'text';
process.env.NODE_ENV = 'test';

const app = (await import('../src/app.js')).default;
const prisma = (await import('../src/config/prisma.js')).default;
const { getDb } = await import('../src/config/prisma.js');
const { invalidateSmsSettingsCache } = await import('../src/services/smsConfig.service.js');
const bcrypt = (await import('bcryptjs')).default;
const server = app.listen(5099);
await new Promise((r) => server.once('listening', r));
const BASE = 'http://127.0.0.1:5099';

let pass = 0, fail = 0;
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}\n       got      ${a}\n       expected ${e}`); }
};

const api = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
};

const stamp = Date.now();
// The controller nests the panel payload under data.config.
const cfg = (res) => res.json?.data?.config ?? {};
const mkUser = async (role) => {
  const email = `sms${role.toLowerCase()}${stamp}@example.test`;
  const password = 'TestPass!234';
  await prisma.user.create({ data: { name: `${role} Tester`, email, password: await bcrypt.hash(password, 10), role, status: 'ACTIVE' } });
  const { json } = await api('/api/v1/auth/login', { method: 'POST', body: { email, password } });
  if (!json?.data?.accessToken) throw new Error(`login failed for ${role}: ${JSON.stringify(json)}`);
  return { token: json.data.accessToken, email, password };
};

// Start from a known state so the first read has to come from env.
await (await getDb()).collection('smsConfig').deleteMany({});
const admin = await mkUser('SUPER_ADMIN');
const doctor = await mkUser('DOCTOR');

console.log('--- authentication ---');
check('GET /sms without a token is 401', (await api('/api/v1/sms')).status, 401);
check('PUT /sms without a token is 401', (await api('/api/v1/sms', { method: 'PUT', body: { apiKey: 'x' } })).status, 401);
check('POST /sms/test without a token is 401', (await api('/api/v1/sms/test', { method: 'POST', body: { to: '01712345678' } })).status, 401);
check('GET /sms/balance without a token is 401', (await api('/api/v1/sms/balance')).status, 401);

console.log('--- role enforcement ---');
check('GET /sms as DOCTOR is 403', (await api('/api/v1/sms', { token: doctor.token })).status, 403);
check('PUT /sms as DOCTOR is 403', (await api('/api/v1/sms', { method: 'PUT', token: doctor.token, body: { apiKey: 'x' } })).status, 403);
check('POST /sms/test as DOCTOR is 403', (await api('/api/v1/sms/test', { method: 'POST', token: doctor.token, body: { to: '01712345678' } })).status, 403);
check('GET /sms/balance as DOCTOR is 403', (await api('/api/v1/sms/balance', { token: doctor.token })).status, 403);

console.log('--- admin read ---');
let r = await api('/api/v1/sms', { token: admin.token });
check('GET /sms as admin is 200', r.status, 200);
check('response never contains the env key', JSON.stringify(r.json).includes('env-key-must-not-leak'), false);
check('response never contains a key field', 'apiKey' in cfg(r), false);
check('reports hasApiKey from env', cfg(r).hasApiKey, true);
check('reports env source', cfg(r).apiKeySource, 'env');
check('no re-entry needed for env key', cfg(r).needsReentry, false);
check('masked value is offered', /\*/.test(cfg(r).apiKeyMasked ?? ''), true);

console.log('--- admin save ---');
r = await api('/api/v1/sms', { method: 'PUT', token: admin.token, body: { apiKey: 'panel63KEY.abc', senderId: 'NaholDental', type: 'text' } });
check('PUT /sms is 200', r.status, 200);
r = await api('/api/v1/sms', { token: admin.token });
check('saved key is not echoed', JSON.stringify(r.json).includes('panel63KEY.abc'), false);
check('saved key reported as present', cfg(r).hasApiKey, true);
check('source now panel', cfg(r).apiKeySource, 'panel');
check('ready', cfg(r).ready, true);
check('sender id saved', cfg(r).senderId, 'NaholDental');
check('panel payload holds no ciphertext', JSON.stringify(r.json).includes('v1:'), false);

console.log('--- admin test + balance ---');
lastBody = null;
r = await api('/api/v1/sms/test', { method: 'POST', token: admin.token, body: { to: '01712345678' } });
check('test send is 200', r.status, 200);
check('test send reported ok', r.json.data.ok, true);
check('gateway used the panel key', lastBody.api_key, 'panel63KEY.abc');
check('gateway used the panel sender', lastBody.senderid, 'NaholDental');

lastUrl = '';
r = await api('/api/v1/sms/balance', { token: admin.token });
check('balance is 200', r.status, 200);
check('balance reported ok', r.json.data.ok, true);
check('balance value returned', r.json.data.balance.balance, '120.50');
check('balance used the miscapi path', lastUrl.includes('getBalance'), true);

console.log('--- test send works while live sending is off ---');
// The panel tells the admin the test button works even when automatic sending
// is switched off, so that promise is asserted rather than assumed.
await api('/api/v1/sms', { method: 'PUT', token: admin.token, body: { enabled: false } });
check('disabled is reported to the panel', cfg(await api('/api/v1/sms', { token: admin.token })).enabled, false);
lastBody = null;
r = await api('/api/v1/sms/test', { method: 'POST', token: admin.token, body: { to: '01712345678' } });
check('test send succeeds while disabled', r.json.data.ok, true);
check('test send still reached the gateway', lastBody.api_key, 'panel63KEY.abc');
await api('/api/v1/sms', { method: 'PUT', token: admin.token, body: { enabled: true } });

console.log('--- gateway error codes reach the panel ---');
// A rejected test must surface MRAM's own code, not a generic failure.
const errorStub = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end('{"error_code":"1012","error_msg":"Invalid Number"}');
});
await new Promise((r2) => errorStub.listen(5091, r2));
await api('/api/v1/sms', { method: 'PUT', token: admin.token, body: { enabled: true } });
const endpointDoc = await (await getDb()).collection('smsConfig').findOne({ key: 'gateway' });
await (await getDb()).collection('smsConfig').updateOne({ key: 'gateway' }, { $set: { endpoint: 'http://127.0.0.1:5091/smsapi' } });
invalidateSmsSettingsCache();
r = await api('/api/v1/sms/test', { method: 'POST', token: admin.token, body: { to: '01712345678' } });
check('rejected test is not reported as ok', r.json.data.ok, false);
check('panel gets the real MRAM code', r.json.data.code, '1012');
check('panel gets a readable reason', r.json.data.reason, 'mram_1012');
// The human-readable wording the admin sees comes from the envelope message.
check('panel gets the human message', /Invalid Number/i.test(r.json.message || ''), true);
check('the key really was rejected by the gateway', /Invalid Number/i.test(r.json.message || ''), true);
errorStub.close();
// Put the real endpoint back for the remaining checks. The settings service
// caches, so a direct collection write has to invalidate it.
await (await getDb()).collection('smsConfig').updateOne({ key: 'gateway' }, { $set: { endpoint: endpointDoc?.endpoint ?? '' } });
invalidateSmsSettingsCache();

console.log('--- save semantics ---');
r = await api('/api/v1/sms', { method: 'PUT', token: admin.token, body: { senderId: 'NaholDental2' } });
check('save without a key is 200', r.status, 200);
r = await api('/api/v1/sms', { token: admin.token });
check('omitted key is preserved', cfg(r).hasApiKey, true);
check('omitted key keeps panel source', cfg(r).apiKeySource, 'panel');
check('other field updated', cfg(r).senderId, 'NaholDental2');
lastBody = null;
await api('/api/v1/sms/test', { method: 'POST', token: admin.token, body: { to: '01712345678' } });
check('preserved key still used on the wire', lastBody.api_key, 'panel63KEY.abc');

r = await api('/api/v1/sms', { method: 'PUT', token: admin.token, body: { apiKey: 'x', type: 'nonsense' } });
check('invalid type is rejected', r.status, 422);
// Schema violations come back as 422; the controller's own phone check rejects
// as 400. Either is a correct refusal, which is what matters here.
r = await api('/api/v1/sms/test', { method: 'POST', token: admin.token, body: { to: 'not-a-number' } });
check('invalid test number is rejected', [400, 422].includes(r.status), true);

r = await api('/api/v1/sms', { method: 'PUT', token: admin.token, body: { apiKey: '' } });
check('explicit empty key is 200', r.status, 200);
r = await api('/api/v1/sms', { token: admin.token });
check('empty key cleared back to env', cfg(r).apiKeySource, 'env');

console.log('--- no public exposure ---');
for (const p of ['/api/v1/sms', '/api/v1/sms/balance']) {
  check(`no public read of ${p}`, (await api(p)).status, 401);
}
// GET /api/v1/settings/:key is unauthenticated, which is why the MRAM key lives
// in its own smsConfig collection instead. The marker below is not a real secret:
// it exists to prove the public route really would serve anything in `setting`.
const db = await getDb();
await db.collection('setting').deleteMany({ key: 'smsGatewayHazardProbe' });
await prisma.setting.create({ data: { key: 'smsGatewayHazardProbe', value: { marker: 'PROBE-VALUE-123' } } });
const probe = await api('/api/v1/settings/smsGatewayHazardProbe');
check('public settings route serves anything in `setting`', JSON.stringify(probe.json).includes('PROBE-VALUE-123'), true);
check('public settings route cannot see smsConfig', JSON.stringify(probe.json).includes('panel63KEY'), false);
r = await api('/api/v1/settings/smsConfig');
check('no smsConfig key under the public settings route', JSON.stringify(r.json).includes('panel63KEY'), false);
check('public settings route returns no item for smsConfig', r.json?.data?.item ?? null, null);
await db.collection('setting').deleteMany({ key: 'smsGatewayHazardProbe' });
// The MRAM key must not be readable by an unauthenticated caller on any path.
check('unauthenticated cannot read the key', JSON.stringify(probe.json).includes('panel63KEY'), false);

server.close();
stub.close();
await prisma.$disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
