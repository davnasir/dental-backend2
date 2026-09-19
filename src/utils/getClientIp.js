// Extract the most reliable client IP and normalize it for storage/display.
//
// Express is configured with `trust proxy = 1`, so `req.ip` already reflects
// the originating client when the app runs behind a reverse proxy / CDN.
// When there is no proxy (local development), `req.ip` is the raw socket
// address, which may legitimately be loopback (e.g. `::1`) or IPv4-mapped
// (`::ffff:127.0.0.1`). We normalize the value but never fabricate an IP.
const normalizeIp = (ip) => {
  if (!ip) return null;
  let value = String(ip).trim();
  // node/Express often report IPv4 addresses as IPv4-mapped IPv6.
  if (value.startsWith('::ffff:')) value = value.slice(7);
  return value || null;
};

export const getClientIp = (req) => {
  const candidate = req.ip || req.socket?.remoteAddress || null;
  return normalizeIp(candidate);
};
