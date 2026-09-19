import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth:
      config.smtp.user && config.smtp.password
        ? { user: config.smtp.user, pass: config.smtp.password }
        : undefined,
  });
  return transporter;
};

export const sendMail = async ({ to, subject, html, text }) => {
  if (!config.smtp.host) {
    // eslint-disable-next-line no-console
    console.warn('[Email] SMTP not configured, skipping email to', to);
    return null;
  }
  try {
    const result = await getTransporter().sendMail({
      from: config.smtp.from,
      to,
      subject,
      html,
      text,
    });
    return result;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Email Error]', err.message);
    return null;
  }
};

export const sendAppointmentEmail = async ({ email, name, appointmentNumber, doctorName, serviceName, date, time, status }) => {
  if (!email) return null;
  return sendMail({
    to: email,
    subject: `Appointment ${status} - Nahol Dental Care (${appointmentNumber})`,
    html: `
      <h3>Hello ${name},</h3>
      <p>Your dental appointment has been <strong>${status.toLowerCase()}</strong>.</p>
      <ul>
        <li><strong>Appointment:</strong> ${appointmentNumber}</li>
        <li><strong>Doctor:</strong> ${doctorName}</li>
        <li><strong>Treatment:</strong> ${serviceName || 'Consultation'}</li>
        <li><strong>Date:</strong> ${date}</li>
        <li><strong>Time:</strong> ${time}</li>
      </ul>
      <p>Thank you for choosing Nahol Dental Care.</p>
    `,
  });
};