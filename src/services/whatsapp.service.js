import { config } from '../config/index.js';

const buildMessage = ({ patientName, appointmentNumber, doctorName, treatment, date, time }) => {
  return `Hello ${patientName},

Your dental appointment has been requested.

Appointment:
${appointmentNumber}

Doctor:
${doctorName}

Treatment:
${treatment}

Date:
${date}

Time:
${time}

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