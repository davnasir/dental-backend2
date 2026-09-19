import prisma from './prisma.js';

const MODEL_MAP = {
  category: 'category',
  auditlog: 'auditLog',
};

const model = (table) => prisma[MODEL_MAP[table] || table];

export const insert = async (table, data) => {
  const row = await model(table).create({ data });
  return row.id;
};

export const updateById = async (table, id, data) => {
  await model(table).update({ where: { id }, data });
  return 1;
};

export const deleteById = async (table, id) => {
  const r = await model(table).delete({ where: { id } });
  return r ? 1 : 0;
};

export const query = async () => {
  throw new Error('Raw SQL queries are no longer supported after the MongoDB migration.');
};

export const queryOne = async () => {
  throw new Error('Raw SQL queries are no longer supported after the MongoDB migration.');
};

export const withTransaction = async (fn) => fn({
  query,
  queryOne,
  insert,
  updateById,
  deleteById,
});

export const parseJson = (value, fallback = null) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
};

export const toJson = (value) => value;

export default prisma;
