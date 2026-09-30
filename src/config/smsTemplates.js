// Customer-facing SMS copy.
//
// Bangladeshi gateways bill per 160-character GSM-7 segment. Including the
// branch pushes these messages past 160, so each one is now billed as two
// segments -- that trade-off was made deliberately, in exchange for telling the
// patient which branch to turn up at. Placeholders use {{double braces}} so a
// template can be edited without touching the service.
//
// To change the wording, edit the string below -- no code change is needed.
// Available placeholders are built by appointmentSmsVars() in sms.service.js.

export const SMS_TEMPLATES = {
  // Sent the moment an appointment is booked, before the clinic has reviewed it.
  APPOINTMENT_BOOKED:
    'Nahol Dental Care: Dear {{patientName}}, your appointment {{appointmentNumber}} is requested for {{date}} at {{time}} with {{doctorName}} at {{branchName}}. We will confirm by SMS shortly.',

  // Sent when staff move the appointment from PENDING to CONFIRMED.
  APPOINTMENT_CONFIRMED:
    'Nahol Dental Care: Dear {{patientName}}, your appointment {{appointmentNumber}} on {{date}} at {{time}} with {{doctorName}} at {{branchName}} is confirmed. Please arrive 10 minutes early.',
};

// Replace {{key}} with vars[key]. A missing or blank value becomes a null-byte
// marker rather than an empty string, so renderSmsTemplate can also drop the
// word that introduced it -- otherwise "at {{branchName}}." reads as "at ."
// for an appointment booked without a branch.
const BLANK = '\u0000';

const render = (template, vars = {}) =>
  template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value === null || value === undefined || value === '' ? BLANK : String(value);
  });

export const renderSmsTemplate = (key, vars) => {
  const template = SMS_TEMPLATES[key];
  if (!template) throw new Error(`Unknown SMS template: ${key}`);
  return (
    render(template, vars)
      // Drop an empty placeholder together with the connector in front of it
      // ("at", "with", a comma...), so blank fields never leave a stub word.
      .replace(new RegExp(`[ \\t]*(?:\\bat\\b|with|of|,|;|:)?[ \\t]*${BLANK}[ \\t]*`, 'g'), ' ')
      // Tidy up the gaps left by blank optional fields (e.g. no service selected).
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+([,.;:])/g, '$1')
      .trim()
  );
};
