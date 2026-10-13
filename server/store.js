/* ============================================================================
   store.js — طبقة البيانات (يعمل في وضعين)
   ----------------------------------------------------------------------------
   MODE = file   → ملفات JSON في server/data  ← للسيرفر العادي (VPS / Render / محلي)
   MODE = redis  → Upstash Redis عبر REST      ← لـ Vercel (سيرفرلس، بدون قرص ثابت)

   الاختيار أوتوماتيكي:
     - لو فيه UPSTASH_REDIS_REST_URL → redis
     - أو حط STORAGE=redis / STORAGE=file بنفسك

   الفكرة: كل البيانات بتتحمّل في الميموري عند أول تشغيل (init)، والقراءة دايمًا
   فورية من الميموري، والكتابة بتتحدّث في الميموري + بتتحفظ في الخلفية (flush).
   قبل ما يرجّع أي رد، سيرفر Vercel بينتظر idle() عشان يضمن إن الكتابة وصلت.
   ========================================================================== */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const REDIS_URL = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const PREFIX = process.env.REDIS_PREFIX || 'bbq:';
let MODE = process.env.STORAGE || (REDIS_URL && REDIS_TOKEN ? 'redis' : 'file');

const DATA_DIR = process.env.BBQ_DATA_DIR || (IS_SERVERLESS ? path.join(os.tmpdir(), 'bbq-data') : path.join(__dirname, 'data'));
const UPLOAD_DIR = process.env.BBQ_UPLOAD_DIR || (IS_SERVERLESS ? path.join(os.tmpdir(), 'bbq-uploads') : path.join(__dirname, '..', 'uploads'));

function ensureDirs() {
  for (const d of [DATA_DIR, UPLOAD_DIR]) {
    try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); } catch {}
  }
}

/* في وضع redis مفيش قرص — فمنعملش أي مجلدات */
if (MODE === 'file') ensureDirs();

const cache = new Map();
const pending = new Set();
let ready = null;

/* ------------------------------ Redis (Upstash REST) ------------------------------ */
async function redisCmd(cmds, { timeout = 10000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${REDIS_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(cmds),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error('Upstash HTTP ' + res.status);
    const j = await res.json();
    if (!Array.isArray(j)) throw new Error('رد غير متوقع من Upstash');
    return j.map((x) => (x && x.error ? { __error: x.error } : x ? x.result : null));
  } finally { clearTimeout(t); }
}
const redisGet = async (key) => (await redisCmd([['GET', key]]))[0];
const redisSet = async (key, value) => (await redisCmd([['SET', key, value]]))[0];

/* ------------------------------ التحميل الأولي ------------------------------ */
function loadFromDisk() {
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (!f.endsWith('.json')) continue;
    const name = f.replace('.json', '');
    try { cache.set(name, JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'))); }
    catch { cache.set(name, []); }
  }
  cache.set('__manifest', [...cache.keys()].filter((k) => k !== '__manifest'));
}

async function loadFromRedis() {
  const manifest = await redisGet(PREFIX + 'collections');
  const names = manifest ? JSON.parse(manifest) : [];
  if (names.length) {
    const vals = await redisCmd(names.map((n) => ['GET', PREFIX + n]));
    names.forEach((n, i) => {
      try { cache.set(n, vals[i] ? JSON.parse(vals[i]) : []); } catch { cache.set(n, []); }
    });
  }
  cache.set('__manifest', names);
}

async function init() {
  if (ready) return ready;
  ready = (async () => {
    if (MODE === 'redis') {
      if (!REDIS_URL || !REDIS_TOKEN) {
        if (IS_SERVERLESS && !process.env.STORAGE) {
          console.warn('[store] إعدادات Upstash غير مكتملة — التحويل المؤقت لـ /tmp');
          MODE = 'file';
          ensureDirs();
          loadFromDisk();
          return true;
        }
        throw new Error('إعدادات Upstash ناقصة (UPSTASH_REDIS_REST_URL / TOKEN)');
      }
      try {
        await loadFromRedis();
        console.log(`🗄️  التخزين: Upstash Redis (${cache.get('__manifest').length} مجموعة)`);
      } catch (e) {
        if (IS_SERVERLESS && !process.env.STORAGE) {
          console.warn('[store] تعذر الاتصال بـ Upstash Redis، التحويل المؤقت لـ /tmp:', e.message);
          MODE = 'file';
          ensureDirs();
          loadFromDisk();
          return true;
        }
        throw e;
      }
    } else {
      ensureDirs();
      loadFromDisk();
      console.log(`🗄️  التخزين: ملفات JSON في ${DATA_DIR}`);
    }
    return true;
  })();
  return ready;
}

/* ------------------------------ الكتابة والحفظ ------------------------------ */
function persist(name) {
  const p = (async () => {
    if (MODE === 'file') {
      const f = path.join(DATA_DIR, name + '.json');
      const tmp = f + '.' + process.pid + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(cache.get(name) || [], null, 2));
      fs.renameSync(tmp, f);
      return;
    }
    /* redis: بنحفظ المجموعة + قائمة المجموعات مع بعض */
    const manifest = new Set(cache.get('__manifest') || []);
    manifest.add(name);
    cache.set('__manifest', [...manifest]);
    await redisCmd([
      ['SET', PREFIX + name, JSON.stringify(cache.get(name) || [])],
      ['SET', PREFIX + 'collections', JSON.stringify([...manifest])],
    ]);
  })().catch((e) => { console.warn('[store] فشل الحفظ:', e.message); })
    .finally(() => pending.delete(p));
  pending.add(p);
  return p;
}

/** انتظر كل عمليات الحفظ الجارية — مهم جدًا في Vercel قبل إرجاع الرد */
async function idle() {
  while (pending.size) await Promise.allSettled([...pending]);
}

/* ------------------------------ الواجهة العامة ------------------------------ */
function all(name) { return cache.get(name) || []; }
function write(name, rows) { cache.set(name, rows); persist(name); return rows; }
const find = (name, pred) => all(name).find(pred);
const filter = (name, pred) => all(name).filter(pred);

function insert(name, row) {
  const rows = all(name).slice();
  rows.push(row);
  return write(name, rows), row;
}
function update(name, id, patch) {
  const rows = all(name).slice();
  const i = rows.findIndex((r) => String(r.id) === String(id));
  if (i < 0) return null;
  rows[i] = { ...rows[i], ...patch };
  write(name, rows);
  return rows[i];
}
function remove(name, id) {
  const rows = all(name).filter((r) => String(r.id) !== String(id));
  write(name, rows);
  return rows;
}

const uid = () => crypto.randomBytes(9).toString('hex');
const token = () => crypto.randomBytes(32).toString('hex');

function nextOrderNumber() {
  const counters = all('counters').slice();
  const c = counters.find((x) => x.id === 'order') || { id: 'order', value: 1000 };
  c.value += 1;
  if (!counters.some((x) => x.id === 'order')) counters.push(c);
  write('counters', counters);
  return c.value;
}

function backup() {
  const out = {};
  for (const [k, v] of cache.entries()) if (k !== '__manifest') out[k] = v;
  return out;
}

module.exports = {
  get MODE() { return MODE; },
  IS_SERVERLESS, DATA_DIR, UPLOAD_DIR, PREFIX,
  init, idle, redisCmd, redisGet, redisSet,
  all, write, find, filter, insert, update, remove,
  uid, token, nextOrderNumber, backup,
};
