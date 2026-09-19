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