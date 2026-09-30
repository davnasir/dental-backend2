// Runs each SMS scenario in its own process with its own env, against a local
// stub gateway, and asserts the outcome. No database or HTTP server involved.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const stub = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString();
    // Match on pathname: the generic driver appends a query string in query auth mode.
    const path = (req.url || '/').split('?')[0];
    const json = (status, obj) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (path === '/ok') return json(200, { status: 'success', message_id: 'MSG123' });
    if (path === '/errbody') return json(200, { error: 'Invalid number' });
    if (path === '/nocredit') return json(200, { message: 'You have no credit balance' });
    if (path === '/500') { res.writeHead(500); return res.end('boom'); }
    if (path === '/echo') {
      // Echo what the driver actually put on the wire, so field-name mapping,
      // auth placement and content type can all be asserted.
      return json(200, {
        status: 'success',
        method: req.method,
        contentType: req.headers['content-type'] || null,
        authorization: req.headers['authorization'] || null,
        xApiKey: req.headers['x-api-key'] || null,
        query: req.url.split('?')[1] || null,
        raw,
      });
    }
    res.writeHead(404); res.end('{}');
  });
});

await new Promise((r) => stub.listen(5098, r));
const base = `http://127.0.0.1:5098`;

const run = (name, env) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/sms-scenario.mjs', name], {
      env: { ...process.env, ...env },
    });
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', () => {
      const line = out.split('\n').find((l) => l.startsWith('RESULT:'));
      resolve({ name, ...(line ? JSON.parse(line.slice(7)) : { crashed: true, err: err.slice(0, 300), out: out.slice(0, 300) }) });
    });
  });

const GEN = {
  SMS_ENABLED: '1', SMS_PROVIDER: 'generic', SMS_TIMEOUT_MS: '3000',
  SMS_ENDPOINT: `${base}/ok`, SMS_CONTENT_TYPE: 'json', SMS_AUTH_STYLE: 'body',
  SMS_API_KEY: 'AK-123', SMS_API_SECRET: 'AS-456', SMS_SENDER_ID: 'NaholDental',
};

