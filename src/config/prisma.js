import { MongoClient } from 'mongodb';
import { config } from './index.js';

const uri = config.databaseUrl || process.env.MONGODB_URI;
if (!uri || !/^mongodb(\+srv)?:\/\//i.test(uri)) {
  throw new Error('MongoDB DATABASE_URL is required (example: mongodb://127.0.0.1:27017/dental_clinic)');
}

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
});
let dbPromise;

const getDb = async () => {
  if (!dbPromise) {
    dbPromise = client.connect().then(async (c) => {
      const dbName = c.db().databaseName || 'dental_clinic';
      const db = c.db(dbName);
      const indexes = [
        ['user','email'],['user','phone'],['accessToken','token'],['passwordReset','token'],
        ['patient','patientId'],['patient','phone'],['doctor','email'],['category','key'],
        ['service','slug'],['appointment','appointmentNumber'],['invoice','invoiceNumber'],
        ['ipBlock','ip'],['blog','slug'],['dentalRecord',['patientId','toothNumber']],['setting','key']
      ];
      await Promise.all(indexes.map(async ([model, field]) => {
        const key = Array.isArray(field) ? Object.fromEntries(field.map(x=>[x,1])) : {[field]:1};
        try { await db.collection(COLLECTIONS[model]).createIndex(key, { unique:true, sparse:true }); } catch {}
      }));
      return db;
    }).catch((err) => {
      console.error('[MongoDB] Connection failed:', err.message);
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
};

const RELATIONS = {
  user: {
    auditLogs: ['auditLog', 'userId', 'id', true],
    notifications: ['notification', 'userId', 'id', true],
    accessTokens: ['accessToken', 'userId', 'id', true],
    receivedPayments: ['payment', 'receivedById', 'id', true],
    passwordResets: ['passwordReset', 'userId', 'id', true],
    createdPatients: ['patient', 'createdById', 'id', true],
    updatedPatients: ['patient', 'updatedById', 'id', true],
    ipBlocks: ['ipBlock', 'createdById', 'id', true],
  },
  accessToken: { user: ['user', 'id', 'userId', false] },
  passwordReset: { user: ['user', 'id', 'userId', false] },
  patient: {
    createdBy: ['user', 'id', 'createdById', false],
    updatedBy: ['user', 'id', 'updatedById', false],
    appointments: ['appointment', 'patientId', 'id', true],
    treatments: ['treatmentRecord', 'patientId', 'id', true],
    prescriptions: ['prescription', 'patientId', 'id', true],
    invoices: ['invoice', 'patientId', 'id', true],
    payments: ['payment', 'patientId', 'id', true],
    dentalRecords: ['dentalRecord', 'patientId', 'id', true],
  },
  doctor: {
    appointments: ['appointment', 'doctorId', 'id', true],
    treatments: ['treatmentRecord', 'doctorId', 'id', true],
    prescriptions: ['prescription', 'doctorId', 'id', true],
  },
  category: {
    services: ['service', 'categoryKey', 'key', true],
  },
  service: {
    categoryRef: ['category', 'key', 'categoryKey', false],
    appointments: ['appointment', 'serviceId', 'id', true],
  },
  chamber: {
    appointments: ['appointment', 'chamberId', 'id', true],
  },
  appointment: {
    patient: ['patient', 'id', 'patientId', false],
    doctor: ['doctor', 'id', 'doctorId', false],
    service: ['service', 'id', 'serviceId', false],
    chamber: ['chamber', 'id', 'chamberId', false],
    treatments: ['treatmentRecord', 'appointmentId', 'id', true],
    invoice: ['invoice', 'appointmentId', 'id', false],
  },
  ipBlock: { createdBy: ['user', 'id', 'createdById', false] },
  treatmentRecord: {
    patient: ['patient', 'id', 'patientId', false],
    doctor: ['doctor', 'id', 'doctorId', false],
    appointment: ['appointment', 'id', 'appointmentId', false],
  },
  prescription: {
    patient: ['patient', 'id', 'patientId', false],
    doctor: ['doctor', 'id', 'doctorId', false],
  },
  dentalRecord: { patient: ['patient', 'id', 'patientId', false] },
  invoice: {
    patient: ['patient', 'id', 'patientId', false],
    appointment: ['appointment', 'id', 'appointmentId', false],
    payments: ['payment', 'invoiceId', 'id', true],
  },
  payment: {
    invoice: ['invoice', 'id', 'invoiceId', false],
    patient: ['patient', 'id', 'patientId', false],
    receivedBy: ['user', 'id', 'receivedById', false],
  },
  notification: { user: ['user', 'id', 'userId', false] },
  auditLog: { user: ['user', 'id', 'userId', false] },
  setting: {},
};

const DEFAULTS = {
  user: { role:'STAFF', status:'ACTIVE', loginAttempts:0 },
  doctor: { consultationFee:0, status:'ACTIVE', sortOrder:0 },
  category: { name:{}, status:'ACTIVE', sortOrder:0 },
  service: { name:{}, priceMin:0, priceMax:0, status:'ACTIVE', sortOrder:0 },
  chamber: { status:'ACTIVE', sortOrder:0 },
  reel: { title:{}, status:'ACTIVE', sortOrder:0 },
  appointment: { status:'PENDING', publicBooking:false },
  patient: { isArchived:false },
  invoice: { subtotal:0, discount:0, tax:0, total:0, paid:0, due:0, paymentStatus:'UNPAID' },
  dentalRecord: { status:'HEALTHY' },
  notification: { state:'UNREAD' },
  faq: { question:{}, answer:{}, status:'ACTIVE', sortOrder:0 },
  review: { rating:5, status:'PENDING', sortOrder:0 },
  galleryItem: { title:{}, sortOrder:0, status:'ACTIVE' },
  blog: { status:'DRAFT' },
  setting: { value:{} },
  payment: { method:'CASH' },
};
const modelNames = new Set([
  'user','accessToken','passwordReset','patient','doctor','category','service','chamber','reel',
  'appointment','ipBlock','treatmentRecord','prescription','dentalRecord','invoice','payment',
  'blog','faq','review','galleryItem','notification','auditLog','setting'
]);

const COLLECTIONS = Object.fromEntries([...modelNames].map((m) => [m, m]));

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

const clone = (v) => {
  if (v instanceof Date) return new Date(v);
  if (Array.isArray(v)) return v.map(clone);
  if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k,x]) => [k,clone(x)]));
  return v;
};

