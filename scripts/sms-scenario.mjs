// Child process for one SMS scenario. Env (provider, endpoint, flags) is set by
// the parent before this file is imported, so config picks it up. Prints one
// RESULT line of JSON for the parent to assert on.
const name = process.argv[2];
const to = process.env.TEST_TO ?? '01712999001';
const out = (o) => console.log('RESULT:' + JSON.stringify(o));

// Imported dynamically so the env above is in place first.
const { sendSms, sendAppointmentBookedSms } = await import('../src/services/sms.service.js');
const { config } = await import('../src/config/index.js');

// Most scenarios are about driver behaviour and fault isolation, not about
// config resolution. TEST_BYPASS_DB hands the settings straight to sendSms so
// these cases do not each open a MongoDB connection.
const envSettings = () => ({
  provider: process.env.SMS_PROVIDER,
  apiKey: process.env.SMS_API_KEY,
  apiSecret: process.env.SMS_API_SECRET,
  senderId: process.env.SMS_SENDER_ID,
  type: process.env.SMS_TYPE,
  endpoint: process.env.SMS_ENDPOINT,
  enabled: ['1', 'true', 'yes', 'on'].includes(String(process.env.SMS_ENABLED ?? '').toLowerCase()),
});
const settings = process.env.TEST_BYPASS_DB === '1' ? envSettings() : undefined;

const t0 = Date.now();
try {
  if (name === 'booked-template') {
    const { appointmentSmsVars } = await import('../src/services/sms.service.js');
    const { renderSmsTemplate } = await import('../src/config/smsTemplates.js');
    const appt = {
      appointmentNumber: 'APT-2026-000032',
      appointmentDate: new Date(2026, 2, 12),
      appointmentTime: '14:30',
      patient: { firstName: 'Rahim', lastName: 'Uddin', phone: to },
      doctor: { name: 'Dr. Ayesha Rahman' },
      service: { name: { en: 'Scaling' } },
    };
    // Render here so the actual customer-facing copy can be asserted on, not
    // just the gateway's HTTP response.
    const message = renderSmsTemplate('APPOINTMENT_BOOKED', appointmentSmsVars(appt));
    const r = await sendSms({ to, message, settings });
    out({ name, ms: Date.now() - t0, message, ...r });
  } else {
    const r = await sendSms({ to, message: 'Nahol Dental Care: test message.', settings });
    out({ name, ms: Date.now() - t0, ...r });
  }
} catch (err) {
  // A throw here means the caller could have been broken by a gateway fault.
  out({ name, ms: Date.now() - t0, threw: true, error: err.message });
}
console.log('CONFIG:' + JSON.stringify({
  enabled: config.sms.enabled, provider: config.sms.provider, endpoint: config.sms.endpoint,
}));

