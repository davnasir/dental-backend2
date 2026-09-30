// MRAM SMS -- Bangladesh gateway, implemented from "MRAM SMS API
// Documentation" (msg.mram.com.bd).
//
// Send (one to many):
//   POST https://msg.mram.com.bd/smsapi
//   api_key, type (text|unicode), senderid, contacts (numbers joined by '+'), msg
// The API also accepts the same parameters as a GET query string.
//
// Balance:
//   GET https://msg.mram.com.bd/miscapi/{API_KEY}/getBalance
//
// The documentation does not specify the success response shape, so success is
// decided the same way as for every other provider here: a non-2xx status, or a
// body containing one of MRAM's documented numeric error codes, is a failure.
// Anything else is accepted and the shoot id is picked out when present.

import { request, pickMessageId } from './shared.js';
import { config } from '../../../config/index.js';

const SEND_URL = 'https://msg.mram.com.bd/smsapi';
const BALANCE_URL = 'https://msg.mram.com.bd/miscapi';

// Error codes exactly as listed in the MRAM documentation.
const ERROR_CODES = {
  1002: 'Sender ID not found or not approved for this account',
  1003: 'API not found',
  1004: 'Spam detected, message denied',
  1005: 'Internal error',
  1006: 'Internal error',
  1007: 'Insufficient SMS credit balance',
  1008: 'Message is empty',
  1009: 'Message type not set (text/unicode)',
  1010: 'Invalid user or password',
  1011: 'Invalid user ID',
  1012: 'Invalid number',
  1013: 'API limit error',
  1014: 'No matching template',
  1015: 'SMS content validation failed',
  1016: 'IP address not allowed for this API key',
};

// MRAM usually reports failures as numeric codes, but it can also return only
// the message text, so the documented wording is matched too. Matching is done
// against the message fields rather than the whole body on purpose: a success
// response is likely to carry a field literally named "error_code" holding 0,
// and a naive keyword scan over the raw body would read that as a failure.
const MESSAGE_FIELDS = ['error_msg', 'errorMsg', 'message', 'msg', 'reason', 'detail', 'status_message', 'statusMessage'];

// For a JSON body this returns only the human-readable message fields, and an
// empty string when there are none. Falling back to the raw body there would be
// actively harmful: a success response carries a field named "error_code", and
// scanning that text for the word "error" turns every send into a false failure.
// For a non-JSON body the raw text is the only signal available, so it is used.
const messageText = (json, text) => {
  if (json === null || json === undefined || typeof json !== 'object') return String(text ?? '');
  const parts = MESSAGE_FIELDS.map((k) => json[k]).filter((v) => typeof v === 'string' || typeof v === 'number');
  return parts.length ? parts.join(' ') : '';
};

// The documented message wording, mapped back to its error code.
const MESSAGE_HINTS = [
  // The documentation writes this as "Sender Id/Masking Not Found", so the
  // separator between the two words is not always whitespace.
  [/sender\s*id.*not\s*found/i, 1002],
  [/api\s*not found/i, 1003],
  [/spam/i, 1004],
  [/internal\s*error/i, 1005],
  [/insufficient/i, 1007],
  [/message\s*is\s*empty/i, 1008],
  [/type\s*not\s*set/i, 1009],
  [/invalid\s*number/i, 1012],
  [/api\s*limit/i, 1013],
  [/no\s*matching\s*template/i, 1014],
  [/content\s*validation/i, 1015],
  [/ip\s*address\s*not\s*allowed/i, 1016],
];

const detectError = (json, text) => {
  const codes = [];
  const collect = (v) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) return v.forEach(collect);
    if (typeof v === 'object') return Object.values(v).forEach(collect);
    const s = String(v);
    for (const code of Object.keys(ERROR_CODES)) {
      if (new RegExp(`(^|\\D)${code}(\\D|$)`).test(s)) codes.push(code);
    }
  };
  if (json !== null && json !== undefined) collect(json);
  collect(text);

  const msg = messageText(json, text);
  if (!codes.length) {
    const hint = MESSAGE_HINTS.find(([re]) => re.test(msg));
    if (hint) codes.push(String(hint[1]));
  }
  // Preserve order, drop duplicates.
  return [...new Set(codes)];
};

const describe = (json, text, httpStatus) => {
  const codes = detectError(json, text);
  if (codes.length) {
    return { ok: false, reason: `mram_${codes[0]}`, message: ERROR_CODES[codes[0]], codes };
  }
  // A non-2xx is unambiguous, so it is reported as-is rather than being run
  // through the fuzzy keyword scan below (a 500 page saying "server error"
  // should read as an HTTP failure, not a body match).
  if (httpStatus < 200 || httpStatus >= 300) {
    return { ok: false, reason: `http_${httpStatus}`, message: `MRAM returned HTTP ${httpStatus}` };
  }
  // Last resort for an undocumented failure: the same keyword scan used for
  // other gateways, applied to the message text only.
  const msg = messageText(json, text);
  const hit = config.sms.failKeywords.find((k) => k && msg.toLowerCase().includes(k));
  if (hit) return { ok: false, reason: `mram_body_reported_failure:${hit}`, message: msg.slice(0, 200) };
  return { ok: true };
};

// The shoot id is what the delivery report API keys off, so it is worth keeping.
const shootId = (json) => {
  if (!json || typeof json !== 'object') return null;
  for (const key of ['shoot_id', 'sms_shoot_id', 'shootId', 'smsShootId', 'message_id', 'id']) {
    if (json[key] !== undefined && json[key] !== null) return json[key];
  }
  return pickMessageId(json);
};

export default {
  name: 'mram',

  isConfigured: (settings) => Boolean(settings?.apiKey && settings?.senderId),

  send: async ({ to, message, settings }) => {
    const base = settings.endpoint || SEND_URL;
    const params = {
      api_key: settings.apiKey,
      // 'unicode' is required for Bangla; 'text' is the GSM-7 default.
      type: settings.type === 'unicode' ? 'unicode' : 'text',
      senderid: settings.senderId,
      // MRAM takes a '+'-separated list even for a single recipient.
      contacts: to,
      msg: message,
    };
    if (settings.scheduledDateTime) params.scheduledDateTime = settings.scheduledDateTime;

    const res = await request({
      url: base,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });

    const verdict = describe(res.json, res.text, res.status);
    return { ...verdict, ...(verdict.ok ? { providerMessageId: shootId(res.json) } : {}) };
  },

  // Used by the admin "Test connection" button to prove the key is live before
  // any patient-facing message is sent.
  getBalance: async (settings) => {
    const key = settings.apiKey;
    const url = settings.endpoint
      ? `${settings.endpoint.replace(/\/smsapi\/?$/, '')}/miscapi/${encodeURIComponent(key)}/getBalance`
      : `${BALANCE_URL}/${encodeURIComponent(key)}/getBalance`;
    const res = await request({ url, method: 'GET' });
    const verdict = describe(res.json, res.text, res.status);
    if (!verdict.ok) return verdict;
    // Balance is informational; the body is returned for the panel to show.
    return { ok: true, balance: res.json ?? res.text };
  },
};
