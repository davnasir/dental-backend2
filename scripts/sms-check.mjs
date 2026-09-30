import { normalizeBdPhone, appointmentSmsVars } from '../src/services/sms.service.js';
import { renderSmsTemplate, SMS_TEMPLATES } from '../src/config/smsTemplates.js';
import { classifyResponse, pickMessageId } from '../src/services/sms/providers/shared.js';
import { listSmsProviders, getSmsProvider } from '../src/services/sms/providers/index.js';
import { to12hTimeStr } from '../src/utils/date.js';

let pass = 0;
let fail = 0;
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`  FAIL ${name}\n       got      ${a}\n       expected ${e}`);
  }
};

console.log('--- phone normalization ---');
check('local mobile 01712345678', normalizeBdPhone('01712345678'), '8801712345678');
check('local with +880', normalizeBdPhone('+8801712345678'), '8801712345678');
check('local with 00', normalizeBdPhone('008801712345678'), '8801712345678');
check('spaced', normalizeBdPhone('01712 345 678'), '8801712345678');
check('dashes', normalizeBdPhone('017-1234-5678'), '8801712345678');
check('bracketed', normalizeBdPhone('(+880) 1712345678'), '8801712345678');
check('numeric type', normalizeBdPhone(1712345678), '8801712345678');
check('country code omitted', normalizeBdPhone('1712345678'), '8801712345678');
check('landline', normalizeBdPhone('02-9612345'), '88029612345');
check('already intl', normalizeBdPhone('8801712345678'), '8801712345678');
check('too short', normalizeBdPhone('12345'), null);
check('empty', normalizeBdPhone(''), null);
check('null', normalizeBdPhone(null), null);
check('undefined', normalizeBdPhone(undefined), null);
check('letters only', normalizeBdPhone('n/a'), null);
check('too long', normalizeBdPhone('12345678901234567'), null);
check('leading 019 (Robi)', normalizeBdPhone('01912345678'), '8801912345678');

console.log('--- 12-hour time ---');
check('midnight', to12hTimeStr('00:00'), '12:00 AM');
check('1am', to12hTimeStr('01:05'), '1:05 AM');
check('noon', to12hTimeStr('12:00'), '12:00 PM');
check('afternoon', to12hTimeStr('14:30'), '2:30 PM');
check('last minute of day', to12hTimeStr('23:59'), '11:59 PM');
check('single digit hour', to12hTimeStr('9:05'), '9:05 AM');
check('empty', to12hTimeStr(''), '');
check('null', to12hTimeStr(null), '');
check('already 12h passes through', to12hTimeStr('2:30 PM'), '2:30 PM');
check('garbage passes through', to12hTimeStr('later'), 'later');

console.log('--- appointment vars ---');
const built = appointmentSmsVars({
  patient: { firstName: 'Rahim', lastName: 'Uddin', phone: '01712345678' },
  appointmentNumber: 'APT-0007',
  doctor: { name: 'Dr. Ayesha' },
  chamber: { id: 1, name: 'Uttara Branch' },
  appointmentDate: new Date('2026-03-12T00:00:00'),
  appointmentTime: '14:30',
});
check('vars carry branch', built.branchName, 'Uttara Branch');
check('vars time is 12h', built.time, '2:30 PM');
check('vars date is human', built.date, '12 Mar 2026');
const branchless = appointmentSmsVars({ patient: {}, appointmentTime: '09:00' });
check('missing chamber is blank', branchless.branchName, '');
check('missing chamber leaves no braces', /\{\{|\}\}/.test(renderSmsTemplate('APPOINTMENT_BOOKED', branchless)), false);
check('missing chamber still 2 segments', Math.ceil(renderSmsTemplate('APPOINTMENT_BOOKED', branchless).length / 160) <= 2, true);