const normalizeId = (v) => {
  if (v === null || v === undefined) return v;
  if (typeof v === 'number') {
    return Number.isNaN(v) ? 0 : v;
  }
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return Number(v);
  return v;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Recursively remove undefined values (and drop NaN numbers) so MongoDB's BSON
// serializer never throws on request bodies that contain missing fields.
const sanitize = (v, seen = new Set()) => {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (Array.isArray(v)) return v.map((x) => sanitize(x, seen));
  if (isPlainObject(v)) {
    if (seen.has(v)) return undefined;
    seen.add(v);
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      const cleaned = sanitize(x, seen);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return v;
};

const prismaError = (code, message) => Object.assign(new Error(message), { code });

async function nextId(db, model) {
  // MongoDB driver v7 returns the updated document directly (not { value, ok }).
  // Handle both shapes so this works across driver versions.
  const r = await db.collection('_counters').findOneAndUpdate(
    { _id: model },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const counter = r && r.value !== undefined ? r.value : r;
  return counter?.seq ?? 1;
}

function scalarCondition(value, condition) {
  if (!isPlainObject(condition) || condition instanceof Date) return { $eq: normalizeId(condition) };
  // Prisma JSON filter style for embedded (localized) fields:
  //   { SOME_FIELD: { path: ['en'], string_contains: 'search' } }
  // produces a dotted-path filter like { 'name.en': { $regex: ... } }.
  const path = Array.isArray(condition.path) && condition.path.length
    ? condition.path.map(String).join('.')
    : null;
  const out = {};
  for (const [op, raw] of Object.entries(condition)) {
    if (op === 'path' || op === 'mode') continue;
    const v = Array.isArray(raw) ? raw.map(normalizeId) : normalizeId(raw);
    if (op === 'equals') out.$eq = v;
    else if (op === 'not') out.$ne = v;
    else if (op === 'in') out.$in = v;
    else if (op === 'notIn') out.$nin = v;
    else if (op === 'gt') out.$gt = v;
    else if (op === 'gte') out.$gte = v;
    else if (op === 'lt') out.$lt = v;
    else if (op === 'lte') out.$lte = v;
    else if (op === 'contains' || op === 'string_contains') out.$regex = escapeRegex(raw);
    else if (op === 'startsWith' || op === 'string_starts_with') out.$regex = `^${escapeRegex(raw)}`;
    else if (op === 'endsWith' || op === 'string_ends_with') out.$regex = `${escapeRegex(raw)}$`;
  }
  if (out.$regex !== undefined) out.$options = 'i';
  return path ? { [path]: out } : out;
}

async function buildFilter(db, model, where = {}) {
  if (!where || Object.keys(where).length === 0) return {};
  const out = {};
  const and = [];
  for (const [key, value] of Object.entries(where)) {
    if (key === 'OR') {
      and.push({ $or: await Promise.all(value.map((x) => buildFilter(db, model, x))) });
      continue;
    }
    if (key === 'AND') {
      and.push({ $and: await Promise.all(value.map((x) => buildFilter(db, model, x))) });
      continue;
    }
    if (key === 'NOT') {
      const list = Array.isArray(value) ? value : [value];
      and.push({ $nor: await Promise.all(list.map((x) => buildFilter(db, model, x))) });
      continue;
    }

    const rel = RELATIONS[model]?.[key];
    if (rel && isPlainObject(value)) {
      // RELATIONS entries are Prisma-style: [target, fieldOnTarget, fieldOnLocalDoc, many].
      //   appointment.patient -> ['patient', 'id', 'patientId', false]
      // means: filter target by { id: appointment.patientId }.
      const [target, targetField, localField, many] = rel;
      const condition = value.some !== undefined ? value.some : value.is !== undefined ? value.is : value.isNot !== undefined ? value.isNot : value;
      if (condition === null || condition === undefined) {
        and.push({ [localField]: null });
      } else {
        const targetFilter = await buildFilter(db, target, condition);
        const ids = await db
          .collection(COLLECTIONS[target])
          .find(targetFilter)
          .project({ [targetField]: 1 })
          .toArray();
        const vals = ids.map((x) => x[targetField]).filter((x) => x !== undefined);
        and.push({ [localField]: value.isNot !== undefined ? { $nin: vals } : { $in: vals } });
      }
      continue;
    }
    const scalar = scalarCondition(value, value);
    const keys = Object.keys(scalar);
    if (keys.length === 0) {
      out[key] = { $exists: true };
    } else if (keys.length === 1 && !keys[0].startsWith('$')) {
      // Nested (localized field) filter: { name: { en: { $regex: ... } } } -> 'name.en'
      out[`${key}.${keys[0]}`] = scalar[keys[0]];
    } else {
      out[key] = scalar;
    }
  }
  if (and.length) out.$and = [...(out.$and || []), ...and];
  // Convert Prisma date equality / numeric IDs where supplied directly.
  for (const [k,v] of Object.entries(out)) {
    if (k.startsWith('$')) continue;
    if (v?.$eq !== undefined) out[k].$eq = normalizeId(v.$eq);
  }
  return out;
}

const stripInternal = (doc) => {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
};

function applySelect(doc, select) {
  if (!select) return doc;
  const out = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled === true && doc[key] !== undefined) out[key] = doc[key];
  }
  return out;
}

async function resolveRelation(db, model, doc, key, spec = {}) {
  const rel = RELATIONS[model]?.[key];
  if (!rel) return undefined;
  // RELATIONS entries are Prisma-style: [target, fieldOnTarget, fieldOnLocalDoc, many].
  const [target, targetField, localField, many] = rel;
  const localValue = doc[localField];
  if (!many && (localValue === null || localValue === undefined)) return null;
  if (localValue === null || localValue === undefined) return many ? [] : null;
  const extra = spec && spec.where ? await buildFilter(db, target, spec.where) : {};
  const filter = { ...extra, [targetField]: localValue };
  let rows = await db.collection(COLLECTIONS[target]).find(filter).toArray();
  sortDocs(rows, spec?.orderBy);
  if (spec?.skip) rows = rows.slice(Number(spec.skip));
  if (spec?.take !== undefined) rows = rows.slice(0, Number(spec.take));
  if (many) return Promise.all(rows.map((r) => materialize(db, target, r, spec)));
  return rows[0] ? materialize(db, target, rows[0], spec) : null;
}

async function materialize(db, model, raw, args = {}) {
  if (!raw) return null;
  let doc = stripInternal(raw);
  const include = args.include || {};
  const select = args.select;
  if (select) {
    const base = applySelect(doc, select);
    for (const [key, spec] of Object.entries(select)) {
      if (isPlainObject(spec) && RELATIONS[model]?.[key]) base[key] = await resolveRelation(db, model, raw, key, spec);
    }
    doc = base;
  }
  for (const [key, spec] of Object.entries(include)) {
    if (key === '_count') {
      // Prisma _count include: count related documents per requested field.
      const counts = {};
      const selectMap = spec === true ? null : (spec && spec.select) || null;
      const countFields = selectMap ? Object.keys(selectMap) : Object.keys(RELATIONS[model] || {});
      for (const field of countFields) {
        const rel = RELATIONS[model]?.[field];
        if (!rel) continue;
        const [target, targetField, localField] = rel;
        counts[field] = await db
          .collection(COLLECTIONS[target])
          .countDocuments({ [targetField]: raw[localField] });
      }
      doc._count = counts;
      continue;
    }
    doc[key] = await resolveRelation(db, model, raw, key, spec === true ? {} : spec);
  }
  return doc;
}

function sortDocs(docs, orderBy = []) {
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return docs.sort((a,b) => {
    for (const ord of orders) {
      if (!ord) continue;
      const [field, direction] = Object.entries(ord)[0];
      const av=a[field], bv=b[field];
      if (av === bv) continue;
      if (av === undefined || av === null) return direction === 'desc' ? 1 : -1;
      if (bv === undefined || bv === null) return direction === 'desc' ? -1 : 1;
      const cmp = av > bv ? 1 : -1;
      return direction === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

async function uniqueFilter(db, model, where) {
  const flat = {};
  for (const [k,v] of Object.entries(where || {})) {
    if (isPlainObject(v) && (k.includes('_') || ['patientId_toothNumber'].includes(k))) {
      Object.assign(flat, v);
    } else flat[k] = v;
  }
  return buildFilter(db, model, flat);
}

async function runCreate(db, model, args) {
  const data = sanitize(clone(args.data || {}));
  const id = data.id ?? await nextId(db, model);
  const now = new Date();
  const doc = { ...(DEFAULTS[model] || {}), ...data, id, createdAt: data.createdAt ?? now, updatedAt: data.updatedAt ?? now };
  try {
    await db.collection(COLLECTIONS[model]).insertOne(doc);
  } catch (e) {
    if (e?.code === 11000) throw prismaError('P2002', 'Unique constraint failed');
    throw e;
  }
  return materialize(db, model, doc, args);
}

function makeModel(model, db) {
  return {
    async findUnique(args={}) {
      const filter = await uniqueFilter(db, model, args.where || {});
      const doc = await db.collection(COLLECTIONS[model]).findOne(filter);
      return materialize(db, model, doc, args);
    },
    async findFirst(args={}) {
      const filter = await buildFilter(db, model, args.where || {});
      let docs = await db.collection(COLLECTIONS[model]).find(filter).toArray();
      sortDocs(docs, args.orderBy);
      return docs[0] ? materialize(db, model, docs[0], args) : null;
    },
    async findMany(args={}) {
      const filter = await buildFilter(db, model, args.where || {});
      let docs = await db.collection(COLLECTIONS[model]).find(filter).toArray();
      sortDocs(docs, args.orderBy);
      const skip = Number(args.skip || 0);
      const take = args.take === undefined ? docs.length : Number(args.take);
      docs = docs.slice(skip, skip + take);
      return Promise.all(docs.map((d) => materialize(db, model, d, args)));
    },
    async count(args={}) {
      return db.collection(COLLECTIONS[model]).countDocuments(await buildFilter(db, model, args.where || {}));
    },
    async create(args={}) { return runCreate(db, model, args); },
    async createMany(args={}) {
      const data = args.data || [];
      let count=0;
      for (const item of data) { await runCreate(db, model, { data:item }); count++; }
      return { count };
    },
    async update(args={}) {
      const filter = await uniqueFilter(db, model, args.where || {});
      const existing = await db.collection(COLLECTIONS[model]).findOne(filter);
      if (!existing) throw prismaError('P2025', `${model} not found`);
      const data = sanitize(clone(args.data || {}));
      delete data.id;
      data.updatedAt = new Date();
      try {
        await db.collection(COLLECTIONS[model]).updateOne({ _id: existing._id }, { $set: data });
      } catch (e) {
        if (e?.code === 11000) throw prismaError('P2002', 'Unique constraint failed');
        throw e;
      }
      const doc = await db.collection(COLLECTIONS[model]).findOne({ _id: existing._id });
      return materialize(db, model, doc, args);
    },
    async updateMany(args={}) {
      const filter = await buildFilter(db, model, args.where || {});
      const data = sanitize(clone(args.data || {}));
      data.updatedAt = new Date();
      const r = await db.collection(COLLECTIONS[model]).updateMany(filter, { $set: data });
      return { count: r.modifiedCount };
    },
    async delete(args={}) {
      const filter = await uniqueFilter(db, model, args.where || {});
      // Driver v7 returns the deleted document directly; older drivers return { value }.
      const r = await db.collection(COLLECTIONS[model]).findOneAndDelete(filter);
      const deleted = r && r.value !== undefined ? r.value : r;
      if (!deleted) throw prismaError('P2025', `${model} not found`);
      return materialize(db, model, deleted, args);
    },
    async deleteMany(args={}) {
      const r = await db.collection(COLLECTIONS[model]).deleteMany(await buildFilter(db, model, args.where || {}));
      return { count: r.deletedCount };
    },
    async upsert(args={}) {
      const filter = await uniqueFilter(db, model, args.where || {});
      const existing = await db.collection(COLLECTIONS[model]).findOne(filter);
      if (existing) return this.update({ where: args.where, data: args.update || {}, include: args.include, select: args.select });
      return runCreate(db, model, { data: args.create || {}, include: args.include, select: args.select });
    },
    async aggregate(args={}) {
      const filter = await buildFilter(db, model, args.where || {});
      const docs = await db.collection(COLLECTIONS[model]).find(filter).toArray();
      const out = {};
      if (args._sum) {
        out._sum = {};
        for (const field of Object.keys(args._sum)) {
          out._sum[field] = docs.reduce((s,d) => s + (Number(d[field]) || 0), 0);
        }
      }
      if (args._count) {
        out._count = {};
        for (const field of Object.keys(args._count)) out._count[field] = docs.filter((d)=>d[field] != null).length;
      }
      return out;
    },
    async groupBy(args={}) {
      const docs = await db.collection(COLLECTIONS[model]).find(await buildFilter(db, model, args.where || {})).toArray();
      const fields = args.by || [];
      const groups = new Map();
      for (const d of docs) {
        const key = JSON.stringify(fields.map((f)=>d[f]));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(d);
      }
      return [...groups.values()].map(rows => {
        const o = {};
        fields.forEach((f)=>{o[f]=rows[0][f];});
        if (args._count) {
          o._count = {};
          if (args._count._all) o._count._all = rows.length;
          for (const f of Object.keys(args._count)) if (f !== '_all') o._count[f]=rows.filter(r=>r[f]!=null).length;
        }
        return o;
      });
    }
  };
}

// Cache model proxies after first access because getDb() is async.
const modelCache = {};
const handler = {
  get(_t, prop) {
    if (prop === 'default') return proxy;
    if (prop === '$connect') return async () => { await getDb(); };
    if (prop === '$disconnect') return async () => { await client.close(); };
    if (prop === '$transaction') return async (arg) => Array.isArray(arg) ? Promise.all(arg) : arg(proxy);
    if (!modelNames.has(prop)) return undefined;
    if (!modelCache[prop]) {
      modelCache[prop] = new Proxy({}, {
        get(_m, method) {
          return async (...args) => {
            try {
              const db = await getDb();
              const m = makeModel(prop, db);
              if (typeof m[method] !== 'function') throw new Error(`Unsupported MongoDB ORM operation: ${prop}.${String(method)}`);
              return m[method](...args);
            } catch (err) {
              console.error(`[MongoDB] Error in ${prop}.${String(method)}:`, err.message);
              throw err;
            }
          };
        }
      });
    }
    return modelCache[prop];
  }
};
const proxy = new Proxy({}, handler);
export default proxy;
