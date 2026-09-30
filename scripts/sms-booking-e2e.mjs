// End-to-end: a patient books through the public API and the confirmation SMS
// reaches the gateway in MRAM's wire format, carrying the panel-configured key.
import { createServer } from 'node:http';

const sent = [];
const stub = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    sent.push({ url: req.url, body: Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString())) });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"error_code":"0","error_msg":"success","shoot_id":"E2E-1"}');
  });
});
await new Promise((r) => stub.listen(5093, r));

process.env.SMS_ENDPOINT = 'http://127.0.0.1:5093/smsapi';
process.env.SMS_PROVIDER = 'mram';
process.env.SMS_ENABLED = '1';
process.env.SMS_TYPE = 'text';
process.env.NODE_ENV = 'test';
// Deliberately no SMS_API_KEY in env, so a send can only work if it was saved
// from the admin panel first.
delete process.env.SMS_API_KEY;

const app = (await import('../src/app.js')).default;
const prisma = (await import('../src/config/prisma.js')).default;
const { getDb } = await import('../src/config/prisma.js');
const bcrypt = (await import('bcryptjs')).default;
const { saveSmsSettings } = await import('../src/services/smsConfig.service.js');
const server = app.listen(5092);
await new Promise((r) => server.once('listening', r));
const BASE = 'http://127.0.0.1:5092';

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

const waitForSms = async (n, ms = 4000) => {
  const t0 = Date.now();
  while (sent.length < n && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 100));
  return sent.length >= n;
};

const db = await getDb();
await db.collection('smsConfig').deleteMany({});
const stamp = Date.now();

// Configure the gateway exactly as an admin would from the panel.
await saveSmsSettings({ apiKey: 'e2e63KEY.XYZ', senderId: 'NaholDental', type: 'text', enabled: true });

// A bookable doctor and service.
const workingHours = {
  saturday: { start: '00:00', end: '23:59' }, sunday: { start: '00:00', end: '23:59' },
  monday: { start: '00:00', end: '23:59' }, tuesday: { start: '00:00', end: '23:59' },
  wednesday: { start: '00:00', end: '23:59' }, thursday: { start: '00:00', end: '23:59' },
  friday: { start: '00:00', end: '23:59' },
};
const doctor = await prisma.doctor.create({
  data: {
    name: 'Dr. E2E Tester', email: `e2edoc${stamp}@example.test`, phone: '01711119999',
    specialization: 'General', qualification: 'BDS', registrationNumber: 'E2E-1',
    consultationFee: 500, workingHours, availability: { daysOff: [] }, sortOrder: 99, status: 'ACTIVE',
  },
});
const service = await prisma.category.create({ data: { name: { en: 'E2E Category' }, status: 'ACTIVE' } }).catch(() => null);
const svc = await prisma.service.create({
  data: { name: { en: 'E2E Scaling' }, slug: `e2e-scaling-${stamp}`, duration: 30, price: 500, status: 'ACTIVE' },
}).catch(() => null);

const email = `e2eadmin${stamp}@example.test`;
const password = 'TestPass!234';
await prisma.user.create({ data: { name: 'E2E Admin', email, password: await bcrypt.hash(password, 10), role: 'SUPER_ADMIN', status: 'ACTIVE' } });
const { json: login } = await api('/api/v1/auth/login', { method: 'POST', body: { email, password } });
const token = login?.data?.accessToken;

const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

console.log('--- public booking sends a confirmation SMS ---');
sent.length = 0;
let r = await api('/api/v1/appointments/public/book', {
  method: 'POST',
  body: { patient: { fullName: 'Rahim Uddin', phone: '01712345678' }, doctorId: doctor.id, appointmentDate: date, appointmentTime: '14:30', reason: 'Checkup' },
});
check('public booking is 201', r.status, 201);
const appointment = r.json?.data?.appointment;
check('booking returned an appointment number', typeof appointment?.appointmentNumber, 'string');
check('patient was created', typeof appointment?.patient?.id, 'number');
check('booking lands as PENDING', appointment?.status, 'PENDING');

check('SMS reached the gateway', await waitForSms(1), true);
const sms = sent[0]?.body ?? {};
check('sent to the MRAM endpoint', sent[0]?.url.includes('/smsapi'), true);
check('carried the panel api key', sms.api_key, 'e2e63KEY.XYZ');
check('carried the panel sender id', sms.senderid, 'NaholDental');
check('normalised the number', sms.contacts, '8801712345678');
check('used text type', sms.type, 'text');
check('no error code on a successful send', sms.error_code, undefined);

console.log('--- message content ---');
const msg = String(sms.msg ?? '');
check('message mentions the clinic', /nahol/i.test(msg), true);
check('message includes the appointment number', msg.includes(appointment.appointmentNumber), true);
check('message includes the patient name', /Rahim/i.test(msg), true);
check('message includes the doctor', /E2E Tester/i.test(msg), true);
check('message is within one SMS segment', msg.length <= 480, true);
console.log(`       -> ${msg}`);

console.log('--- admin booking path ---');
sent.length = 0;
r = await api('/api/v1/appointments', {
  method: 'POST', token,
  body: { patient: { fullName: 'Karim Akter', phone: '01812345678' }, doctorId: doctor.id, appointmentDate: date, appointmentTime: '15:30' },
});
check('admin booking is 201', r.status, 201);
const adminAppt = r.json?.data?.appointment;
check('admin SMS reached the gateway', await waitForSms(1), true);
check('admin booking used the panel key', sent[0]?.body.api_key, 'e2e63KEY.XYZ');
check('admin booking normalised the number', sent[0]?.body.contacts, '8801812345678');

console.log('--- confirmation transition ---');
sent.length = 0;
r = await api(`/api/v1/appointments/${adminAppt.id}/status`, { method: 'PATCH', token, body: { status: 'CONFIRMED' } });
check('status change is 200', r.status, 200);
check('status is now CONFIRMED', r.json?.data?.appointment?.status ?? r.json?.data?.status, 'CONFIRMED');
check('confirmation SMS reached the gateway', await waitForSms(1), true);
const confirmMsg = String(sent[0]?.body.msg ?? '');
check('confirmation used the panel key', sent[0]?.body.api_key, 'e2e63KEY.XYZ');
check('confirmation differs from the booking message', confirmMsg !== String(sms.msg), true);
console.log(`       -> ${confirmMsg}`);

console.log('--- gateway failure must not break booking ---');
// A second booking while the gateway is down should still return 201.
stub.close();
sent.length = 0;
r = await api('/api/v1/appointments/public/book', {
  method: 'POST',
  body: { patient: { fullName: 'Sadia Islam', phone: '01912345678' }, doctorId: doctor.id, appointmentDate: date, appointmentTime: '16:30' },
});
check('booking still succeeds when the gateway is down', r.status, 201);
await new Promise((r2) => setTimeout(r2, 1200));
check('the appointment was still created', typeof r.json?.data?.appointment?.id, 'number');

server.close();
await prisma.$disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
