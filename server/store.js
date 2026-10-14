/* ============================================================================
   Persistent storage: a durable file snapshot (one Node process) or Upstash Redis.

   Every API request runs in a transaction. Redis requests take a leased lock,
   reload the shared data, and atomically commit under that lock. A warm worker
   never overwrites another worker's customers, sessions, orders or notifications.
   Failed reads/writes are errors, NEVER a fallback to memory or /tmp.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const { setTimeout: delay } = require('timers/promises');

const cleanEnv = (v) => String(v || '').trim().replace(/^['"]+|['"]+$/g, '').trim();
const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const REDIS_URL = cleanEnv(process.env.UPSTASH_REDIS_REST_URL).replace(/\/+$/, '');
const REDIS_TOKEN = cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
const PREFIX = process.env.REDIS_PREFIX || 'bbq:';
const MODE = process.env.STORAGE || (REDIS_URL || REDIS_TOKEN || IS_SERVERLESS ? 'redis' : 'file');
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

function storageError(message, cause) {
  const e = new Error(message, { cause });
  e.code = 'STORAGE_UNAVAILABLE';
  return e;
}

function validateConfig() {
  if (!['file', 'redis'].includes(MODE)) throw storageError('STORAGE must be file or redis');
  if (IS_SERVERLESS && MODE !== 'redis') {
    throw storageError('Vercel requires persistent Redis storage; file storage and /tmp are not allowed');
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

async function loadFromRedis() {
  const data = new Map();
  try {
    const manifest = await redisGet(PREFIX + 'collections');
    const names = manifest === null ? [] : JSON.parse(manifest);
    if (!Array.isArray(names) || names.some((n) => typeof n !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(n))) {
      throw new Error('Invalid Redis collection manifest');
    }
    if (names.length) {
      const values = await redisCmd(names.map((name) => ['GET', PREFIX + name]));
      names.forEach((name, i) => {
        if (values[i] === null) throw new Error('Missing collection: ' + name);
        data.set(name, collection(name, JSON.parse(values[i])));
      });
    }
    return data;
  } catch (e) { throw storageError('Cannot read shared persistent database', e); }
}

async function init() {
  if (!ready) {
    ready = (async () => {
      validateConfig();
      if (MODE === 'file') {
        for (const dir of [DATA_DIR, UPLOAD_DIR]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        cache = loadFromDisk();
      } else { cache = await loadFromRedis(); }
      console.log(`🗄️  التخزين الدائم: ${MODE === 'redis' ? 'Upstash Redis' : DATA_DIR}`);
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
  let lock, renewal, result;
  const tx = { data: null, dirty: new Set(), effects: [], closed: false };
  try {
    await init();
    if (MODE === 'redis') {
      lock = await acquireLock();
      renewal = setInterval(() => {
        redisCmd([['EVAL', RENEW_SCRIPT, 1, LOCK_KEY, lock, LOCK_MS]])
          .catch(() => {});  // The commit still verifies ownership; a lost lease can NEVER write.
      }, LOCK_MS / 3);
      renewal.unref();
      tx.data = await loadFromRedis();
    } else { tx.data = loadFromDisk(); }
    result = await context.run(tx, work);
    if (tx.dirty.size) {
      if (MODE === 'file') commitFile(tx.data);
      else {
        const names = [...tx.dirty];
        const committed = (await redisCmd([[
          'EVAL', COMMIT_SCRIPT, 2 + names.length, LOCK_KEY, PREFIX + 'collections',
          ...names.map((name) => PREFIX + name), lock, JSON.stringify([...tx.data.keys()]),
          ...names.map((name) => JSON.stringify(tx.data.get(name))),
        ]]))[0];
        if (committed !== 1) throw storageError('Database lease lost; request was not saved');
        lock = null;  // Released atomically with the commit.
      }
    }
    cache = tx.data;
    tx.closed = true;
  } finally {
    tx.closed = true;
    if (renewal) clearInterval(renewal);
    if (lock) {
      try { await redisCmd([['EVAL', RELEASE_SCRIPT, 1, LOCK_KEY, lock]]); }
      catch { /* The lease expires even if Redis goes offline. */ }
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
  init, transaction, afterCommit, storageError, redisCmd, redisGet,
  all, write, find, filter, insert, update, remove, uid, token, nextOrderNumber, backup,
};
