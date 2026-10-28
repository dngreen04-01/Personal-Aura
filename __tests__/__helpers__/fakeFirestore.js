/**
 * In-memory stand-in for the subset of firebase/firestore that lib/sync.js
 * and lib/firestoreClient.js use.
 *
 * The store lives on globalThis so it survives jest.resetModules(). That lets
 * a test write data from one "device", reset every module (including the
 * SQLite registry), and restore it on a second device. Call
 * __fake.reset() between tests.
 *
 * serverTimestamp() resolves to a Timestamp-like object on write, as real
 * Firestore does, so code that treats updatedAt as a string gets caught.
 */
const g = globalThis;
if (!g.__fakeFirestore) {
  g.__fakeFirestore = { docs: new Map(), listeners: [], failures: [], writes: [], autoId: 0 };
}
const S = g.__fakeFirestore;

class Timestamp {
  constructor(date) { this._date = date; this.seconds = Math.floor(date.getTime() / 1000); this.nanoseconds = 0; }
  toDate() { return new Date(this._date); }
}
const SERVER_TS = Symbol('serverTimestamp');

const splitPath = (segs) => segs.flatMap((s) => String(s).split('/')).filter(Boolean);

function doc(parent, ...segs) {
  if (parent && parent.type === 'collection' && segs.length === 0) {
    S.autoId += 1;
    const id = `auto${S.autoId}`;
    return { type: 'doc', path: `${parent.path}/${id}`, id };
  }
  const parts = splitPath(segs);
  return { type: 'doc', path: parts.join('/'), id: parts[parts.length - 1] };
}
function collection(_db, ...segs) {
  return { type: 'collection', path: splitPath(segs).join('/') };
}
const where = (field, op, value) => ({ kind: 'where', field, op, value });
const orderBy = (field, dir = 'asc') => ({ kind: 'orderBy', field, dir });
const limit = (n) => ({ kind: 'limit', n });
function query(ref, ...constraints) {
  return { type: 'query', path: ref.path, constraints: [...(ref.constraints || []), ...constraints] };
}
const serverTimestamp = () => SERVER_TS;

function maybeFail(op, path) {
  const i = S.failures.findIndex((f) => (f.op === op || f.op === '*') && (!f.path || f.path.test(path)));
  if (i === -1) return;
  const f = S.failures[i];
  if (f.times !== Infinity) {
    f.times -= 1;
    if (f.times <= 0) S.failures.splice(i, 1);
  }
  throw new Error(f.message || `fake ${op} failure`);
}

function resolveTimestamps(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) out[k] = v === SERVER_TS ? new Timestamp(new Date()) : v;
  return out;
}

function childrenOf(path) {
  const depth = path.split('/').length + 1;
  const rows = [];
  for (const [p, data] of S.docs) {
    if (p.startsWith(`${path}/`) && p.split('/').length === depth) rows.push({ id: p.split('/').pop(), path: p, data });
  }
  return rows;
}

function compare(a, b) {
  const av = a instanceof Timestamp ? a.toDate().toISOString() : a;
  const bv = b instanceof Timestamp ? b.toDate().toISOString() : b;
  return av < bv ? -1 : av > bv ? 1 : 0;
}

function runQuery(q) {
  let rows = childrenOf(q.path);
  for (const c of q.constraints || []) {
    if (c.kind === 'where') {
      rows = rows.filter(({ data }) => {
        const v = data[c.field];
        if (v === undefined) return false;
        switch (c.op) {
          case '==': return v === c.value;
          case '>=': return compare(v, c.value) >= 0;
          case '<=': return compare(v, c.value) <= 0;
          case '>': return compare(v, c.value) > 0;
          case '<': return compare(v, c.value) < 0;
          default: throw new Error(`fake firestore: unsupported op ${c.op}`);
        }
      });
    }
  }
  for (const c of q.constraints || []) {
    if (c.kind === 'orderBy') {
      rows = rows.filter(({ data }) => data[c.field] !== undefined);
      rows.sort((a, b) => compare(a.data[c.field], b.data[c.field]) * (c.dir === 'desc' ? -1 : 1));
    }
  }
  const lim = (q.constraints || []).find((c) => c.kind === 'limit');
  if (lim) rows = rows.slice(0, lim.n);
  return rows;
}

const docSnap = (path, data) => ({
  id: path.split('/').pop(),
  exists: () => data !== undefined,
  data: () => (data === undefined ? undefined : { ...data }),
});
const querySnap = (rows) => ({
  empty: rows.length === 0,
  docs: rows.map((r) => docSnap(r.path, r.data)),
});

function notify() {
  for (const l of S.listeners) {
    if (l.ref.type === 'doc') l.next(docSnap(l.ref.path, S.docs.get(l.ref.path)));
    else l.next(querySnap(runQuery(l.ref)));
  }
}

async function getDoc(ref) {
  maybeFail('getDoc', ref.path);
  return docSnap(ref.path, S.docs.get(ref.path));
}
async function getDocs(q) {
  maybeFail('getDocs', q.path);
  return querySnap(runQuery(q.type === 'query' ? q : { ...q, constraints: [] }));
}
async function setDoc(ref, data, opts = {}) {
  maybeFail('setDoc', ref.path);
  const resolved = resolveTimestamps(data);
  const next = opts.merge ? { ...(S.docs.get(ref.path) || {}), ...resolved } : resolved;
  S.docs.set(ref.path, next);
  S.writes.push({ op: 'set', path: ref.path, data: resolved });
  notify();
}
async function updateDoc(ref, data) {
  maybeFail('updateDoc', ref.path);
  if (!S.docs.has(ref.path)) throw new Error(`No document to update: ${ref.path}`);
  const resolved = resolveTimestamps(data);
  S.docs.set(ref.path, { ...S.docs.get(ref.path), ...resolved });
  S.writes.push({ op: 'update', path: ref.path, data: resolved });
  notify();
}
async function deleteDoc(ref) {
  maybeFail('deleteDoc', ref.path);
  S.docs.delete(ref.path);
  S.writes.push({ op: 'delete', path: ref.path });
  notify();
}
function onSnapshot(ref, next, error) {
  const l = { ref, next, error };
  S.listeners.push(l);
  return () => { S.listeners = S.listeners.filter((x) => x !== l); };
}
function writeBatch() {
  const ops = [];
  return {
    set: (ref, data, opts) => ops.push(() => setDoc(ref, data, opts)),
    update: (ref, data) => ops.push(() => updateDoc(ref, data)),
    delete: (ref) => ops.push(() => deleteDoc(ref)),
    commit: async () => { for (const op of ops) await op(); },
  };
}

module.exports = {
  doc, collection, query, where, orderBy, limit,
  getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch,
  serverTimestamp, Timestamp,
  __fake: {
    state: S,
    Timestamp,
    get: (path) => S.docs.get(path),
    put: (path, data) => { S.docs.set(path, data); },
    paths: () => [...S.docs.keys()],
    // fail(op, { path: /regex/, times: n, message }) — op is a function name or '*'
    fail: (op, { path, times = 1, message } = {}) => { S.failures.push({ op, path, times, message }); },
    listenerCount: () => S.listeners.length,
    reset: () => { S.docs.clear(); S.listeners = []; S.failures = []; S.writes = []; S.autoId = 0; },
  },
};