const cases = [
  ['delivered',        'ok',        GEN,                                                  r => r.ok === true && r.providerMessageId === 'MSG123' && r.to === '8801712999001'],
  ['error in 200 body','errbody',   { ...GEN, SMS_ENDPOINT: `${base}/errbody` },         r => r.ok === false && /body_reported_failure/.test(r.reason)],
  ['no credit in 200', 'nocredit',  { ...GEN, SMS_ENDPOINT: `${base}/nocredit` },        r => r.ok === false && r.reason === 'body_reported_failure:no credit'],
  ['http 500',         '500',       { ...GEN, SMS_ENDPOINT: `${base}/500` },             r => r.ok === false && r.reason === 'http_500'],

  // Field mapping: this is the whole point of the generic driver.
  ['form + custom names', 'echo', { ...GEN, SMS_ENDPOINT: `${base}/echo`, SMS_CONTENT_TYPE: 'form',
      SMS_NUMBER_FIELD: 'mobile_number', SMS_MESSAGE_FIELD: 'msg',
      SMS_API_KEY_FIELD: 'apikey', SMS_API_SECRET_FIELD: 'apisecret', SMS_SENDER_ID_FIELD: 'senderid' },
    r => { const e = r.json; const f = new URLSearchParams(e.raw);
      return e.contentType?.includes('x-www-form-urlencoded') && f.get('mobile_number') === '8801712999001'
        && f.get('msg')?.includes('test message') && f.get('apikey') === 'AK-123'
        && f.get('apisecret') === 'AS-456' && f.get('senderid') === 'NaholDental'; }],
  ['bearer auth', 'echo', { ...GEN, SMS_ENDPOINT: `${base}/echo`, SMS_AUTH_STYLE: 'bearer' },
    r => { const e = r.json; return e.authorization === 'Bearer AK-123' && !e.raw.includes('AK-123'); }],
  ['query auth', 'echo', { ...GEN, SMS_ENDPOINT: `${base}/echo`, SMS_AUTH_STYLE: 'query' },
    r => { const e = r.json; const q = new URLSearchParams(e.query);
      return q.get('api_key') === 'AK-123' && q.get('to') === '8801712999001' && e.raw === ''; }],
  ['header auth', 'echo', { ...GEN, SMS_ENDPOINT: `${base}/echo`, SMS_AUTH_STYLE: 'header', SMS_AUTH_HEADER: 'X-Api-Key' },
    r => { const e = r.json; return e.xApiKey === 'AK-123'; }],

  ['sslwireless payload', 'echo', { SMS_ENABLED: '1', SMS_PROVIDER: 'sslwireless', SMS_ENDPOINT: `${base}/echo`,
      SMS_API_SECRET: 'SEC-9', SMS_SSLWIRELESS_SERVICE_TYPE: 'transactional', SMS_SSLWIRELESS_ROUTE: 'default' },
    r => { const e = r.json; const b = JSON.parse(e.raw);
      return b.number === '8801712999001' && b.msg?.includes('test message') && b.api_secret === 'SEC-9'
        && b.service_type === 'transactional' && b.route === 'default' && b.number.startsWith('880'); }],

  // Fault isolation: none of these may throw, and none may hang indefinitely.
  ['gateway refused',   'ok', { ...GEN, SMS_ENDPOINT: 'http://127.0.0.1:1/nope' },    r => r.threw !== true && r.ok === false && r.ms < 2500],
  ['gateway hangs',     'ok', { ...GEN, SMS_ENDPOINT: 'http://10.255.255.1:81/slow', SMS_TIMEOUT_MS: '1500' },
                                                                                      r => r.threw !== true && r.ok === false && r.ms >= 1400 && r.ms < 4000],
  ['bad hostname',      'ok', { ...GEN, SMS_ENDPOINT: 'http://nonexistent.invalid/s' }, r => r.threw !== true && r.ok === false && r.ms < 3000],

  ['SMS disabled',      'ok', { ...GEN, SMS_ENABLED: '0' },                            r => r.skipped === true && r.reason === 'disabled'],
  ['unknown provider',  'ok', { ...GEN, SMS_PROVIDER: 'not-a-gateway' },               r => r.skipped === true && r.reason === 'unknown-provider'],
  ['generic, no endpoint', 'ok', { ...GEN, SMS_ENDPOINT: '' },                         r => r.skipped === true && r.reason === 'not-configured'],
  ['sslwireless no creds', 'ok', { SMS_ENABLED: '1', SMS_PROVIDER: 'sslwireless', SMS_API_SECRET: '', SMS_API_KEY: '' },
                                                                                      r => r.skipped === true && r.reason === 'not-configured'],
  ['no phone',          'ok', { ...GEN }, { ...{}, TEST_TO: '' },                      r => r.skipped === true && r.reason === 'invalid-number'],
  ['garbage phone',     'ok', { ...GEN }, { ...{}, TEST_TO: 'n/a' },                    r => r.skipped === true && r.reason === 'invalid-number'],
  ['messy phone ok',    'ok', { ...GEN }, { ...{}, TEST_TO: '01712-345 678' },          r => r.ok === true && r.to === '8801712345678'],
  ['booked template',   'booked-template', { ...GEN }, { TEST_TO: '01712999001' },
                                                                                      r => r.ok === true && /APT-2026-000032/.test(r.message || '') && /12 Mar 2026/.test(r.message || '') && /Dr\. Ayesha Rahman/.test(r.message || '')],
];

let pass = 0, fail = 0;
for (const c of cases) {
  const [label, scenario, env, a, b] = c;
  // Tuples are written as either [label, scenario, env, assert] or
  // [label, scenario, env, extraEnv, assert]; normalise both shapes.
  const extra = typeof a === 'function' ? {} : (a || {});
  const assert = typeof a === 'function' ? a : b;
  const r = await run(scenario, { ...env, ...extra, TEST_BYPASS_DB: '1' });
  let good = false;
  let why = '';
  if (r.crashed) {
    why = `child crashed: ${(r.err || r.out || '').slice(0, 300)}`;
  } else if (r.threw === true) {
    // A throw would mean a gateway fault could break a booking request.
    why = `THREW: ${r.error}`;
  } else {
    try {
      good = Boolean(assert(r));
    } catch (err) {
      why = `assertion threw: ${err.message}`;
    }
    if (!good && !why) why = JSON.stringify(r).slice(0, 300);
  }
  if (good) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${label}\n       ${why}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
stub.close();
process.exit(fail ? 1 : 0);

