// SSL Wireless -- a widely used Bangladeshi aggregator, shipped as a dedicated
// driver so it works with nothing but an API secret.
//
//   SMS_PROVIDER=sslwireless
//   SMS_API_SECRET=xxxx   (Service type + API secret from the SSL Wireless panel)
//   SMS_SENDER_ID=NaholDental  (optional; only needed on approved routes)
//
// It also accepts the other aggregators' credentials unchanged, because SSL
// Wireless uses the same api_secret/api_key vocabulary.

import { request, pickMessageId } from './shared.js';
import { config } from '../../../config/index.js';

const ENDPOINT = 'https://sms.sslwireless.com/api/sms';

export default {
  name: 'sslwireless',

  isConfigured: (settings) => Boolean(settings?.apiSecret || settings?.apiKey),

  send: async ({ to, message, settings }) => {
    const s = config.sms.sslwireless;
    const params = {
      service_type: s.serviceType,
      route: s.route,
      // Already normalized to 8801XXXXXXXXX, which is the format SSL Wireless
      // expects (country code, no plus sign).
      number: to,
      msg: message,
    };
    if (settings.apiSecret) params.api_secret = settings.apiSecret;
    if (settings.apiKey) params.api_key = settings.apiKey;
    if (settings.senderId) params.sender_id = settings.senderId;

    const result = await request({
      url: settings.endpoint || ENDPOINT,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return { ...result, providerMessageId: pickMessageId(result.json) };
  },
};
