/* ============================================================================
   deploy-env.js — تقرير جاهزية النشر + تجهيز حسابات الطاقم من البيئة
   ----------------------------------------------------------------------------
   ليه الملف ده موجود؟
   على Vercel (سيرفرلس) مفيش قرص ثابت، فبياناتك لازم تعيش في مكان تاني:

     UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  → التخزين الدائم
     APP_URL                                            → روابط الدفع/واتساب/الاستعادة
     ADMIN_PASSWORD (+ ADMIN_EMAIL)                     → حساب صاحب المطعم

   بيعمل حاجتين:
     1) report() — تقرير جاهز للعرض (تبويب 🛠️ النظام / أمر check:env)
        بيقولك إيه الناقص وإيه الغلط، وبيعمل PING تجريبي على Upstash،
        **من غير ما يكشف أي قيمة سرية**.
     2) syncCredentials() — يتنده جوه store.transaction() مع كل إقلاع:
        بيوّفّر كلمة سر صاحب المطعم/المشرف من البيئة **لحين** ما يتغيّر من
        اللوحة (`passwordChangedAt`) — بعد كده مش بنلمسها أبدًا.

   ملاحظة: تحميل ملف `.env` المحلي نفسه بيحصل في server/env.js (بيتنده الأول).
   ========================================================================== */
'use strict';
const store = require('./store');
const auth = require('./auth');

