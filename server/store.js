/* ============================================================================
   Persistent storage: a durable file snapshot (one Node process), Supabase
   PostgreSQL (production default — relational tables + atomic RPC commit), or
   legacy Upstash Redis.

   Every API request runs in a transaction. Shared databases (Postgres/Redis)
   take a leased lock, reload the shared data, and atomically commit under that
   lock. A warm worker never overwrites another worker's customers, sessions,
   orders or notifications. Failed reads/writes are errors, NEVER a fallback to
   memory or /tmp. Success is never reported before the durable commit.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const { setTimeout: delay } = require('timers/promises');
const supabase = require('./supabase');

const cleanEnv = (v) => String(v || '').trim().replace(/^['"]+|['"]+$/g, '').trim();
const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const REDIS_URL = cleanEnv(process.env.UPSTASH_REDIS_REST_URL).replace(/\/+$/, '');
const REDIS_TOKEN = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
const PREFIX = process.env.REDIS_PREFIX || 'bbq:';
const STORAGE_REQUESTED = cleanEnv(process.env.STORAGE).toLowerCase();
/* الترتيب: STORAGE صريح → Supabase (لو متوصل) → Upstash (لو متوصل) →
   على السيرفرلس Supabase (فشل مقصود بدل /tmp) → ملفات محلية. */
const MODE = (STORAGE_REQUESTED === 'supabase' ? 'postgres' : STORAGE_REQUESTED)
  || (supabase.configured() ? 'postgres'
    : (REDIS_URL || REDIS_TOKEN ? 'redis' : (IS_SERVERLESS ? 'postgres' : 'file')));
const DATA_DIR = process.env.BBQ_DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.BBQ_UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const DATABASE_FILE = path.join(DATA_DIR, 'database.json');
const LOCK_KEY = PREFIX + 'transaction-lock';
const LOCK_MS = 60000;
const LOCK_WAIT_MS = 8000;

const context = new AsyncLocalStorage();
let cache = new Map();
let ready = null;
let queue = Promise.resolve();

/* ----------------------------------------------------------------------------
   مسار القراءة السريع (طلبات GET):
   - بلا قفل عالمي — القراءات ما بتعدّلش حاجة، فحرمانها من اللوك بيمنع تصافّ
     طلبات الإدارة (سبب رئيسي لارتفاع البينج): طلب شبكة واحد بدل قفل+تحميل+فك قفل.
   - القراءات المتزامية بتتشارك نفس التحميل (in-flight coalescing) عشان دفعة
     التحديث الواحدة متعملش طلبات مكررة لنفس اللقطة.
   - مفيش كاش بمدة صلاحية: كل قراءة بتجيب لقطة طازجة (عامل منفصل يشوف كتابات
     العامل التاني فورًا)، وأي فشل شبكة بيرمي خطأ صريح — مفيش fallback صامت
     لبيانات قديمة، والواجهة بتحتفظ بآخر بيانات وتعيد المحاولة.
---------------------------------------------------------------------------- */
let readInflight = null;

function readContext(data) {
  return { data, dirty: new Set(), effects: [], closed: true };
}

async function loadRemote() {
  if (MODE === 'redis') return (await loadFromRedis()).data;
  if (MODE === 'postgres') return loadFromSupabase();
  return null;
}

/** قراءة بلا قفل: لقطة طازجة في كل طلب، والقراءات المتزامنة بتتشارك تحميلًا واحدًا. */
async function read(work) {
  const parent = context.getStore();
  if (parent && !parent.closed) return work();   // جوه معاملة كتابة → نشارك لقطتها
  await init();
  let data;
  if (MODE === 'file') {
    data = loadFromDisk();                       // القرص المحلي: لقطة لحظية رخيصة، بلا طابور ولا قفل
    cache = data;
  } else {
    if (!readInflight) {
      readInflight = loadRemote().then((d) => {
        cache = d;
        readInflight = null;
        return d;
      }, (e) => { readInflight = null; throw e; });
    }
    data = await readInflight;                   // الطلبات المتزامنة بتتشارك نفس التحميل
  }
  return context.run(readContext(data), work);
}

