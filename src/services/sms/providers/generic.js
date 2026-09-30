// Field-mapped HTTP driver -- the one that makes this work with any provider.
//
// Nearly every BD aggregator (Aatroz, MIMSMS, Sender646, Alpha SMS, SMSMan,
// BulkSMSBD, ...) exposes a single POST endpoint that takes a number, a message
// and a couple of credential fields, and differs only in what those fields are
// called and where the credentials sit. Those names are env vars, so switching
// provider is a .env change rather than a code change.
//
//   SMS_PROVIDER=generic
//   SMS_ENDPOINT=https://api.example.com/send
//   SMS_CONTENT_TYPE=form            # or json
//   SMS_NUMBER_FIELD=mobile_number
//   SMS_MESSAGE_FIELD=msg
//   SMS_AUTH_STYLE=body              # body | query | header | bearer | none
//   SMS_API_KEY_FIELD=api_key
//   SMS_API_SECRET_FIELD=api_secret
//   SMS_SENDER_ID_FIELD=sender_id

import { request, encodeBody, pickMessageId } from './shared.js';
import { config } from '../../../config/index.js';

// Field names stay in .env because this driver exists to adapt to gateways we
// have not seen; they are not part of the operator-facing configuration.
const g = () => config.sms.generic;

const buildParams = ({ to, message, settings }) => {
  const params = { [g().numberField]: to, [g().messageField]: message };
  if (settings.apiKey) params[g().apiKeyField] = settings.apiKey;
  if (settings.apiSecret) params[g().apiSecretField] = settings.apiSecret;
  if (settings.senderId) params[g().senderIdField] = settings.senderId;
  return params;
};

export default {
  name: 'generic',

  isConfigured: (settings) => Boolean(settings?.endpoint),

  send: async ({ to, message, settings }) => {
    const field = g();
    if (!settings.endpoint) throw new Error('SMS_ENDPOINT is not set for the generic provider');

    const params = buildParams({ to, message, settings });
    const headers = {};

    // Credentials move out of the payload and into wherever the provider wants
    // them; the number and message always stay in the body/query.
    if (field.authStyle === 'bearer' && settings.apiKey) {
      headers[field.headerName] = `Bearer ${settings.apiKey}`;
      delete params[field.apiKeyField];
    } else if (field.authStyle === 'header' && settings.apiKey) {
      headers[field.headerName] = settings.apiKey;
      delete params[field.apiKeyField];
    }

    if (field.authStyle === 'query') {
      const query = new URLSearchParams(params).toString();
      const sep = settings.endpoint.includes('?') ? '&' : '?';
      const result = await request({ url: `${settings.endpoint}${sep}${query}`, method: field.method, headers });
      return { ...result, providerMessageId: pickMessageId(result.json) };
    }

    const encoded = encodeBody(params, field.contentType);
    const result = await request({
      url: settings.endpoint,
      method: field.method,
      headers: { ...headers, ...encoded.headers },
      body: encoded.body,
    });
    return { ...result, providerMessageId: pickMessageId(result.json) };
  },
};
