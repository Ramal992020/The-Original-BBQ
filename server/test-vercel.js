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
  const srv = await fake.start(4599);
  const env = {
    ...process.env,
    STORAGE: 'redis',
    UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:4599',
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
    VERCEL: '1',
    PORT: '3199',
    BBQ_ENV_FILE: '',
    ADMIN_EMAIL: 'aliielramal@gmail.com',
    ADMIN_PASSWORD: 'test-owner-password',
    ADMIN_PASSWORD_HASH: '',
    SEED_DEMO: '0',
    DEMO_LOGIN: '0',
    ALLOW_DEMO_PAYMENTS: '0',
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

  console.log('\n' + '─'.repeat(58));
  console.log(fail === 0 ? `🎉 وضع Vercel شغال بالكامل (${pass} اختبار)` : `❌ فشل ${fail} من ${pass + fail}`);
  console.log('─'.repeat(58) + '\n');
  srv.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('💥', e); process.exit(1); });