/**
 * مسار خفيف لطلبات الصور (/api/img/:id): يتخطّى تحميل قاعدة البيانات بالكامل
 * ويجلب صف الصورة المطلوب فقط. جوه معاملة كتابة بيشارك لقطتها زي read().
 */
async function imageRead(work) {
  const parent = context.getStore();
  if (parent && !parent.closed) return work();
  await init();
  if (MODE === 'file') return read(work);   // على القرص: الكاش المحلي رخيص وأصلاً فيه الصور
  return context.run(readContext(cache), work);  // getFile هيجيب الصورة المطلوبة بطلب واحد
}

/**
 * تحميل مجموعة ناقصة داخل معاملة كتابة (لازم للصور: لم تعد تُحمّل مع كل طلب).
 * بيُستدعى قبل أي تعديل على مجموعة files في التخزين السحابي.
 */
async function ensureCollection(name) {
  const tx = context.getStore();
  if (!tx || tx.closed) throw new Error('ensureCollection must run inside a write transaction');
  if (tx.data.has(name)) return tx.data.get(name);
  let rows;
  if (MODE === 'postgres') rows = await supabase.collection(name);
  else if (MODE === 'redis') {
    const raw = await redisGet(PREFIX + name);
    rows = raw === null ? [] : collection(name, JSON.parse(raw));
  } else rows = loadFromDisk().get(name) || [];
  tx.data.set(name, collection(name, rows));
  return tx.data.get(name);
}

/** جلب صورة واحدة عند الطلب فقط (بدون تحميل كل جدول الصور). */
async function getFile(id) {
  const tx = context.getStore();
  if (tx && !tx.closed) await ensureCollection('files');
  const rows = (context.getStore()?.data || cache).get('files') || [];
  const local = rows.find((f) => f.id === id);
  if (local) return local;
  if (MODE === 'postgres') return supabase.getRow('files', id);   // null لو مش موجودة
  if (MODE === 'redis') {
    const raw = await redisGet(PREFIX + 'files');
    if (raw === null) return null;
    return JSON.parse(raw).find((f) => f.id === id) || null;
  }
  return null;
}

/** نسخة احتياطية كاملة بكل المجموعات بما فيها الصور (طلب نادر للأدمن فقط). */
async function fullBackup() {
  const tx = context.getStore();
  if (tx && !tx.closed) return Object.fromEntries(tx.data);
  await init();
  if (MODE === 'file') return Object.fromEntries(loadFromDisk());
  if (MODE === 'postgres') return Object.fromEntries(await supabase.load({ includeFiles: true }));
  return Object.fromEntries((await loadFromRedis({ includeFiles: true })).data);
}

function storageError(message, cause) {
  const e = new Error(message, { cause });
  e.code = 'STORAGE_UNAVAILABLE';
  return e;
}

function validateConfig() {
  if (!['file', 'redis', 'postgres'].includes(MODE)) throw storageError('STORAGE must be file, redis or postgres');
  if (IS_SERVERLESS && MODE !== 'postgres' && MODE !== 'redis') {
    throw storageError('Vercel requires persistent Supabase PostgreSQL (or legacy Upstash Redis); file storage and /tmp are not allowed');
  }
  if (MODE === 'postgres' && !supabase.configured()) {
    throw storageError('Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side only; never ship the service key to the browser)');
  }
  if (MODE === 'redis' && (!/^https?:\/\//i.test(REDIS_URL) || !REDIS_TOKEN)) {
    throw storageError('Configure UPSTASH_REDIS_REST_URL (REST https URL) and UPSTASH_REDIS_REST_TOKEN');
  }
}

/* Upstash reports command failures in a 200 response too: check every result. */
async function redisCmd(cmds, { timeout = 10000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${REDIS_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(cmds), signal: ac.signal,
    });
    if (!res.ok) throw new Error('Upstash HTTP ' + res.status);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length !== cmds.length) throw new Error('Invalid Upstash response');
    return rows.map((row) => {
      if (!row || row.error || !Object.prototype.hasOwnProperty.call(row, 'result')) {
        throw new Error(row?.error || 'Invalid Redis result');
      }
      return row.result;
    });
  } catch (e) {
    throw storageError('Persistent database is unavailable', e);
  } finally { clearTimeout(timer); }
}
const redisGet = async (key) => (await redisCmd([['GET', key]]))[0];

