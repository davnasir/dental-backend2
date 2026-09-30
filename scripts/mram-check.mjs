import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { encryptSecret, decryptSecret, maskSecret } from '../src/utils/secret.js';
import mram from '../src/services/sms/providers/mram.js';

let pass = 0, fail = 0;
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}\n       got      ${a}\n       expected ${e}`); }
};

console.log('--- secret encryption ---');
const key = 'demo63ABCDEFGHIJKL.MNOPQRST';
const enc = encryptSecret(key);
check('ciphertext is not the key', enc.includes(key), false);
check('ciphertext is versioned', enc.startsWith('v1:'), true);
check('round trips', decryptSecret(enc), key);
check('same input, different ciphertext each time', encryptSecret(key) === enc, false);
check('null stays null', encryptSecret(null), null);
check('empty stays null', encryptSecret(''), null);
check('garbage does not throw', decryptSecret('not-a-real-ciphertext'), null);
check('wrong-shape does not throw', decryptSecret('v1:only:three'), null);
check('null stored does not throw', decryptSecret(null), null);
// Tamper with the ciphertext body and confirm GCM rejects it.
const parts = enc.split(':');
const tampered = `v1:${parts[1]}:${parts[2]}:${Buffer.from('tampered').toString('base64')}`;
check('tampered ciphertext rejected', decryptSecret(tampered), null);
check('mask hides the middle', maskSecret(key).includes('ABCDEFGH'), false);
check('mask keeps a recognisable prefix', maskSecret(key).startsWith('demo63'), true);
check('mask of null is null', maskSecret(null), null);
check('mask of short value still masks', maskSecret('abc').includes('b'), false);

console.log('\n--- MRAM driver (against a stub that echoes the request) ---');
let lastRequest = null;
let nextResponse = { status: 200, body: '{"status":"success","shoot_id":"SHOOT-77"}' };

const stub = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString();
    lastRequest = { method: req.method, url: req.url, contentType: req.headers['content-type'], raw, params: Object.fromEntries(new URLSearchParams(raw)) };
    res.writeHead(nextResponse.status, { 'Content-Type': 'application/json' });
    res.end(nextResponse.body);
  });
});
await new Promise((r) => stub.listen(5097, r));

const settings = { apiKey: key, senderId: 'NaholDental', type: 'text', endpoint: 'http://127.0.0.1:5097/smsapi' };

check('isConfigured with key+senderId', mram.isConfigured(settings), true);
check('isConfigured false without senderId', mram.isConfigured({ ...settings, senderId: '' }), false);
check('isConfigured false without key', mram.isConfigured({ ...settings, apiKey: '' }), false);

const sent = await mram.send({ to: '8801712345678', message: 'Hello Nahol Dental Care', settings });
check('uses POST', lastRequest.method, 'POST');
check('sends form encoding', lastRequest.contentType.includes('x-www-form-urlencoded'), true);
check('api_key field name', lastRequest.params.api_key, key);
check('senderid field name', lastRequest.params.senderid, 'NaholDental');
check('contacts field name (880 format, no plus)', lastRequest.params.contacts, '8801712345678');
check('msg field name', lastRequest.params.msg, 'Hello Nahol Dental Care');
check('type defaults to text', lastRequest.params.type, 'text');
check('no scheduledDateTime unless set', 'scheduledDateTime' in lastRequest.params, false);
check('send reports ok', sent.ok, true);
check('shoot id extracted', sent.providerMessageId, 'SHOOT-77');

await mram.send({ to: '8801712345678', message: 'x', settings: { ...settings, type: 'unicode' } });
check('unicode type sent through', lastRequest.params.type, 'unicode');

await mram.send({ to: '8801712345678', message: 'x', settings: { ...settings, scheduledDateTime: '2026-10-01 09:00' } });
check('scheduledDateTime sent when set', lastRequest.params.scheduledDateTime, '2026-10-01 09:00');

// Special characters must survive the form encoding the docs call for.
await mram.send({ to: '8801712345678', message: 'Cost ৳500 & up @ Nahol #1', settings });
check('special chars survive encoding', lastRequest.params.msg, 'Cost ৳500 & up @ Nahol #1');

console.log('\n--- MRAM documented error codes ---');
const codeCases = [
  ['1002', 'Sender Id/Masking Not Found'],
  ['1003', 'API Not Found'],
  ['1004', 'SPAM Detected'],
  ['1007', 'Balance Insufficient'],
  ['1008', 'Message is empty'],
  ['1009', 'Message Type Not Set (text/unicode)'],
  ['1012', 'Invalid Number'],
  ['1013', 'API limit error'],
  ['1015', 'SMS Content Validation Fails'],
  ['1016', 'IP address not allowed!!'],
];
for (const [code, label] of codeCases) {
  // MRAM reports failures inside a 200 response, in several shapes.
  for (const body of [`{"error_code":"${code}","error_msg":"${label}"}`, `${code}`, `{"error_msg":"${label}"}`]) {
    nextResponse = { status: 200, body };
    const r = await mram.send({ to: '8801712345678', message: 'x', settings });
    check(`code ${code} in "${body.slice(0, 32)}..." detected`, r.ok, false);
  }
}
nextResponse = { status: 200, body: '{"error_code":"1007"}' };
const insufficient = await mram.send({ to: '8801712345678', message: 'x', settings });
check('insufficient balance is named', insufficient.reason, 'mram_1007');
check('insufficient balance has a message', /[Bb]alance/.test(insufficient.message || ''), true);

nextResponse = { status: 500, body: 'server error' };
const httpErr = await mram.send({ to: '8801712345678', message: 'x', settings });
check('http 500 detected', httpErr.reason, 'http_500');

nextResponse = { status: 200, body: '{"status":"success","shoot_id":"SHOOT-88"}' };
const okAgain = await mram.send({ to: '8801712345678', message: 'x', settings });
check('success after errors still works', okAgain.ok, true);

// A success response is likely to carry a field literally named "error_code"
// holding 0. Reading that as a failure would silently disable every send.
for (const body of ['{"error_code":"0","error_msg":"success"}', '{"error_code":0,"error_msg":"SMS submitted"}', '{"status":"success","error_code":0,"shoot_id":"S9"}']) {
  nextResponse = { status: 200, body };
  const r = await mram.send({ to: '8801712345678', message: 'x', settings });
  check(`error_code 0 success not misread: ${body.slice(0, 40)}`, r.ok, true);
}
// Same, but a numeric code that merely contains digits of a real code.
nextResponse = { status: 200, body: '{"message":"sent to 10025 contacts"}' };
const digits = await mram.send({ to: '8801712345678', message: 'x', settings });
check('unrelated numbers in a message are not codes', digits.ok, true);

console.log('\n--- MRAM balance endpoint ---');
nextResponse = { status: 200, body: '{"balance":"120.50"}' };
const bal = await mram.getBalance({ ...settings, endpoint: 'http://127.0.0.1:5097/smsapi' });
check('balance ok', bal.ok, true);
check('balance value returned', bal.balance.balance, '120.50');
check('balance URL hits miscapi/getBalance', lastRequest.url.includes('/miscapi/'), true);
check('balance URL embeds the key', lastRequest.url.includes(encodeURIComponent(key)), true);
nextResponse = { status: 200, body: '{"error_code":"1010","error_msg":"Invalid User & Password"}' };
const badKey = await mram.getBalance({ ...settings, endpoint: 'http://127.0.0.1:5097/smsapi' });
check('balance detects a bad key', badKey.ok, false);

stub.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
void spawn;
