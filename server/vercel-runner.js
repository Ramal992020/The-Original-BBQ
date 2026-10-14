/* ============================================================================
   vercel-runner.js — بيتشغّل جوه اختبار وضع Vercel (test-vercel.js)
   بيعمل سيناريو كامل وبيطبع النتيجة JSON — وبيتشغّل مرتين عشان نتأكد إن
   البيانات بتفضل موجودة بعد إعادة التشغيل (cold start).
   ========================================================================== */
'use strict';
const http = require('http');
const { ensureReady, serverlessHandler } = require('./index');

const MODE = process.argv[2] || 'first';
const PORT = Number(process.env.PORT || 3199);
const BASE = 'http://127.0.0.1:' + PORT;
/* حساب صاحب المطعم بيتجهّز من ADMIN_EMAIL + ADMIN_PASSWORD (زي ما هيبقى على Vercel) */
const OWNER_EMAIL = String(process.env.ADMIN_EMAIL || '').trim();
const OWNER_PW = String(process.env.ADMIN_PASSWORD || '').trim();

const J = async (method, url, { token, body, raw, headers = {} } = {}) => {
  const h = { ...headers };
  if (token) h.authorization = 'Bearer ' + token;
  if (body) h['content-type'] = 'application/json';
  const r = await fetch(BASE + url, { method, headers: h, body: raw || (body ? JSON.stringify(body) : undefined) });
  let d = {};
  try { d = await r.json(); } catch {}
  return { status: r.status, d };
};

(async () => {
  await ensureReady();
  const server = http.createServer(serverlessHandler);
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  const admin = (await J('POST', '/api/auth/login', { body: { email: OWNER_EMAIL, password: OWNER_PW } })).d;
  const out = {};

  if (MODE === 'env-report') {
    /* تقرير متغيرات البيئة + اتصال Upstash (زي tools/check-env.js بس جوه وضع Vercel) */
    const rep = await require('./deploy-env').report({ ping: true });
    out.storage = rep.storage;
    out.ownerFromEnv = rep.credentials.ownerFromEnv;
    out.ownerConfigured = rep.credentials.ownerConfigured;
    out.appUrl = rep.appUrl;
    out.ping = !!(rep.redis && rep.redis.ok);
    out.pingError = (rep.redis && rep.redis.error) || '';
    /* الدخول بيكون بإيميل/كلمة سر صاحب المطعم من البيئة — ومش بـ admin123 */
    out.loginWithEnvPassword = (await J('POST', '/api/auth/login', { body: { email: OWNER_EMAIL, password: OWNER_PW } })).status;
    out.loginWithDefault = (await J('POST', '/api/auth/login', { body: { email: 'admin@bbq.app', password: 'admin123' } })).status;
    const h = await J('GET', '/api/health');
    out.persistent = h.d.persistent;
    out.ownerFromEnvHealth = h.d.ownerFromEnv;
  } else if (MODE === 'first') {
    const boot = await J('GET', '/api/bootstrap');
    out.storage = boot.d.settings.storage;
    out.realtime = boot.d.settings.realtime;
    out.menu = boot.d.menu.length;

    await J('PATCH', '/api/admin/whatsapp', { token: admin.token, body: { enabled: true, provider: 'console' } });
    const cu = (await J('POST', '/api/auth/signup', { body: { name: 'عميل فيرسل', email: 'v@bbq.app', password: 'v123456', phone: '01011122233' } })).d;
    const ord = await J('POST', '/api/orders', {
      token: cu.token,
      body: { items: [{ id: 'm1', qty: 1 }, { id: 'f6', qty: 1 }],
        customer: { name: 'عميل فيرسل', phone: '01011122233', area: 'المعادي', address: 'شارع 9 برج 3' }, payment: 'cash' },
    });
    out.orderId = ord.d.order.id;
    out.total = ord.d.order.total;
    out.notifs = (await J('GET', '/api/notifications', { token: admin.token })).d.notifications.length;
    out.sse = (await J('GET', '/api/events', { token: admin.token })).status;

    /* رفع صورة (multipart) → لازم تتخزن في قاعدة البيانات */
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
    const b = '----t' + Date.now();
    const payload = Buffer.concat([
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="image"; filename="t.png"\r\nContent-Type: image/png\r\n\r\n`),
      png, Buffer.from(`\r\n--${b}--\r\n`),
    ]);
    const up = await J('POST', '/api/admin/menu/s2/image', {
      token: admin.token, raw: payload, headers: { 'content-type': 'multipart/form-data; boundary=' + b },
    });
    out.image = up.d.item.image;
    const img = await fetch(BASE + out.image);
    out.imgStatus = img.status;
    out.imgBytes = (await img.arrayBuffer()).byteLength;
  } else {
    out.login = (await J('POST', '/api/auth/login', { body: { email: OWNER_EMAIL, password: OWNER_PW } })).status;
    const ords = await J('GET', '/api/admin/orders', { token: admin.token });
    out.orders = ords.d.orders.length;
    out.orderId = ords.d.orders[0] && ords.d.orders[0].id;
    const cu = (await J('POST', '/api/auth/login', { body: { email: 'v@bbq.app', password: 'v123456' } })).d;
    out.mine = (await J('GET', '/api/orders/mine', { token: cu.token })).d.orders.length;
    out.notifs = (await J('GET', '/api/notifications', { token: admin.token })).d.notifications.length;
    out.waLog = (await J('GET', '/api/admin/whatsapp/log', { token: admin.token })).d.log.length;
    const boot = await J('GET', '/api/bootstrap');
    out.image = boot.d.menu.find((m) => m.id === 's2').image;
    const img = await fetch(BASE + out.image);
    out.imgStatus = img.status;
    out.sales = (await J('GET', '/api/admin/stats', { token: admin.token })).d.today.sales;
  }

  server.close();
  console.log(JSON.stringify(out));   // آخر سطر = النتيجة
  process.exit(0);
})().catch((e) => { console.error('runner error:', e.message); process.exit(1); });