function collection(name, value) {
  if (!/^[a-z][a-z0-9_]*$/i.test(name) || !Array.isArray(value)) {
    throw storageError('Invalid database collection: ' + name);
  }
  return value;
}

function loadFromDisk() {
  const data = new Map();
  try {
    if (fs.existsSync(DATABASE_FILE)) {
      const db = JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
      if (db.version !== 1 || !db.collections || typeof db.collections !== 'object' || Array.isArray(db.collections)) {
        throw new Error('Invalid database snapshot');
      }
      for (const [name, rows] of Object.entries(db.collections)) data.set(name, collection(name, rows));
    } else {
      /* Non-destructive migration from the old per-collection JSON files. */
      for (const file of fs.readdirSync(DATA_DIR)) {
        if (!file.endsWith('.json')) continue;
        const name = file.slice(0, -5);
        data.set(name, collection(name, JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'))));
      }
    }
    return data;
  } catch (e) {
    throw storageError('Cannot read database. Restore a backup; corrupt data will not be erased or reseeded.', e);
  }
}

async function loadFromRedis({ includeFiles = false } = {}) {
  const data = new Map();
  let names = [];
  try {
    const manifest = await redisGet(PREFIX + 'collections');
    names = manifest === null ? [] : JSON.parse(manifest);
    if (!Array.isArray(names) || names.some((n) => typeof n !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(n))) {
      throw new Error('Invalid Redis collection manifest');
    }
    const wanted = names.filter((name) => includeFiles || name !== 'files');
    if (wanted.length) {
      const values = await redisCmd(wanted.map((name) => ['GET', PREFIX + name]));
      wanted.forEach((name, i) => {
        if (values[i] === null) throw new Error('Missing collection: ' + name);
        data.set(name, collection(name, JSON.parse(values[i])));
      });
    }
    return { data, names };
  } catch (e) { throw storageError('Cannot read shared persistent database', e); }
}

async function loadFromSupabase() {
  try {
    const raw = await supabase.load();
    const data = new Map();
    for (const [name, rows] of Object.entries(raw)) data.set(name, collection(name, rows));
    return data;
  } catch (e) {
    if (e.code === 'STORAGE_UNAVAILABLE') throw e;
    throw storageError('Cannot read shared persistent database', e);
  }
}

/** لقطة id → JSON لكل صف (عشان نحسب الفرق عند الحفظ: اتكتب/اتمسح/مفيش تغيير) */
function snapshotIds(data) {
  const snap = new Map();
  for (const [name, rows] of data) {
    const byId = new Map();
    for (const row of rows) {
      if (!row || row.id == null || String(row.id) === '') {
        throw storageError('Database rows must have a non-empty id');
      }
      byId.set(String(row.id), JSON.stringify(row));
    }
    snap.set(name, byId);
  }
  return snap;
}

/** الفرق بين اللقطة والحالة الحالية للمجموعات المتسخة بس → upserts/deletes */
function diffForCommit(snap, data, dirty) {
  const upserts = {};
  const deletes = {};
  for (const name of dirty) {
    const rows = data.get(name) || [];
    const before = snap.get(name) || new Map();
    const seen = new Set();
    for (const row of rows) {
      if (!row || row.id == null || String(row.id) === '') {
        throw storageError('Database rows must have a non-empty id');
      }
      const id = String(row.id);
      seen.add(id);
      if (before.get(id) !== JSON.stringify(row)) (upserts[name] || (upserts[name] = [])).push(row);
    }
    for (const id of before.keys()) {
      if (!seen.has(id)) (deletes[name] || (deletes[name] = [])).push(id);
    }
  }
  return { upserts, deletes };
}

async function init() {
  if (!ready) {
    ready = (async () => {
      validateConfig();
      if (MODE === 'file') {
        for (const dir of [DATA_DIR, UPLOAD_DIR]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        cache = loadFromDisk();
      } else if (MODE === 'redis') { cache = (await loadFromRedis()).data; }
      else { cache = await loadFromSupabase(); }
      console.log(`🗄️  التخزين الدائم: ${MODE === 'redis' ? 'Upstash Redis'
        : MODE === 'postgres' ? 'Supabase PostgreSQL' + (supabase.host() ? ' (' + supabase.host() + ')' : '')
          : DATA_DIR}`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

const RELEASE_SCRIPT = `-- BBQ_RELEASE
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`;
const RENEW_SCRIPT = `-- BBQ_RENEW
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
return 0`;
const COMMIT_SCRIPT = `-- BBQ_COMMIT
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
local values = {KEYS[2], ARGV[2]}
for i = 3, #KEYS do
  values[#values + 1] = KEYS[i]
  values[#values + 1] = ARGV[i]
end
redis.call('MSET', unpack(values))
redis.call('DEL', KEYS[1])
return 1`;

async function acquireLock() {
  const token = crypto.randomBytes(24).toString('hex');
  const until = Date.now() + LOCK_WAIT_MS;
  do {
    const result = (await redisCmd([['SET', LOCK_KEY, token, 'NX', 'PX', LOCK_MS]]))[0];
    if (result === 'OK') return token;
    await delay(40 + Math.floor(Math.random() * 60));
  } while (Date.now() < until);
  throw storageError('Database busy; retry the request');
}

async function acquirePgLock() {
  const token = crypto.randomBytes(24).toString('hex');
  const until = Date.now() + LOCK_WAIT_MS;
  do {
    if (await supabase.tryLock(token, LOCK_MS)) return token;
    await delay(40 + Math.floor(Math.random() * 60));
  } while (Date.now() < until);
  throw storageError('Database busy; retry the request');
}

function commitFile(data) {
  const tmp = DATABASE_FILE + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify({ version: 1, collections: Object.fromEntries(data) }, null, 2));
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(tmp, DATABASE_FILE);  // One atomic snapshot: order + counter + notifications together.
    const dir = fs.openSync(DATA_DIR, 'r');
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  } catch (e) {
    throw storageError('Cannot save persistent database', e);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

/** Serialise locally, lock across Redis workers, reload, then commit before success. */
async function transaction(work) {
  const parent = context.getStore();
  if (parent && !parent.closed) return work();
  let unlock;
  const previous = queue;
  queue = new Promise((resolve) => { unlock = resolve; });
  await previous;
  let lock, renewal, result, snap = null;
  const tx = { data: null, dirty: new Set(), effects: [], closed: false, redisNames: [] };
  try {
    await init();
    if (MODE === 'redis') {
      lock = await acquireLock();
      renewal = setInterval(() => {
        redisCmd([['EVAL', RENEW_SCRIPT, 1, LOCK_KEY, lock, LOCK_MS]])
          .catch(() => {});  // The commit still verifies ownership; a lost lease can NEVER write.
      }, LOCK_MS / 3);
      renewal.unref();
      const loaded = await loadFromRedis();
      tx.data = loaded.data;
      tx.redisNames = loaded.names;   // نحفظ الـmanifest كامل عشان الكتابة ما تمسحش المجموعات غير المحمّلة (الصور)
    } else if (MODE === 'postgres') {
      lock = await acquirePgLock();
      renewal = setInterval(() => {
        supabase.renewLock(lock, LOCK_MS)
          .catch(() => {});  // The commit still verifies ownership; a lost lease can NEVER write.
      }, LOCK_MS / 3);
      renewal.unref();
      tx.data = await loadFromSupabase();
      snap = snapshotIds(tx.data);
    } else { tx.data = loadFromDisk(); }
    result = await context.run(tx, work);
    if (tx.dirty.size) {
      if (MODE === 'file') commitFile(tx.data);
      else if (MODE === 'redis') {
        const names = [...tx.dirty];
        /* الـmanifest الجديد = القديم + المفاتيح المعدّلة — عشان 'files' اللي بتتحمّل
           كسول ما تتمسحش من قائمة المجموعات لمّا معاملة تانية تعمل commit. */
        const manifest = [...new Set([...tx.redisNames, ...tx.data.keys()])];
        const committed = (await redisCmd([[
          'EVAL', COMMIT_SCRIPT, 2 + names.length, LOCK_KEY, PREFIX + 'collections',
          ...names.map((name) => PREFIX + name), lock, JSON.stringify(manifest),
          ...names.map((name) => JSON.stringify(tx.data.get(name))),
        ]]))[0];
        if (committed !== 1) throw storageError('Database lease lost; request was not saved');
        lock = null;  // Released atomically with the commit.
      } else {
        /* حفظ ذري في Supabase: صفوف اتكتبت/اتغيرت/اتمسحت بس، في معاملة واحدة
           بتأكد إن اللوك لسه ملكنا — غير كده ممنوع نعلن نجاح. */
        const { upserts, deletes } = diffForCommit(snap, tx.data, tx.dirty);
        const committed = await supabase.commit(lock, upserts, deletes);
        if (committed !== true) throw storageError('Database lease lost; request was not saved');
        lock = null;  // Released atomically with the commit.
      }
    }
    cache = tx.data;
    tx.closed = true;
  } finally {
    tx.closed = true;
    if (renewal) clearInterval(renewal);
    if (lock) {
      try {
        if (MODE === 'postgres') await supabase.releaseLock(lock);
        else await redisCmd([['EVAL', RELEASE_SCRIPT, 1, LOCK_KEY, lock]]);
      } catch { /* The lease expires even if the database goes offline. */ }
    }
    unlock();
  }
  /* Release transaction locks BEFORE running effects. Async effects may start a
     fresh transaction (e.g. WhatsApp logs), and serverless waits for them too.
     They cannot announce an uncommitted order or turn a saved order into failure. */
  for (const effect of tx.effects) {
    try { await effect(); } catch (e) { console.warn('[after-commit]', e.message); }
  }
  return result;
}

function afterCommit(effect) {
  const tx = context.getStore();
  if (tx && !tx.closed) tx.effects.push(effect);
  else effect();
}
function all(name) { return (context.getStore()?.data || cache).get(name) || []; }
function write(name, rows) {
  const tx = context.getStore();
  if (!tx || tx.closed) throw new Error('Database mutations must run inside store.transaction()');
  collection(name, rows);
  tx.data.set(name, rows); tx.dirty.add(name);
  return rows;
}
const find = (name, pred) => all(name).find(pred);
const filter = (name, pred) => all(name).filter(pred);
function insert(name, row) { write(name, [...all(name), row]); return row; }
function update(name, id, patch) {
  const rows = all(name).slice();
  const i = rows.findIndex((row) => String(row.id) === String(id));
  if (i < 0) return null;
  rows[i] = { ...rows[i], ...patch };
  write(name, rows);
  return rows[i];
}
function remove(name, id) { return write(name, all(name).filter((row) => String(row.id) !== String(id))); }
const uid = () => crypto.randomBytes(9).toString('hex');
const token = () => crypto.randomBytes(32).toString('hex');
function nextOrderNumber() {
  const counters = all('counters').slice();
  const current = counters.find((row) => row.id === 'order');
  const last = all('orders').reduce((max, order) => Math.max(max, Number(order.number) || 1000), Number(current?.value) || 1000);
  const value = Math.max(1000, last) + 1;
  const counter = { id: 'order', value };
  write('counters', [...counters.filter((row) => row.id !== 'order'), counter]);
  return value;
}
const backup = () => Object.fromEntries(context.getStore()?.data || cache);

module.exports = {
  MODE, IS_SERVERLESS, DATA_DIR, UPLOAD_DIR, DATABASE_FILE, PREFIX,
  init, transaction, read, imageRead, afterCommit, ensureCollection, getFile, fullBackup,
  storageError, redisCmd, redisGet,
  all, write, find, filter, insert, update, remove, uid, token, nextOrderNumber, backup,
};
