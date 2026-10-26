/* ============================================================================
   supabase.js — اتصال Supabase PostgreSQL عبر PostgREST (fetch فقط — بدون مكتبات)
   ----------------------------------------------------------------------------
   التطبيق بيتكلم مع قاعدة Supabase عن طريق دوال SQL ذرّية (bbq_* في migrations):
     bbq_ping / bbq_load / bbq_try_lock / bbq_renew_lock / bbq_release_lock / bbq_commit

   قواعد الأمان:
   - مفتاح service_role السري بيتقرا من البيئة بس (SUPABASE_SERVICE_ROLE_KEY)
     ومش بيخرج من السيرفر أبدًا — الواجهة مالهاش أي علاقة بيه.
   - أي فشل في القراءة/الكتابة = خطأ STORAGE_UNAVAILABLE صريح (مفيش fallback
     لذاكرة أو /tmp)، والتطبيق ما يرجعش «نجاح» غير بعد الحفظ الفعلي.
   ========================================================================== */
'use strict';

const cleanEnv = (v) => String(v || '').trim().replace(/^['"]+|['"]+$/g, '').trim();
const RAW_URL = cleanEnv(process.env.SUPABASE_URL).replace(/\/+$/, '');
const KEY = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

/* نقبل https://xxx.supabase.co أو أي رابط ختم بـ /rest/v1 */
function restBase() {
  if (!RAW_URL) return '';
  return /\/rest\/v1$/i.test(RAW_URL) ? RAW_URL : RAW_URL + '/rest/v1';
}

const configured = () => !!RAW_URL && !!KEY;

function fail(message, cause) {
  const e = new Error(message, { cause });
  e.code = 'STORAGE_UNAVAILABLE';
  return e;
}

/** استدعاء دالة SQL عبر PostgREST RPC. */
async function rpc(name, args, { timeout = 15000 } = {}) {
  if (!configured()) {
    throw fail('Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side only)');
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(`${restBase()}/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        authorization: 'Bearer ' + KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(args),
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = '';
      try { detail = JSON.parse(text)?.message || ''; } catch { detail = text.slice(0, 200); }
      if (res.status === 401 || res.status === 403) {
        throw fail('Supabase auth failed — check SUPABASE_SERVICE_ROLE_KEY (use the secret service_role key, server-side only)');
      }
      if (res.status === 404) {
        throw fail('Supabase function missing — run supabase/migrations/0001_init.sql in the SQL Editor');
      }
      throw fail('Supabase error ' + res.status + (detail ? ': ' + detail : ''));
    }
    return text.length ? JSON.parse(text) : null;
  } catch (e) {
    if (e.code === 'STORAGE_UNAVAILABLE') throw e;
    throw fail('Supabase database is unavailable' + (e && e.message ? ' (' + e.message + ')' : ''), e);
  } finally { clearTimeout(timer); }
}

const ping = async () => {
  const out = await rpc('bbq_ping', {});
  return String(out || '').toLowerCase();
};

/**
 * { users: [...], orders: [...] } — كل صف هو الكائن الأصلي المحفوظ في data.
 * افتراضيًا جدول الصور (bbq_files — base64 ثقيل) مش بيتحمّل؛ النسخ الاحتياطي
 * الكامل بس هو اللي بيطلب includeFiles=true.
 */
async function load({ includeFiles = false } = {}) {
  const out = await rpc('bbq_load', { p_include_files: includeFiles });
  if (!out || typeof out !== 'object' || Array.isArray(out)) throw fail('Invalid Supabase bbq_load response');
  for (const [name, rows] of Object.entries(out)) {
    if (!Array.isArray(rows)) throw fail('Invalid Supabase collection: ' + name);
  }
  return out;
}

/** صف واحد من جدول مخصص (مثل صورة من bbq_files) — أو null لو مش موجود. */
const getRow = async (table, id) => rpc('bbq_get_row', { p_table: table, p_id: id });

/** تحميل مجموعة واحدة كاملة (كسول — لمجموعة الصور جوه معاملة كتابة). */
const collection = async (table) => rpc('bbq_collection', { p_table: table });

const tryLock = async (token, ttlMs) => (await rpc('bbq_try_lock', { p_token: token, p_ttl_ms: ttlMs }, { timeout: 8000 })) === true;
const renewLock = async (token, ttlMs) => (await rpc('bbq_renew_lock', { p_token: token, p_ttl_ms: ttlMs }, { timeout: 8000 })) === true;
const releaseLock = async (token) => {
  try { await rpc('bbq_release_lock', { p_token: token }, { timeout: 8000 }); } catch { /* اللوك بينتهي لوحده */ }
};

/**
 * حفظ ذري: upserts = { collection: [rows] } · deletes = { collection: [ids] }.
 * بيرجّع false لو اللوك ضاع — في الحالة دي ممنوع إطلاقًا نعلن نجاح.
 */
const commit = async (token, upserts, deletes) => {
  const out = await rpc('bbq_commit', { p_token: token, p_upserts: upserts, p_deletes: deletes }, { timeout: 25000 });
  return out === true;
};

/** اسم المضيف بس (للتقارير — من غير أي سر) */
const host = () => {
  try { return new URL(RAW_URL).host; } catch { return ''; }
};

module.exports = { configured, rpc, ping, load, getRow, collection, tryLock, renewLock, releaseLock, commit, host, restBase };
