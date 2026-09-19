import {
  listPublicServices,
  listAdminServices,
  createService,
  updateService,
  deleteService,
  reorderServices,
} from '../services/service.service.js';
import { successResponse } from '../utils/apiResponse.js';
import { logAudit, getClientIp } from '../services/auditLog.service.js';
import { toUploadUrl } from '../utils/uploadUrl.js';

export const getPublicServices = async (req, res) => {
  const { category, search, lang } = req.query;
  const data = await listPublicServices({ category, search, lang });
  return successResponse(res, 200, 'Services fetched', { items: data });
};

export const getPublicServiceBySlug = async (req, res) => {
  const prisma = (await import('../config/prisma.js')).default;
  const service = await prisma.service.findUnique({ where: { slug: req.params.slug } });
  if (!service || service.status !== 'ACTIVE') {
    return successResponse(res, 200, 'Service fetched', { item: null });
  }
  const { toPublicService } = await import('../services/service.service.js');
  return successResponse(res, 200, 'Service fetched', { item: toPublicService(service) });
};

export const getServicesAdmin = async (req, res) => {
  const data = await listAdminServices(req.query);
  return successResponse(res, 200, 'Services fetched', data);
};

export const postService = async (req, res) => {
  const service = await createService({ ...req.body, image: toUploadUrl(req.file) || req.body.image });
  await logAudit({ userId: req.user.id, action: 'SERVICE_CREATED', entity: 'Service', entityId: service.id, ip: getClientIp(req) });
  return successResponse(res, 201, 'Service created', { item: service });
};

export const putService = async (req, res) => {
  const service = await updateService(req.params.id, { ...req.body, image: toUploadUrl(req.file) || req.body.image });
  await logAudit({ userId: req.user.id, action: 'SERVICE_UPDATED', entity: 'Service', entityId: service.id, ip: getClientIp(req) });
  return successResponse(res, 200, 'Service updated', { item: service });
};

export const deleteServiceAdmin = async (req, res) => {
  const result = await deleteService(req.params.id);
  await logAudit({ userId: req.user.id, action: 'SERVICE_DELETED', entity: 'Service', entityId: req.params.id, metadata: result, ip: getClientIp(req) });
  return successResponse(res, 200, result.softDeleted ? 'Service deactivated (has appointments)' : 'Service deleted', result);
};

export const reorderServiceAdmin = async (req, res) => {
  await reorderServices(req.body.orderedIds || []);
  return successResponse(res, 200, 'Services reordered');
};