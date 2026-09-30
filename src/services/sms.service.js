import { config } from '../config/index.js';
import { toLocalDateStr, to12hTimeStr } from '../utils/date.js';
import { renderSmsTemplate } from '../config/smsTemplates.js';
import { getSmsProvider } from './sms/providers/index.js';
import { getSmsSettings } from './smsConfig.service.js';

// Bangladeshi mobile numbers are 01X-XXXXXXX locally and 8801XXXXXXXXX
// internationally. Aggregators reject both "+8801..." and the bare local form,
// so every number is normalized to the 13-digit 880... form before it leaves.
// Anything that is not a plausible 7-15 digit number is rejected here rather
// than billed as a failed send by the gateway.
export const normalizeBdPhone = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  let digits = String(raw).replace(/[^0-9]/g, '');
  if (!digits) return null;

  // "+880..." and "00880..." both arrive here as plain digits.
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('880')) {
    digits = digits.slice(3);
    return /^\d{8,12}$/.test(digits) ? `880${digits}` : null;
  }

  // The national trunk 0 is dropped when the country code is prepended:
  // 01712345678 becomes 8801712345678, never 88001712345678. Covers BD
  // landlines (029612345 -> 88029612345) as well as mobiles.
  if (/^0\d{8,10}$/.test(digits)) return `880${digits.slice(1)}`;

  // Country code already omitted: 1712345678 -> 8801712345678.
  if (/^1[3-9]\d{8}$/.test(digits)) return `880${digits}`;

  // Some other country's number, already in international form.
  if (/^\d{8,15}$/.test(digits)) return digits;
  return null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-03-12" reads like a database column; patients are better served by
// "12 Mar 2026" in a text message.
const humanDate = (value) => {
  const iso = toLocalDateStr(value);
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1] || month} ${year}`;
};

const serviceName = (service) => {
  const name = service?.name;
  if (!name) return 'Consultation';
  if (typeof name === 'string') return name;
  return name.en || name.bn || 'Consultation';
};

export const appointmentSmsVars = (appointment) => ({
  patientName:
    [appointment?.patient?.firstName, appointment?.patient?.lastName].filter(Boolean).join(' ') || 'there',
  appointmentNumber: appointment?.appointmentNumber || '',
  doctorName: appointment?.doctor?.name || 'our dentist',
  // The branch is the `chamber` relation; appointments are booked against a
  // specific chamber, so patients are told which location to turn up at.
  branchName: appointment?.chamber?.name || '',
  serviceName: serviceName(appointment?.service),
  date: humanDate(appointment?.appointmentDate),
  time: to12hTimeStr(appointment?.appointmentTime),
});

// Single entry point for every outbound SMS. Resolves with a result object and
// never rejects, so a gateway outage can never take down a booking request.
//
// Settings come from the admin panel when configured, otherwise from .env --
// see smsConfig.service.js. That lookup can fail (database down), in which case
// the .env values are used directly so SMS keeps working.
export const sendSms = async ({ to, message, settings: override, force = false }) => {
  const number = normalizeBdPhone(to);
  if (!number) {
    // eslint-disable-next-line no-console
    console.warn(`[SMS] skipped: no usable number (${to || 'missing'})`);
    return { ok: false, skipped: true, reason: 'invalid-number' };
  }

  let settings = override;
  if (!settings) {
    try {
      settings = await getSmsSettings();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[SMS] settings lookup failed, using env: ${err.message}`);
      settings = {
        provider: config.sms.provider,
        apiKey: config.sms.apiKey,
        apiSecret: config.sms.apiSecret,
        senderId: config.sms.senderId,
        type: config.sms.type,
        endpoint: config.sms.endpoint,
        enabled: config.sms.enabled,
      };
    }
  }

  // `force` is only used by the admin "send test" action, which must work while
  // live sending is still switched off.
  if (!settings.enabled && !force) {
    // eslint-disable-next-line no-console
    console.log(`[SMS] skipped: SMS is disabled (would send to ${number}: ${message})`);
    return { ok: false, skipped: true, reason: 'disabled' };
  }

  const driver = getSmsProvider(settings.provider);
  if (!driver) {
    // eslint-disable-next-line no-console
    console.error(`[SMS] unknown provider "${settings.provider}", skipping send to ${number}`);
    return { ok: false, skipped: true, reason: 'unknown-provider' };
  }
  if (!driver.isConfigured(settings)) {
    // eslint-disable-next-line no-console
    console.error(`[SMS] provider "${driver.name}" is not configured, skipping send to ${number}`);
    return { ok: false, skipped: true, reason: 'not-configured' };
  }

  try {
    const result = await driver.send({ to: number, message, settings });
    if (result.ok) {
      // eslint-disable-next-line no-console
      console.log(`[SMS] sent via ${driver.name} to ${number} (id=${result.providerMessageId ?? 'n/a'})`);
    } else {
      // eslint-disable-next-line no-console
      console.error(`[SMS] ${driver.name} refused ${number}: ${result.reason}${result.message ? ` (${result.message})` : ''}`);
    }
    return { ...result, to: number, provider: driver.name };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[SMS] ${driver.name} error for ${number}: ${err.message}`);
    return { ok: false, error: err.message, to: number, provider: driver.name };
  }
};

const dispatch = (templateKey, appointment) => {
  try {
    const message = renderSmsTemplate(templateKey, appointmentSmsVars(appointment));
    // Returned rather than awaited by callers: the message must not sit inside
    // the booking response, and sendSms resolves instead of throwing.
    return sendSms({ to: appointment?.patient?.phone, message });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[SMS] could not build ${templateKey}: ${err.message}`);
    return Promise.resolve({ ok: false, skipped: true, reason: 'template-error' });
  }
};

export const sendAppointmentBookedSms = (appointment) => dispatch('APPOINTMENT_BOOKED', appointment);

export const sendAppointmentConfirmedSms = (appointment) => dispatch('APPOINTMENT_CONFIRMED', appointment);
