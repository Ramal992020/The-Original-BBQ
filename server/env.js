/* ============================================================================
   env.js — فحص متغيرات البيئة + فرض بيانات دخول الأدمن من البيئة
   ----------------------------------------------------------------------------
   ليه الملف ده موجود؟
   على Vercel (سيرفرلس) مفيش قرص ثابت، فبياناتك لازم تعيش في مكان تاني،
   والسيرفر بيتولّد من جديد مع كل Deploy. المتغيرات دي هي اللي بتخلي التطبيق
   «دائم» فعلاً:

     UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  → التخزين السحابي
     APP_URL                                            → روابط الدفع/واتساب/الاستعادة
     ADMIN_PASSWORD                                     → كلمة سر الأدمن (مش admin123)

   الملف ده بيعمل ٣ حاجات:
     1) enforceCredentials() — يتنده مرّة مع كل إقلاع: لو ADMIN_PASSWORD متظبط،
        كلمة سر الأدمن بتبقى هي دي (env يكسب دايمًا — كده تقدر تسترجع الدخول
        لو نسيتها، ومحدش يقدر يسيب الحساب بـ admin123 على الإنتاج).
     2) report()            — تقرير جاهز للعرض (في لوحة الإدارة / من التيرمنال)
        بيقولك إيه الناقص وإيه الغلط، من غير ما يكشف أي قيمة سرية.
     3) pingRedis()         — اتصال تجريبي حقيقي بـ Upstash علشان تتأكد إن
        الرابط والتوكن شغالين قبل ما تعمل Redeploy.
   ========================================================================== */
'use strict';
const store = require('./store');
const auth = require('./auth');

