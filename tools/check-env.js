/* ============================================================================
   tools/check-env.js — فحص جاهزية النشر (من غير ما تشغّل السيرفر)
   ----------------------------------------------------------------------------
   الاستخدام:
     npm run check:env                 # فحص الوضع الحالي (محلي)
     npm run check:env -- --vercel     # ⭐ محاكاة بيئة Vercel قبل ما تنشر
     npm run check:env -- --json       # نفس التقرير بصيغة JSON (للأتمتة/CI)
     npm run check:env -- --no-ping    # من غير اتصال تجريبي (أسرع / أوفلاين)

   بيقرأ المتغيرات من البيئة، ولو فيه ملف .env في جذر المشروع بيقراه كمان
   (من غير ما ي overwrite أي متغير مظبوط في البيئة نفسها).

   الرمز (exit code): 0 = كل حاجة تمام · 1 = فيه حاجة ناقصة أو غلط.
   ========================================================================== */
'use strict';

/* --vercel = «اختبرني كأني على Vercel»: يفعّل نفس شروط السيرفرلس
   (مفيش قرص → لازم Upstash، ولازم APP_URL و ADMIN_PASSWORD) */
const simulateVercel = process.argv.includes('--vercel');
if (simulateVercel && !process.env.VERCEL) process.env.VERCEL = '1';

/* تحميل .env المحلي لازم يحصل قبل ما المتجر يقرا متغيرات البيئة */
require('../server/env').load();
const store = require('../server/store');
const deployEnv = require('../server/deploy-env');

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const col = (c, s) => (process.stdout.isTTY ? `${c}${s}${C.reset}` : s);
const ICON = { ok: '✅', missing: '❌', invalid: '⚠️ ', optional: '⚪' };
const iconFor = (v) => (v.status === 'missing' && v.level !== 'required' ? '⚠️ ' : ICON[v.status] || '⚪');

(async () => {
  const ping = !process.argv.includes('--no-ping');
  const asJson = process.argv.includes('--json');

  await store.init();
  const rep = await deployEnv.report({ ping });

  if (asJson) {
    console.log(JSON.stringify(rep, null, 2));
    process.exit(rep.ok ? 0 : 1);
  }

  const line = '─'.repeat(64);
  console.log('');
  console.log(col(C.bold, '🔥 The Original BBQ — فحص جاهزية النشر'));
  console.log(line);
  console.log(`   الوضع        : ${rep.serverless ? (simulateVercel ? 'سيرفرلس (محاكاة Vercel)' : 'سيرفرلس (Vercel)') : 'سيرفر عادي (محلي)'}`);
  console.log(`   التخزين      : ${rep.storage === 'redis'
    ? col(C.green, 'Upstash Redis (دائم)')
    : col(rep.serverless ? C.red : C.yellow, rep.serverless ? 'ملفات /tmp — البيانات هتضيع مع كل Deploy ❗' : 'ملفات JSON محلية')}`);
  console.log(`   Node         : ${rep.node}`);
  if (rep.appUrl) console.log(`   APP_URL      : ${rep.appUrl}`);

  console.log('');
  console.log(col(C.bold, 'المتغيرات:'));
  for (const v of rep.vars) {
    const icon = iconFor(v);
    const name = v.key.padEnd(26);
    if (v.status === 'missing') {
      console.log(`   ${icon} ${name} ${col(C.red, v.active && v.level === 'required' ? 'ناقص (إجباري)' : 'مش مظبوط')}`);
      console.log(col(C.dim, `      ↳ ${v.hint}`));
    } else if (v.status === 'invalid') {
      console.log(`   ${icon} ${name} ${col(C.yellow, v.value)}`);
      console.log(col(C.yellow, `      ↳ ${v.error}`));
    } else if (v.status === 'ok') {
      console.log(`   ${icon} ${name} ${col(C.green, v.value)}`);
    } else {
      console.log(`   ${icon} ${name} ${col(C.dim, v.present ? v.value : 'اختياري — مش مظبوط')}`);
    }
  }

  if (rep.redis) {
    console.log('');
    console.log(col(C.bold, 'اتصال Upstash:'));
    if (rep.redis.skipped) console.log(col(C.dim, '   ⏭️  مفيش فحص — التخزين الحالي مش Redis'));
    else if (rep.redis.ok) console.log(col(C.green, `   ✅ PONG في ${rep.redis.ms}ms — الرابط والتوكن شغالين`));
    else console.log(col(C.red, `   ❌ فشل: ${rep.redis.error}`));
  }

  console.log('');
  console.log(col(C.bold, 'حساب صاحب المطعم:'));
  console.log(`   من البيئة : ${rep.credentials.ownerFromEnv
    ? col(C.green, 'نعم (ADMIN_PASSWORD / ADMIN_PASSWORD_HASH)')
    : col(C.red, 'لا — الحساب مش هيتجهّز أصلًا')}`);
  console.log(`   الإيميل   : ${rep.credentials.ownerEmail}`);
  console.log(`   متجهّز؟   : ${rep.credentials.ownerConfigured
    ? col(C.green, 'نعم — الحساب موجود في قاعدة البيانات')
    : col(C.yellow, 'لسه — هيتجهّز أول ما التطبيق يشتغل')}`);
  console.log(col(C.dim, `   ${rep.credentials.note}`));

  if (rep.warnings.length) {
    console.log('');
    console.log(col(C.bold, 'تنبيهات:'));
    for (const w of rep.warnings) {
      console.log(`   ${w.level === 'danger' ? '🚨' : '⚠️ '} ${col(w.level === 'danger' ? C.red : C.yellow, w.message)}`);
    }
  }

  console.log('');
  console.log(line);
  if (rep.ok) {
    console.log(col(C.green + C.bold, '✅ جاهز للنشر — كل المتغيرات الإجبارية مظبوطة.'));
    console.log(col(C.dim, '   بعد ما تضيف المتغيرات في لوحة Vercel: Deployments ⋯ → Redeploy'));
    if (!rep.serverless) console.log(col(C.dim, '   (ده فحص محلي — شغّل `npm run check:env -- --vercel` تتأكد من متطلبات Vercel)'));
  } else {
    console.log(col(C.red + C.bold, '❌ لسه مش جاهز:'));
    if (rep.missing.length) console.log(`   ناقص : ${rep.missing.join('، ')}`);
    if (rep.invalid.length) console.log(`   غلط  : ${rep.invalid.join('، ')}`);
    console.log(col(C.dim, '   الشرح الكامل خطوة بخطوة: docs/VERCEL-UPSTASH.md'));
  }
  console.log('');

  process.exit(rep.ok ? 0 : 1);
})().catch((e) => {
  console.error('فشل الفحص:', e.message);
  process.exit(1);
});
