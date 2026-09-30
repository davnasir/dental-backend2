// No-network driver. The default, so the app runs out of the box with no
// credentials and no accidental spend on a real gateway. It logs the exact
// message that would have been sent, which also makes it the easiest way to
// sanity-check templates before pointing the app at a paid provider.

export default {
  name: 'mock',

  isConfigured: () => true,

  send: async ({ to, message }) => {
    // eslint-disable-next-line no-console
    console.log(`[SMS:mock] to=${to} :: ${message}`);
    return { ok: true, reason: 'mock', providerMessageId: null };
  },
};
