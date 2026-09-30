// Normalize a wide range of date inputs into a JS Date that Prisma can
// serialize for a DateTime column. Returns null for missing/blank/invalid
// values so an empty form field never crashes with "Expected ISO-8601 DateTime".

export const toDateOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  // Native date inputs send YYYY-MM-DD. Interpret as local midnight so the
  // date stored/reported does not shift across timezones.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Numbers (epoch ms) and full ISO-8601 datetimes.
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Format a Date as a local YYYY-MM-DD string. Appointment dates are stored as
// local midnight, so toISOString() would shift them into the previous UTC day.
export const toLocalDateStr = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Format a Date as a local YYYY-MM string.
export const toLocalMonthStr = (date) => toLocalDateStr(date).slice(0, 7);

// Convert a stored "HH:mm" appointment time to 12-hour "h:mm AM/PM".
// Appointments are validated and persisted as 24-hour (see
// appointment.validator.js), but patients read 12-hour clocks, so every
// patient-facing message and the admin UI go through this. Anything that is
// not a well-formed 24-hour time is passed through untouched rather than
// rendered as "NaN:NaN".
export const to12hTimeStr = (time) => {
  if (time === null || time === undefined || time === '') return '';
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time).trim());
  if (!match) return String(time);
  const hours = Number(match[1]);
  if (hours > 23) return String(time);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${match[2]} ${suffix}`;
};