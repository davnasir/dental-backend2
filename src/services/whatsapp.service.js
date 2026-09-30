import { config } from '../config/index.js';

// Rendered as a "Label:\nvalue" block each. A section with no value is dropped
// entirely rather than sent as a dangling label or a literal "undefined".
const SECTIONS = [
  ['Appointment', 'appointmentNumber'],
  ['Doctor', 'doctorName'],
  ['Branch', 'branchName'],
  ['Treatment', 'treatment'],
  ['Date', 'date'],
  ['Time', 'time'],
];

const buildMessage = (payload) => {
  const { patientName, ...rest } = payload;
  const blocks = SECTIONS
    .map(([label, key]) => [label, rest[key]])
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => `${label}:\n${value}`)
    .join('\n\n');

  return `Hello ${patientName},

Your dental appointment has been requested.

${blocks}

Thank you.
`;
};

export const sendAppointmentWhatsApp = (payload) => {
  const number = payload.whatsappNumber || config.whatsapp.number;
  if (!number) {
    // eslint-disable-next-line no-console
    console.warn('[WhatsApp] WhatsApp number not configured.');
    return null;
  }

  const text = buildMessage(payload);
  const waUrl = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

  // Server-side: constructing a wa.me link used for the clinic's own outbound channel.
  // The clinic operator opens the link / or we store it for reference. No private
  // credentials are exposed to the frontend.
  return waUrl;
};

export const sendWhatsAppText = (payload) => {
  // Lightweight wrapper used by auth flows if WhatsApp confirms are ever needed.
  return sendAppointmentWhatsApp(payload);
};