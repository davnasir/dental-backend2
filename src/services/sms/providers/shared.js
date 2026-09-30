// Helpers shared by the SMS provider drivers.
//
// Bangladeshi aggregators agree on almost nothing except that they accept a
// phone number and a message over HTTP. The two things they disagree about --
// where the credentials go and whether a 200 actually means "sent" -- are
// handled here so each driver stays a thin description of its own API.

import { config } from '../../../config/index.js';

export const readBody = async (res) => {
  const text = await res.text().catch(() => '');
  if (!text) return { text: '', json: null };
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
};

// A gateway replying 200 does not mean the message went out: rejected numbers,
// expired sender IDs and empty balances are routinely reported in the body of a
// successful HTTP response. So the body is scanned for failure markers before
// the send is reported as delivered. Tune the marker list with
// SMS_FAIL_KEYWORDS if a provider uses vocabulary that trips this.
export const classifyResponse = ({ status, text }) => {
  if (status < 200 || status >= 300) {
    return { ok: false, reason: `http_${status}` };
  }
  const haystack = String(text).toLowerCase();
  const hit = config.sms.failKeywords.find((keyword) => keyword && haystack.includes(keyword));
  if (hit) return { ok: false, reason: `body_reported_failure:${hit}` };
  return { ok: true };
};

// Gateways name the delivery reference differently; try the common ones so the
// id can be logged and matched against the provider's own delivery report.
export const pickMessageId = (json) => {
  if (!json || typeof json !== 'object') return null;
  const candidates = ['message_id', 'messageId', 'msgid', 'sms_id', 'smsId', 'id', 'reference', 'ref'];
  for (const key of candidates) {
    if (json[key] !== undefined && json[key] !== null) return json[key];
  }
  const data = json.data;
  if (data && typeof data === 'object') {
    for (const key of candidates) {
      if (data[key] !== undefined && data[key] !== null) return data[key];
    }
  }
  return null;
};

export const encodeBody = (params, contentType) => {
  if (contentType === 'form') {
    return {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    };
  }
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  };
};

// One place for the timeout so a hung gateway can never delay a booking
// response indefinitely.
export const request = async ({ url, method = 'POST', headers = {}, body }) => {
  const res = await fetch(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(config.sms.timeoutMs),
  });
  const { text, json } = await readBody(res);
  return { status: res.status, text, json, ...classifyResponse({ status: res.status, text }) };
};