const clean = (v) => String(v == null ? '' : v).trim().replace(/^['"]+|['"]+$/g, '').trim();
const SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const wantsRedis = () => SERVERLESS || process.env.STORAGE === 'redis';

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
    hint: 'من نفس مكان الرابط — انسخه كامل (أكتر من ٤٠ حرف)',
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
    key: 'ADMIN_PASSWORD', secret: true, level: 'required', when: () => SERVERLESS,
    label: 'كلمة سر الأدمن',
    hint: '٨ حروف على الأقل — بيترجّع لها حساب admin@bbq.app مع كل Redeploy',
    validate: (v) => (v.length >= 8 ? null : 'استخدم ٨ حروف على الأقل (حروف + أرقام + رمز)'),
  },
  {
    key: 'DEMO_LOGIN', secret: false, level: 'recommended', when: () => SERVERLESS,
    label: 'قفل الدخول التجريبي',
    hint: 'حطّها 0 في الإنتاج علشان يقفل زر «الدخول السريع»',
    validate: (v) => (v === '0' ? null : 'قيمتها لازم تكون 0 على الإنتاج'),
  },
  {
    key: 'SUPERVISOR_PASSWORD', secret: true, level: 'recommended', when: () => false,
    label: 'كلمة سر المشرف (اختياري)',
    hint: 'زي ADMIN_PASSWORD بس لحساب supervisor@bbq.app',
    validate: (v) => (v.length >= 8 ? null : 'استخدم ٨ حروف على الأقل'),
  },
  {
    key: 'ADMIN_EMAIL', secret: false, level: 'recommended', when: () => false,
    label: 'إيميل الأدمن (اختياري)',
    hint: 'الافتراضي admin@bbq.app — غيّره لو عايز إيميل تاني',
    validate: () => null,
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
    const present = !!raw;
    const error = present ? s.validate(raw) : null;
    return {
      key: s.key,
      label: s.label,
      hint: s.hint,
      level: s.level,                                    // required | recommended
      active,                                            // مهم في الوضع الحالي؟
      present,
      value: mask(s.key, raw),
      error,                                             // null = تمام
      status: !active ? 'optional' : !present ? 'missing' : error ? 'invalid' : 'ok',
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

/* -------------------- فرض بيانات الدخول من متغيرات البيئة ----------------- */
function safeVerify(password, salt, hash) {
  try { return !!(salt && hash) && auth.verifyPassword(password, salt, hash); } catch { return false; }
}

/**
 * يطبّق كلمة السر (والدور) اللي جاية من متغيرات البيئة على حساب معيّن.
 * env يكسب دايمًا: لو كلمة السر مختلفة → بتتحدّث. كده:
 *   - مفيش حساب أدمن بـ admin123 على الإنتاج أبدًا.
 *   - لو نسيت كلمة السر، غيّر المتغير في Vercel واعمل Redeploy وادخل.
 */
function applyCredential({ email, password, role, name }) {
  let u = auth.byEmail(email);
  if (!u) {
    auth.createUser({ name, email, password, role });
    return { email, role, status: 'created', note: 'تم إنشاء الحساب من متغيرات البيئة' };
  }
  const patch = {};
  const passwordOk = safeVerify(password, u.salt, u.hash);
  if (!passwordOk) {
    const { salt, hash } = auth.hashPassword(password);
    patch.salt = salt; patch.hash = hash;
  }
  if (u.role !== role) patch.role = role;          // env بيضمن إن الحساب أدمن
  if (u.active === false) patch.active = true;
  if (!Object.keys(patch).length) return { email, role, status: 'ok', note: 'كلمة السر مطابقة' };
  store.update('users', u.id, patch);
  return {
    email, role,
    status: !passwordOk ? 'password-updated' : 'role-updated',
    note: !passwordOk ? 'تم تعيين كلمة السر من ADMIN_PASSWORD' : 'تم تصحيح دور الحساب',
  };
}

/** يُستدعى مع كل إقلاع (من ensureReady) — آمن يتنده أكتر من مرّة */
function enforceCredentials({ log = true } = {}) {
  const out = [];
  const adminEmail = (clean(process.env.ADMIN_EMAIL) || 'admin@bbq.app').toLowerCase();
  const adminPw = clean(process.env.ADMIN_PASSWORD);
  if (adminPw) {
    const r = applyCredential({ email: adminEmail, password: adminPw, role: 'admin', name: 'صاحب المطعم' });
    out.push(r);
    if (log && r.status !== 'ok') console.log(`🔐 ${r.email}: ${r.note}`);
  }
  const supEmail = (clean(process.env.SUPERVISOR_EMAIL) || 'supervisor@bbq.app').toLowerCase();
  const supPw = clean(process.env.SUPERVISOR_PASSWORD);
  if (supPw) {
    const r = applyCredential({ email: supEmail, password: supPw, role: 'supervisor', name: 'مشرف الكاشير' });
    out.push(r);
    if (log && r.status !== 'ok') console.log(`🔐 ${r.email}: ${r.note}`);
  }
  return out;
}

/* ------------------------ كشف كلمة السر الافتراضية ----------------------- */
const DEFAULT_PASSWORDS = { admin: 'admin123', supervisor: 'super123' };

function defaultPasswordCheck() {
  const rows = [];
  if (clean(process.env.ADMIN_PASSWORD)) return rows;      // الأدمن محمي من البيئة
  const admin = auth.byEmail(clean(process.env.ADMIN_EMAIL) || 'admin@bbq.app');
  if (admin && safeVerify(DEFAULT_PASSWORDS.admin, admin.salt, admin.hash)) {
    rows.push({
      level: 'danger', email: admin.email,
      message: 'حساب الأدمن لسه بكلمة السر الافتراضية admin123 — أي حد قرأ الـ README يعرفها. ' +
        'ضيف ADMIN_PASSWORD في متغيرات البيئة واعمل Redeploy (أو غيّرها من صفحة الحساب).',
    });
  }
  return rows;
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
      message: 'التطبيق شغال سيرفرلس من غير Upstash → البيانات في /tmp وهتضيع مع كل Deploy. ' +
        'سجّل UPSTASH_REDIS_REST_URL و UPSTASH_REDIS_REST_TOKEN واعمل Redeploy.',
    });
  }
  if (redis && !redis.ok && !redis.skipped) {
    warnings.push({ level: 'danger', message: 'فشل الاتصال بـ Upstash: ' + redis.error });
  }
  if (SERVERLESS && !clean(process.env.APP_URL)) {
    warnings.push({ level: 'warn', message: 'APP_URL مش متظبط — روابط الدفع وواتساب واستعادة كلمة السر هتطلع غلط.' });
  }
  if (SERVERLESS && process.env.DEMO_LOGIN !== '0') {
    warnings.push({ level: 'warn', message: 'DEMO_LOGIN مش 0 — زر «الدخول السريع» لسه مفتوح للكل.' });
  }
  for (const w of defaultPasswordCheck()) warnings.push(w);

  return {
    ok: warnings.every((w) => w.level !== 'danger') && !missing.length && !invalid.length,
    ready: !missing.length && !invalid.length,
    serverless: SERVERLESS,
    realtime: !SERVERLESS,
    storage: store.MODE,                    // redis | file
    storageLabel: store.MODE === 'redis' ? 'Upstash Redis (دائم)' : 'ملفات / قرص مؤقت (مؤقت)',
    redisPrefix: store.PREFIX,
    node: process.version,
    appUrl: clean(process.env.APP_URL) || '',
    vars,
    missing,
    invalid,
    redis,
    credentials: {
      adminFromEnv: !!clean(process.env.ADMIN_PASSWORD),
      adminEmail: (clean(process.env.ADMIN_EMAIL) || 'admin@bbq.app').toLowerCase(),
      supervisorFromEnv: !!clean(process.env.SUPERVISOR_PASSWORD),
      note: 'لو ADMIN_PASSWORD متظبط، كلمة سر الأدمن بترجع لقيمته مع كل Redeploy (ده مقصود — بيخليك تسترجع الدخول لو نسيتها).',
    },
    warnings,
    at: new Date().toISOString(),
  };
}

module.exports = { report, pingRedis, checkVars, enforceCredentials, defaultPasswordCheck, mask, SPEC, SERVERLESS };
