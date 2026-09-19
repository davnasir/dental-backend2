import { insert, toJson } from '../config/db.js';
import { getClientIp } from '../utils/getClientIp.js';

export { getClientIp };

export const logAudit = async ({ userId = null, action, entity, entityId = null, metadata = null, ip = null }) => {
  try {
    await insert('auditlog', {
      userId: userId ?? null,
      action,
      entity,
      entityId: String(entityId ?? ''),
      metadata: toJson(metadata),
      ip,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Audit Log Error]', err.message);
  }
};