console.log('--- templates ---');
const vars = {
  patientName: 'Rahim Uddin',
  appointmentNumber: 'APT-0007',
  doctorName: 'Dr. Ayesha',
  branchName: 'Uttara Branch',
  serviceName: 'Scaling',
  date: '12 Mar 2026',
  time: '2:30 PM',
};
const booked = renderSmsTemplate('APPOINTMENT_BOOKED', vars);
const confirmed = renderSmsTemplate('APPOINTMENT_CONFIRMED', vars);
const segments = (s) => Math.ceil(s.length / 160);
console.log(`  booked    (${booked.length} chars, ${segments(booked)} segments): ${booked}`);
console.log(`  confirmed (${confirmed.length} chars, ${segments(confirmed)} segments): ${confirmed}`);
check('booked has number', booked.includes('APT-0007'), true);
check('booked has doctor', booked.includes('Dr. Ayesha'), true);
check('booked has date+time', booked.includes('12 Mar 2026') && booked.includes('2:30 PM'), true);
check('booked has branch', booked.includes('Uttara Branch'), true);
check('confirmed says confirmed', /confirmed/i.test(confirmed), true);
check('confirmed has branch', confirmed.includes('Uttara Branch'), true);
check('no leftover braces', /\{\{|\}\}/.test(booked + confirmed), false);
// Naming the branch costs a second billable GSM-7 segment; that is a conscious
// trade-off, so the guard is "do not silently grow past two".
check('booked is at most 2 segments', segments(booked) <= 2, true);
check('confirmed is at most 2 segments', segments(confirmed) <= 2, true);
// Blank optional fields must not leave gaps, stub words or stray placeholders.
const sparse = renderSmsTemplate('APPOINTMENT_CONFIRMED', { ...vars, doctorName: '', time: '' });
check('sparse has no double spaces', /\s{2,}/.test(sparse), false);
check('sparse leaves no braces', /\{\{|\}\}/.test(sparse), false);
check('sparse drops the stub preposition', /with|at\s*[.,]/.test(sparse), false);
console.log(`  sparse    (${sparse.length} chars): ${sparse}`);
// An appointment booked without a chamber (admin-created ones have no branch
// picker) must not read "... at ." in a message the patient sees.
const noBranch = renderSmsTemplate('APPOINTMENT_BOOKED', { ...vars, branchName: '' });
check('no branch leaves no stub preposition', /\bat\s*[.,]/.test(noBranch), false);
check('no branch leaves no double spaces', /\s{2,}/.test(noBranch), false);
console.log(`  no-branch (${noBranch.length} chars): ${noBranch}`);
let threw = false;
try { renderSmsTemplate('NOPE', vars); } catch { threw = true; }
check('unknown template throws', threw, true);
check('both templates are single-line', Object.values(SMS_TEMPLATES).every((t) => !t.includes('\n')), true);

console.log('--- response classification ---');
check('clean 200 success', classifyResponse({ status: 200, text: '{"status":"success"}' }), { ok: true });
// A 200 can still report a rejection; whichever keyword is found first wins.
const errBody = classifyResponse({ status: 200, text: '{"error":"Invalid number"}' });
check('200 with error body is a failure', errBody.ok, false);
check('200 with error body names a keyword', /^body_reported_failure:/.test(errBody.reason), true);
check('200 with no credit', classifyResponse({ status: 200, text: 'Sorry, you have no credit' }), { ok: false, reason: 'body_reported_failure:no credit' });
check('401', classifyResponse({ status: 401, text: 'nope' }), { ok: false, reason: 'http_401' });
check('500 with fail word', classifyResponse({ status: 500, text: 'x' }), { ok: false, reason: 'http_500' });
check('empty 200 body is success', classifyResponse({ status: 200, text: '' }), { ok: true });
check('unauthorized keyword caught', classifyResponse({ status: 200, text: '{"msg":"unauthorized key"}' }).ok, false);
check('message id top level', pickMessageId({ message_id: 'abc' }), 'abc');
check('message id nested', pickMessageId({ data: { msgid: 'xyz' } }), 'xyz');
check('no id', pickMessageId({ foo: 1 }), null);

console.log('--- registry ---');
check('providers', listSmsProviders(), ['mram', 'mock', 'generic', 'sslwireless']);
check('known provider', getSmsProvider('generic').name, 'generic');
check('mram is registered', getSmsProvider('mram').name, 'mram');
check('unknown provider', getSmsProvider('nope'), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
