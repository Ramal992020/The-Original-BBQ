/* ============================================================================
   test-vercel.js — اختبار "وضع Vercel" (سيرفرلس + Upstash Redis)
   التشغيل:  npm run test:vercel
   ----------------------------------------------------------------------------
   بيتأكد من:
     ١) التخزين السحابي شغال (بدون أي قرص)
     ٢) البيانات بتفضل موجودة بعد إعادة التشغيل (cold start جديد)
     ٣) رفع الصور بيتخزن في قاعدة البيانات وبيتقدم من /api/img
     ٤) SSE بيترفض (400) والإعدادات بترجّع realtime=false → الواجهة تستخدم polling
   ========================================================================== */
'use strict';
const path = require('path');
const { execFile: execFileCb } = require('child_process');
const { promisify } = require('util');
const execFile = promisify(execFileCb);   // مهم: غير متزامن عشان المحاكي (جوه نفس العملية) يقدر يرد
const fake = require(path.join(__dirname, '..', 'tools', 'fake-upstash.js'));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

(async () => {
  /* بورت عشوائي (0 = اللي النظام يديه) عشان الاختبار ميصطدمش مع أي نسخة شغالة */
  const srv = await fake.start(0);
  const fakeUrl = `http://127.0.0.1:${srv.address().port}`;
  const env = {
    ...process.env,
    STORAGE: 'redis',
    UPSTASH_REDIS_REST_URL: fakeUrl,
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
    VERCEL: '1',
    PORT: '3199',
    BBQ_ENV_FILE: '',
    ADMIN_EMAIL: 'owner@bbq.test',
    ADMIN_PASSWORD: 'test-owner-password',
    ADMIN_PASSWORD_HASH: '',
    SEED_DEMO: '0',
    DEMO_LOGIN: '0',
    ALLOW_DEMO_PAYMENTS: '0',
    /* روابط النشر — نفس اللي docs/VERCEL-UPSTASH.md بيقولك تحطّهم في Vercel */
    APP_URL: 'https://bbq-test.vercel.app',
  };

  console.log('\n🚀 اختبار وضع Vercel (سيرفرلس + Redis) على http://127.0.0.1:3199\n');

  /* نسخة أولى: إنشاء حساب + طلب + رفع صورة */
  const out1 = (await execFile('node', [path.join(__dirname, 'vercel-runner.js'), 'first'], { env, encoding: 'utf8' })).stdout;
  const o1 = JSON.parse(out1.trim().split('\n').pop());
  check('التخزين السحابي اشتغل (من غير أي ملفات على القرص)', o1.storage === 'redis', o1.storage);
  check('البيانات الأولية اتزرعت (50 صنف)', o1.menu === 50, 'menu=' + o1.menu);
  check('تسجيل حساب + عمل طلب', o1.orderId === 'BBQ-1001' && o1.total === 360, `${o1.orderId} / ${o1.total}`);
  check('إشعار إدارة وصل', o1.notifs >= 1);
  check('SSE مرفوض على السيرفرلس (400)', o1.sse === 400, 'status=' + o1.sse);
  check('الواجهة اتقالها إن مفيش realtime (تستخدم polling)', o1.realtime === false);
  check('رفع صورة اتخزن في قاعدة البيانات', String(o1.image || '').startsWith('/api/img/'), o1.image);
  check('الصورة بتتقدم من الراوت الجديد', o1.imgStatus === 200 && o1.imgBytes > 0, `${o1.imgStatus}/${o1.imgBytes}`);

  /* نسخة تانية تمامًا (زي cold start جديد) → لازم تلاقي نفس البيانات */
  const out2 = (await execFile('node', [path.join(__dirname, 'vercel-runner.js'), 'second'], { env, encoding: 'utf8' })).stdout;
  const o2 = JSON.parse(out2.trim().split('\n').pop());
  check('الأدمن لسه بيقدر يسجّل دخول بعد إعادة التشغيل', o2.login === 200);
  check('الطلبات محفوظة بعد إعادة التشغيل', o2.orders === 1 && o2.orderId === 'BBQ-1001', `orders=${o2.orders}`);
  check('طلبات العميل مرتبطة بحسابه', o2.mine === 1);
  check('الإشعارات محفوظة', o2.notifs >= 1);
  check('سجل الواتساب محفوظ', o2.waLog >= 1);
  check('صورة الصنف فضلت موجودة وبتتقدم', o2.imgStatus === 200 && o2.image.startsWith('/api/img/'));
  check('الإحصائيات شغالة على التخزين السحابي', o2.sales === 360, 'sales=' + o2.sales);

  /* متغيرات البيئة: كلمة سر الأدمن من ADMIN_PASSWORD (مش admin123) */
  const out3 = (await execFile('node', [path.join(__dirname, 'vercel-runner.js'), 'env-report'], { env, encoding: 'utf8' })).stdout;
  const o3 = JSON.parse(out3.trim().split('\n').pop());
  check('التخزين دائم (redis) على وضع Vercel', o3.storage === 'redis', o3.storage);
  check('حساب صاحب المطعم متجهّز من ADMIN_EMAIL + ADMIN_PASSWORD', o3.ownerFromEnv === true && o3.ownerConfigured === true);
  check('الدخول بيكون بكلمة سر البيئة', o3.loginWithEnvPassword === 200, 'status=' + o3.loginWithEnvPassword);
  check('كلمة السر الافتراضية admin123 مرفوضة (مفيش حساب تجريبي على الإنتاج)', o3.loginWithDefault === 401, 'status=' + o3.loginWithDefault);
  check('APP_URL متسجّل صح', o3.appUrl === 'https://bbq-test.vercel.app', o3.appUrl);
  check('‎/api/health بيأكد إن البيانات دائمة', o3.persistent === true);
  check('‎/api/health بيأكد إن كلمة السر من البيئة', o3.ownerFromEnvHealth === true);
  check('اتصال Upstash شغال (PING)', o3.ping === true, String(o3.pingError || o3.ping));

  console.log('\n' + '─'.repeat(58));
  console.log(fail === 0 ? `🎉 وضع Vercel شغال بالكامل (${pass} اختبار)` : `❌ فشل ${fail} من ${pass + fail}`);
  console.log('─'.repeat(58) + '\n');
  srv.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('💥', e); process.exit(1); });
