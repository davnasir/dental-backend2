import {
  getSmsSettingsForPanel,
  saveSmsSettings,
  getSmsSettings,
} from '../services/smsConfig.service.js';
import { sendSms, normalizeBdPhone } from '../services/sms.service.js';
import { getSmsProvider } from '../services/sms/providers/index.js';
import { successResponse, ApiError } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';

// Admin panel handlers for the SMS gateway. Every route behind these requires
// an authenticated SUPER_ADMIN or ADMIN, and no response ever contains the API
// key itself -- only a mask and a boolean saying whether one is stored.

export const getSmsConfig = async (req, res) => {
  const config = await getSmsSettingsForPanel();
  return successResponse(res, 200, 'SMS configuration fetched', { config });
};

export const putSmsConfig = async (req, res) => {
  const { apiKey, senderId, type, enabled } = req.body;

  // Distinguish "field absent" (keep existing) from "empty string" (clear it).
  const hasKeyField = Object.prototype.hasOwnProperty.call(req.body, 'apiKey');
  await saveSmsSettings({
    apiKey: hasKeyField ? String(apiKey ?? '').trim() : undefined,
    senderId,
    type,
    enabled,
    userId: req.user.id,
  });

  await logAudit({
    userId: req.user.id,
    action: hasKeyField && apiKey ? 'SMS_API_KEY_UPDATED' : 'SMS_CONFIG_UPDATED',
    entity: 'SmsConfig',
    entityId: 'gateway',
    ip: getClientIp(req),
  });

  const config = await getSmsSettingsForPanel();
  return successResponse(res, 200, 'SMS configuration saved', { config });
};

// Proves the stored key actually works. Sends a real message to the number the
// admin types, because a balance lookup alone would not exercise the sender ID
// (MRAM error 1002) -- the two most common misconfigurations.
export const postSmsTest = async (req, res) => {
  const settings = await getSmsSettings();
  const to = normalizeBdPhone(req.body.to);
  if (!to) throw new ApiError(400, 'That does not look like a valid mobile number');

  if (!settings.apiKey) {
    throw new ApiError(400, 'No API key is configured. Enter your MRAM API key first.');
  }
  if (!settings.senderId) {
    throw new ApiError(400, 'No Sender ID is configured. Enter an MRAM-approved sender ID first.');
  }

  const driver = getSmsProvider(settings.provider);
  if (!driver) throw new ApiError(400, `Unknown SMS provider "${settings.provider}"`);

  // `force` so this works while live sending is still disabled in the panel.
  const result = await sendSms({
    to,
    message: req.body.message
      || `Nahol Dental Care: test message. Your SMS gateway is configured correctly.`,
    settings,
    force: true,
  });

  await logAudit({
    userId: req.user.id,
    action: 'SMS_TEST_SENT',
    entity: 'SmsConfig',
    entityId: 'gateway',
    ip: getClientIp(req),
  });

  if (!result.ok) {
    // The gateway's own error code is far more useful than a generic 502, so it
    // is passed straight through to the panel. Drivers report a `codes` array
    // (MRAM can return more than one); `code` covers the single-code providers.
    return successResponse(res, 200, result.message || 'MRAM did not accept the test message', {
      ok: false,
      reason: result.reason || result.error || 'send-failed',
      code: result.code ?? result.codes?.[0] ?? null,
      codes: result.codes || [],
      to,
    });
  }

  return successResponse(res, 200, 'Test message sent', {
    ok: true,
    to,
    provider: result.provider,
    providerMessageId: result.providerMessageId || null,
  });
};

// Optional extras from the MRAM documentation. Kept read-only and failure
// tolerant: a balance/DLR outage must not look like a broken configuration.
export const getSmsBalance = async (req, res) => {
  const settings = await getSmsSettings();
  if (!settings.apiKey) throw new ApiError(400, 'No API key is configured');

  const driver = getSmsProvider(settings.provider);
  if (typeof driver?.getBalance !== 'function') {
    throw new ApiError(400, `The "${settings.provider}" provider does not support balance lookups`);
  }
  try {
    const result = await driver.getBalance(settings);
    return successResponse(res, 200, 'Balance fetched', result);
  } catch (err) {
    return successResponse(res, 200, 'Could not reach the gateway', { ok: false, reason: err.message });
  }
};