const clean = (v) => String(v == null ? '' : v).trim().replace(/^['"]+|['"]+$/g, '').trim();
const SERVERLESS = store.IS_SERVERLESS;
const wantsRedis = () => SERVERLESS || store.MODE === 'redis';
const ownerEmail = () => auth.OWNER_EMAIL;
const hasOwnerHash = () => !!clean(process.env.ADMIN_PASSWORD_HASH);
const supervisorEmail = () => (clean(process.env.SUPERVISOR_EMAIL) || 'supervisor@bbq.app').toLowerCase();

/* --------------------------- مواصفات المتغيرات --------------------------- */
/* level: 'required' = التطبيق مش هيشتغل صح من غيره · 'recommended' = ينفع بس مخاطرة */
const SPEC = [
  {
    key: 'UPSTASH_REDIS_REST_URL', secret: false, level: 'required', when: wantsRedis,
    label: 'رابط قاعدة Upstash (REST)',
    hint: 'من لوحة Upstash → Database → REST API → لازم يبدأ بـ https://',
    validate: (v) => (/^https?:\/\//i.test(v) ? null
      : 'لازم رابط REST يبدأ بـ https:// — رابط redis:// مش هيشتغل (الكود بيكلّم Upstash عبر HTTP)'),
  },
  {
    key: 'UPSTASH_REDIS_REST_TOKEN', secret: true, level: 'required', when: wantsRedis,
    label: 'توكن Upstash',
    hint: 'من نفس مكان الرابط — انسخه كامل',
    validate: (v) => (v.length >= 20 ? null : 'التوكن قصير جدًا — غالبًا نسخته ناقصة'),
  },
  {
    key: 'APP_URL', secret: false, level: 'required', when: () => SERVERLESS,
    label: 'رابط الموقع النهائي',
    hint: 'مثال: https://the-original-bbq.vercel.app — من غير / في الآخر',
    validate: (v) => (/^https?:\/\/[^\s]+\.[^\s]+$/i.test(v) && !/\/$/.test(v) ? null
      : 'لازم يبدأ بـ https:// ويكون دومين حقيقي ومن غير / في الآخر'),
  },
  {
    key: 'ADMIN_PASSWORD', secret: true, level: 'required', when: () => true,
    label: 'كلمة سر صاحب المطعم',
    hint: '٦ حروف على الأقل — أو استخدم ADMIN_PASSWORD_HASH بدالها (salt:hash)',
    /* ADMIN_PASSWORD_HASH بديل مقبول: الكود أصلاً مش بيخزن النص الصريح */
    satisfied: (v) => !!v || hasOwnerHash(),
    display: () => (clean(process.env.ADMIN_PASSWORD) ? mask('ADMIN_PASSWORD', clean(process.env.ADMIN_PASSWORD)) : 'ADMIN_PASSWORD_HASH'),
    validate: (v) => (auth.validPassword(v) ? null : '٦ حروف على الأقل (أو استخدم ADMIN_PASSWORD_HASH بصيغة salt:hash)'),
  },
  {
    key: 'ADMIN_EMAIL', secret: false, level: 'recommended', when: () => false,
    label: 'إيميل صاحب المطعم',
    hint: `الافتراضي ${ownerEmail()} — حساب الأدمن الوحيد اللي بيتربط بالبيئة`,
    validate: (v) => (auth.validEmail(v) ? null : 'إيميل غير صالح'),
  },
  {
    key: 'DEMO_LOGIN', secret: false, level: 'recommended', when: () => false,
    label: 'حالة الدخول التجريبي',
    hint: 'على الإنتاج سيبها فاضية (بتقفل لوحدها) — 1 بتفتح «الدخول السريع» للتجربة المحلية',
    validate: () => null,
  },
  {
    key: 'SUPERVISOR_PASSWORD', secret: true, level: 'recommended', when: () => false,
    label: 'كلمة سر المشرف (اختياري)',
    hint: 'بيوّفّر/يحدّث حساب المشرف — نفس قواعد ADMIN_PASSWORD',
    validate: (v) => (auth.validPassword(v) ? null : '٦ حروف على الأقل'),
  },
  {
    key: 'STORAGE', secret: false, level: 'recommended', when: () => false,
    label: 'إجبار نوع التخزين',
    hint: 'redis أو file — لتجاوز الاختيار التلقائي (سيبها فاضية أضمن)',
    validate: (v) => (['redis', 'file'].includes(v) ? null : 'القيم المقبولة: redis أو file'),
  },
  {
    key: 'REDIS_PREFIX', secret: false, level: 'recommended', when: () => false,
    label: 'بادئة مفاتيح Redis',
    hint: 'الافتراضي bbq: — مفيد لو أكتر من تطبيق على نفس القاعدة',
    validate: () => null,
  },
];

/* ------------------------------- إخفاء القيم ------------------------------ */
function mask(key, value) {
  if (!value) return '';
  const spec = SPEC.find((s) => s.key === key);
  if (spec && spec.secret) return '••••••' + String(value).slice(-4);
  return value.length > 60 ? value.slice(0, 57) + '…' : value;
}

/* ------------------------------ فحص القيم -------------------------------- */
function checkVars() {
  return SPEC.map((s) => {
    const raw = clean(process.env[s.key]);
    const active = !!s.when();
    const present = s.satisfied ? !!s.satisfied(raw) : !!raw;
    const error = present && raw ? s.validate(raw) : null;
    return {
      key: s.key,
      label: s.label,
      hint: s.hint,
      level: s.level,                                    // required | recommended
      active,                                            // مهم في الوضع الحالي؟
      present,
      value: s.display && present ? s.display() : mask(s.key, raw),
      error,                                             // null = تمام
      status: !active && s.level === 'recommended' && !raw ? 'optional'
        : !present ? 'missing' : error ? 'invalid' : 'ok',
    };
  });
}

/* --------------------- اتصال تجريبي حقيقي بـ Upstash --------------------- */
async function pingRedis() {
  if (store.MODE !== 'redis') return { ok: false, skipped: true, error: 'التخزين الحالي مش Redis' };
  const t0 = Date.now();
  try {
    const out = await store.redisCmd([['PING']], { timeout: 8000 });
    const pong = String((out && out[0]) || '').toUpperCase();
    if (pong !== 'PONG') return { ok: false, error: 'رد غير متوقع من Upstash: ' + JSON.stringify(out && out[0]) };
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/* ------------------- تجهيز حسابات الطاقم من متغيرات البيئة ---------------- */
/**
 * لازم تتنده جوه `store.transaction()` (كل كتابة في المتجر محتاجة ترانزاكشن).
 * القاعدة: البيئة بتوّفّر كلمة السر **لحين** ما صاحبها يغيّرها من اللوحة —
 * أول ما يحصل changePassword() بيتملّي `passwordChangedAt` وبعدها مش بنلمس الحساب.
 */
function syncCredentials({ log = true } = {}) {
  const out = [];

  /* ١) صاحب المطعم: ADMIN_PASSWORD / ADMIN_PASSWORD_HASH */
  const adminPw = clean(process.env.ADMIN_PASSWORD);
  const owner = auth.byEmail(ownerEmail());
  if (owner && owner.isOwner === true && adminPw && auth.validPassword(adminPw) && !owner.passwordChangedAt) {
    if (!auth.verifyPassword(adminPw, owner.salt, owner.hash)) {
      store.update('users', owner.id, { ...auth.hashPassword(adminPw) });
      out.push({ email: owner.email, role: 'admin', status: 'password-updated', note: 'تم تعيين كلمة السر من ADMIN_PASSWORD' });
      if (log) console.log(`🔐 ${owner.email}: ${out[out.length - 1].note}`);
    }
  }
  /* ADMIN_PASSWORD_HASH مش بنقدر نقارنه — bootstrapOwner هو اللي بيطبّقه أول مرة */

  /* ٢) المشرف (اختياري): بيوّفّر الحساب لو مش موجود */
  const supPw = clean(process.env.SUPERVISOR_PASSWORD);
  if (supPw && auth.validPassword(supPw)) {
    const email = supervisorEmail();
    let user = auth.byEmail(email);
    if (!user) {
      auth.createUser({ name: 'مشرف', email, password: supPw, role: 'supervisor' });
      out.push({ email, role: 'supervisor', status: 'created', note: 'تم إنشاء الحساب من SUPERVISOR_PASSWORD' });
    } else if (user.role !== 'supervisor' || user.active === false
      || (!user.passwordChangedAt && !auth.verifyPassword(supPw, user.salt, user.hash))) {
      const patch = { ...auth.hashPassword(supPw), role: 'supervisor', active: true };
      store.update('users', user.id, patch);
      out.push({ email, role: 'supervisor', status: 'password-updated', note: 'تم تعيين كلمة السر من SUPERVISOR_PASSWORD' });
    } else {
      out.push({ email, role: 'supervisor', status: 'ok', note: 'كلمة السر مطابقة' });
    }
    if (log && out[out.length - 1].status !== 'ok') console.log(`🔐 ${email}: ${out[out.length - 1].note}`);
  }

  return out;
}

/* --------------------- كشف الحسابات بكلمة سر معروفة ---------------------- */
const KNOWN_PASSWORDS = { 'admin@bbq.app': 'admin123', 'supervisor@bbq.app': 'super123', 'demo@bbq.app': 'demo123' };

function defaultPasswordCheck() {
  const rows = [];
  for (const user of store.filter('users', (u) => u.active !== false && u.role !== 'customer')) {
    const known = KNOWN_PASSWORDS[user.email.toLowerCase()];
    if (!known) continue;
    if (user.isOwner === true) continue;                        // حساب المالك من البيئة
    if (auth.verifyPassword(known, user.salt, user.hash)) {
      rows.push({
        level: 'danger', email: user.email,
        message: `حساب ${user.email} لسه شغال بكلمة السر المعروفة ${known} — فعّله بكلمة سر من البيئة ` +
          '(SUPERVISOR_PASSWORD) أو عطّله من صفحة المستخدمين.',
      });
    }
  }
  return rows;
}

/* ------------------------- تقرير عام لتشخيص القفل ------------------------
   بيترفق مع رد 503 لما الإعداد يكون ناقص (التسجيل والدخول مقفولين أصلًا)،
   عشان صاحب المطعم يعرف الناقص من /api/health من غير دخول.
   آمن: أسماء المتغيرات وحالتها فقط — من غير أي قيمة سرية ومن غير ping. */
function publicReport() {
  const vars = checkVars();
  return {
    serverless: SERVERLESS,
    storage: store.MODE,                                   // redis | file
    missing: vars.filter((v) => v.active && v.status === 'missing' && v.level === 'required').map((v) => v.key),
    invalid: vars.filter((v) => v.active && v.status === 'invalid').map((v) => v.key),
    ownerFromEnv: !!clean(process.env.ADMIN_PASSWORD) || hasOwnerHash(),
    guide: 'docs/VERCEL-UPSTASH.md',
  };
}

/* ------------------------------ التقرير الكامل --------------------------- */
async function report({ ping = true } = {}) {
  const vars = checkVars();
  const missing = vars.filter((v) => v.status === 'missing' && v.level === 'required').map((v) => v.key);
  const invalid = vars.filter((v) => v.status === 'invalid').map((v) => v.key);
  const redis = ping ? await pingRedis() : null;

  const warnings = [];
  if (SERVERLESS && store.MODE !== 'redis') {
    warnings.push({
      level: 'danger',
      message: 'التطبيق شغال سيرفرلس من غير Upstash → التخزين هيترفض عند أول طلب. ' +
        'سجّل UPSTASH_REDIS_REST_URL و UPSTASH_REDIS_REST_TOKEN واعمل Redeploy.',
    });
  }
  if (redis && !redis.ok && !redis.skipped) {
    warnings.push({ level: 'danger', message: 'فشل الاتصال بـ Upstash: ' + redis.error });
  }
  if (SERVERLESS && !clean(process.env.APP_URL)) {
    warnings.push({ level: 'warn', message: 'APP_URL مش متظبط — روابط الدفع وواتساب واستعادة كلمة السر هتطلع غلط.' });
  }
  if (!clean(process.env.ADMIN_PASSWORD) && !hasOwnerHash()) {
    warnings.push({
      level: 'danger',
      message: 'مفيش ADMIN_PASSWORD (أو ADMIN_PASSWORD_HASH) — حساب صاحب المطعم مش هيتجهّز أصلًا.',
    });
  }
  if (SERVERLESS && process.env.SEED_DEMO === '1') {
    warnings.push({ level: 'warn', message: 'SEED_DEMO=1 على سيرفرلس — حسابات admin123/super123/demo123 هتتزرع. شيّلها في الإنتاج.' });
  }
  for (const w of defaultPasswordCheck()) warnings.push(w);

  return {
    ok: warnings.every((w) => w.level !== 'danger') && !missing.length && !invalid.length,
    ready: !missing.length && !invalid.length,
    serverless: SERVERLESS,
    realtime: !SERVERLESS,
    storage: store.MODE,                    // redis | file
    storageLabel: store.MODE === 'redis' ? 'Upstash Redis (دائم)' : 'قرص السيرفر (يحتاج قرص دائم)',
    redisPrefix: store.PREFIX,
    node: process.version,
    appUrl: clean(process.env.APP_URL) || '',
    vars,
    missing,
    invalid,
    redis,
    credentials: {
      ownerEmail: ownerEmail(),
      ownerFromEnv: !!clean(process.env.ADMIN_PASSWORD) || hasOwnerHash(),
      ownerConfigured: !!store.find('users', (u) => u.isOwner === true),
      supervisorFromEnv: !!clean(process.env.SUPERVISOR_PASSWORD),
      note: 'البيئة بتوّفّر كلمة سر صاحب المطعم لحين ما يغيّرها من اللوحة — بعد كده مش بنلمسها تاني. ' +
        'لاسترجاع الدخول: غيّر ADMIN_PASSWORD في الاستضافة واعمل Redeploy (طالما الحساب لسه متغيّرش من اللوحة).',
    },
    warnings,
    at: new Date().toISOString(),
  };
}

module.exports = { report, publicReport, pingRedis, checkVars, syncCredentials, defaultPasswordCheck, mask, SPEC, SERVERLESS };
