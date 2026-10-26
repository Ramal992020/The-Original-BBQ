/* ============================================================================
   test-supabase.js — الدورة الكاملة على تخزين Supabase PostgreSQL
   التشغيل:  npm run test:supabase
   ----------------------------------------------------------------------------
   بيشتغل على محاكي محلي مطابق لواجهة supabase/migrations (tools/fake-supabase.js)
   — مش اتصال سحابي حقيقي — وبيغطي:
     ١) عميل حقيقي يسجّل حساب → يطلب → الطلب يظهر للإدارة بإشعار → تغيير الحالة
        يوصل للعميل، والأسعار بتتحسب على السيرفر، ونظام الدخول الحالي زي ما هو.
     ٢) منع تكرار الطلب عند إعادة المحاولة (Idempotency-Key + قيد فريد في القاعدة).
     ٣) نسخ عاملة متعددة + فشل حفظ/ضياع لوك/انقطاع قاعدة → مفيش نجاح قبل الحفظ
        ومفيش نصف بيانات (الطلب معا الإشعار معا رسالة الواتساب مع بعض).
     ٤) البيانات بتفضل موجودة بعد إعادة التشغيل، والكلمات السر والتوكنات مش بتتخزن
        نصًا صريحًا.
   ========================================================================== */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { once } = require('events');
const fake = require('../tools/fake-supabase');

const ROOT = path.join(__dirname, '..');
const OWNER = 'aliielramal@gmail.com';
const PASSWORD = 'supabase-owner-password';
const SERVICE_KEY = 'test-only-service-role-key-0123456789abcdef';
const CLIENT = { name: 'عميل حقيقي', email: 'customer@example.com', password: 'customer-password', phone: '01012345678' };
const ORDER = {
  items: [{ id: 'm1', qty: 2, addons: [{ name: 'زيادة أرز', price: -5000 }], note: 'حار' }, { id: 'f6', qty: 1 }],
  customer: { name: 'عميل حقيقي', phone: '01012345678', area: 'المعادي', address: 'شارع النصر، عمارة ٥، الدور الثاني' },
  payment: 'cash',
};

let fakeUrl = '';

async function worker(t, env = {}) {
  const script = `
    const http = require('http');
    const { handle } = require('./server/index');
    const server = http.createServer((req, res) => handle(req, res));
    server.listen(0, '127.0.0.1', () => console.log('TEST_WORKER:' + server.address().port));
    process.on('SIGTERM', () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
  `;
  const proc = spawn(process.execPath, ['-e', script], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, BBQ_ENV_FILE: '', ADMIN_EMAIL: OWNER,
      ADMIN_PASSWORD: PASSWORD, ADMIN_PASSWORD_HASH: '', NODE_ENV: 'production',
      SEED_DEMO: '0', DEMO_LOGIN: '0', ALLOW_DEMO_PAYMENTS: '0', ALLOW_CONSOLE_MAIL: '0',
      VERCEL: '', AWS_LAMBDA_FUNCTION_NAME: '', STORAGE: '',
      UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '',
      SUPABASE_URL: fakeUrl, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
      RESEND_API_KEY: '', ...env,
    },
  });
  let output = '', errors = '';
  proc.stderr.on('data', (buf) => { errors += buf; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Worker startup timeout: ' + errors)), 15000);
    proc.stdout.on('data', (buf) => {
      output += buf;
      const match = /TEST_WORKER:(\d+)/.exec(output);
      if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
    });
    proc.once('exit', (code) => { clearTimeout(timeout); reject(new Error('Worker exited: ' + code + ' ' + errors)); });
  });
  const stop = async () => {
    if (proc.exitCode !== null || proc.signalCode !== null) return;
    const exited = once(proc, 'exit');
    proc.kill('SIGTERM'); await exited;
  };
  t.after(stop);
  return {
    stop,
    port,
    logs: () => output + errors,
    async req(method, route, { token, body, key } = {}) {
      const headers = {};
      if (token) headers.authorization = 'Bearer ' + token;
      if (key) headers['idempotency-key'] = key;
      if (body !== undefined) headers['content-type'] = 'application/json';
      const res = await fetch('http://127.0.0.1:' + port + route, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, data: await res.json() };
    },
  };
}

async function login(w, email = OWNER, password = PASSWORD) {
  const r = await w.req('POST', '/api/auth/login', { body: { email, password } });
  assert.equal(r.status, 200); return r.data;
}

let fakeServer = null;
test.before(async () => {
  fake.reset();
  fakeServer = await fake.start(0);
  fakeUrl = 'http://127.0.0.1:' + fakeServer.address().port;
});

test.after(async () => {
  fake.controls.offline = false;
  if (fakeServer) {
    fakeServer.closeAllConnections();
    await new Promise((r) => fakeServer.close(r));
  }
});

/* ١) الدورة الكاملة: تسجيل حقيقي → طلب محفوظ → إشعار إدارة → تتبّع الحالة */
test('real customer signup → saved order → admin notification → live status tracking', async (t) => {
  fake.reset();
  const a = await worker(t, {});   // STORAGE فاضية → كشف تلقائي لـ Supabase
  const b = await worker(t, {});   // نسخة عاملة دافئة تانية

  const boot = await b.req('GET', '/api/bootstrap');
  assert.equal(boot.status, 200);
  assert.equal(boot.data.settings.storage, 'postgres');
  assert.ok(boot.data.menu.length >= 40, 'menu=' + boot.data.menu.length);
  const health = await a.req('GET', '/api/health');
  assert.equal(health.data.storage, 'postgres');
  assert.equal(health.data.persistent, true);

  /* حساب المالك زي ما هو: «صاحب المطعم» + كلمة السر من البيئة (مش Supabase Auth) */
  const owner = await login(a);
  assert.equal(owner.user.name, 'صاحب المطعم');
  assert.equal(owner.user.role, 'admin');
  assert.equal(owner.user.isOwner, true);

  /* عميل حقيقي يسجّل حساب — أي حساب جديد = customer فقط */
  const registered = await b.req('POST', '/api/auth/signup', { body: { ...CLIENT, role: 'admin', isOwner: true } });
  assert.equal(registered.status, 201);
  const client = registered.data;
  assert.equal(client.user.role, 'customer');
  assert.equal(client.user.isOwner, false);

  /* الأسعار من السيرفر: إضافة بسعر سالب من العميل → سعر السيرفر (20) */
  const placed = await b.req('POST', '/api/orders', { token: client.token, body: ORDER, key: 'supabase-order-001' });
  assert.equal(placed.status, 201);
  const order = placed.data.order;
  assert.equal(order.id, 'BBQ-1001');
  assert.equal(order.user_id, client.user.id);
  assert.equal(order.status, 'new');
  assert.equal(order.items[0].addons[0].price, 20);
  assert.equal(order.subtotal, (240 + 20) * 2 + 120);   // 640
  assert.equal(order.delivery, 0);                       // فوق 300 → توصيل مجاني
  assert.equal(order.total, 640);

  /* إعادة المحاولة بنفس المفتاح = نفس الطلب بدون تكرار */
  const replay = await b.req('POST', '/api/orders', { token: client.token, body: ORDER, key: 'supabase-order-001' });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.reused, true);
  assert.equal(replay.data.order.id, order.id);
  const changed = await b.req('POST', '/api/orders', {
    token: client.token,
    body: { ...ORDER, customer: { ...ORDER.customer, address: 'عنوان مختلف تمامًا هنا' } },
    key: 'supabase-order-001',
  });
  assert.equal(changed.status, 409);

  /* الطلب محفوظ فعلاً + ظهر للإدارة مع الإشعار (من أي نسخة عاملة) */
  const adminOrders = await a.req('GET', '/api/admin/orders', { token: owner.token });
  assert.equal(adminOrders.data.orders.length, 1);
  assert.equal(adminOrders.data.orders[0].id, order.id);
  const notes = await a.req('GET', '/api/notifications', { token: owner.token });
  const newOrderNote = notes.data.notifications.find((n) => n.type === 'new_order' && n.orderId === order.id);
  assert.ok(newOrderNote, 'admin got a new_order notification');
  assert.ok(newOrderNote.body.includes(order.id) && newOrderNote.body.includes('640'));
  assert.equal((await b.req('GET', '/api/notifications', { token: client.token })).data.notifications.length, 0);

  /* العميل يتبع تغييرات حالته */
  for (const st of ['received', 'preparing', 'on_way']) {
    const upd = await a.req('PATCH', '/api/admin/orders/' + order.id + '/status', { token: owner.token, body: { status: st } });
    assert.equal(upd.status, 200);
    const mine = await b.req('GET', '/api/orders/mine', { token: client.token });
    assert.equal(mine.data.orders[0].status, st);
    assert.equal(mine.data.orders[0].history.at(-1).status, st);
  }

  /* الصلاحيات زي ما هي على السيرفر */
  assert.equal((await b.req('GET', '/api/admin/orders', { token: client.token })).status, 403);
  assert.equal((await b.req('PATCH', '/api/admin/orders/' + order.id + '/status', { token: client.token, body: { status: 'delivered' } })).status, 403);

  /* تعليم إشعار كمقروء */
  const read = await a.req('POST', '/api/notifications/read', { token: owner.token, body: { id: newOrderNote.id } });
  assert.equal(read.status, 200);
  const after = await a.req('GET', '/api/notifications', { token: owner.token });
  assert.equal(after.data.notifications.find((n) => n.id === newOrderNote.id).read, true);
});

/* ٢) التزامن والفشل: مفيش نجاح قبل الحفظ الفعلي، ومفيش نصف بيانات */
test('warm workers stay consistent; failed saves never report success or leave partial data', async (t) => {
  fake.reset();
  const a = await worker(t, {}), b = await worker(t, {});
  const owner = await login(a);
  const customer = (await b.req('POST', '/api/auth/signup', { body: CLIENT })).data;

  await a.req('PATCH', '/api/admin/whatsapp', { token: owner.token, body: { enabled: true, provider: 'link' } });

  /* فشل الحفظ = 503، والطلب مختفٍ تمامًا (بدون إشعار/رسالة واتساب) */
  fake.controls.failCommits = 1;
  const failed = await b.req('POST', '/api/orders', { token: customer.token, body: ORDER, key: 'atomic-001' });
  assert.equal(failed.status, 503);
  assert.equal(failed.data.code, 'STORAGE_UNAVAILABLE');
  assert.equal((await a.req('GET', '/api/admin/orders', { token: owner.token })).data.orders.length, 0);
  assert.equal((await a.req('GET', '/api/notifications', { token: owner.token })).data.notifications.length, 0);
  assert.equal((await a.req('GET', '/api/admin/whatsapp/log', { token: owner.token })).data.log.length, 0);

  /* إعادة المحاولة بنفس المفتاح بعد النجاح = نفس الطلب (مفيش تكرار) */
  const retry = await a.req('POST', '/api/orders', { token: customer.token, body: ORDER, key: 'atomic-001' });
  assert.equal(retry.status, 201);
  assert.equal(retry.data.order.id, 'BBQ-1001');
  assert.equal((await a.req('GET', '/api/admin/whatsapp/log', { token: owner.token })).data.log.length, 1); // بعد الحفظ فقط

  /* ضياع اللوك = ممنوع نكتب فوق غيرنا */
  fake.controls.loseLease = true;
  assert.equal((await b.req('POST', '/api/orders', { token: customer.token, body: ORDER, key: 'lost-lease-001' })).status, 503);
  assert.equal((await a.req('GET', '/api/admin/orders', { token: owner.token })).data.orders.length, 1);

  /* انقطاع القاعدة = 503 صريح (مفيش fallback مؤقت) */
  fake.controls.offline = true;
  assert.equal((await a.req('POST', '/api/auth/signup', { body: { ...CLIENT, email: 'offline@example.com' } })).status, 503);
  assert.equal((await b.req('GET', '/api/bootstrap')).status, 503);
  fake.controls.offline = false;
  assert.equal((await b.req('POST', '/api/auth/signup', { body: { ...CLIENT, email: 'offline@example.com' } })).status, 201);

  /* سباقات: إيميل مكرر → 201/409، وطلبات متوازية بأرقام فريدة */
  const duplicates = await Promise.all([a, b].map((w) => w.req('POST', '/api/auth/signup', { body: { ...CLIENT, email: 'same@example.com' } })));
  assert.deepEqual(duplicates.map((r) => r.status).sort(), [201, 409]);
  const races = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    (i % 2 ? a : b).req('POST', '/api/orders', { token: customer.token, body: ORDER, key: `parallel-order-${i}` })));
  assert.ok(races.every((r) => r.status === 201),
    JSON.stringify(races.map((r, i) => ({ i, status: r.status, err: r.data.error, code: r.data.code }))));
  assert.equal(new Set(races.map((r) => r.data.order.id)).size, 10);
  const both = await Promise.all([a, b].map((w) => w.req('POST', '/api/orders', { token: customer.token, body: ORDER, key: 'same-key-race' })));
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 201]);
  assert.equal(both[0].data.order.id, both[1].data.order.id);

  const all = (await a.req('GET', '/api/admin/orders', { token: owner.token })).data.orders;
  assert.equal(all.length, 12);
  assert.deepEqual(all.map((o) => o.number).sort((x, y) => x - y), Array.from({ length: 12 }, (_, i) => 1001 + i));
});

/* ٣) البقاء بعد إعادة التشغيل + عدم تخزين أسرار نصًا صريحًا */
test('data survives restarts; passwords and session tokens are never stored in clear text', async (t) => {
  fake.reset();
  const first = await worker(t, {});
  const owner = await login(first);
  const client = (await first.req('POST', '/api/auth/signup', { body: CLIENT })).data;
  const placed = await first.req('POST', '/api/orders', { token: client.token, body: ORDER, key: 'persist-001' });
  assert.equal(placed.status, 201);
  await first.stop();

  const cold = await worker(t, {});
  const owner2 = await login(cold);
  assert.equal((await cold.req('GET', '/api/admin/orders', { token: owner2.token })).data.orders[0].id, 'BBQ-1001');
  assert.equal((await cold.req('GET', '/api/orders/mine', { token: client.token })).data.orders.length, 1);
  assert.equal((await cold.req('GET', '/api/notifications', { token: owner2.token })).data.notifications.length, 1);

  /* الأسرار: الهاش بس في القاعدة — لا نص صريح لكلمة السر ولا للتوكن */
  const dump = JSON.stringify(fake.loadCollections());
  assert.ok(!dump.includes(PASSWORD), 'owner password not stored');
  assert.ok(!dump.includes(CLIENT.password), 'customer password not stored');
  assert.ok(!dump.includes(client.token), 'session token not stored (hash only)');
  const users = fake.tables.get('users');
  for (const row of users.values()) {
    if (row.data.hash) assert.match(row.data.hash, /^[a-f0-9]{128}$/);
    if (row.data.token) assert.fail('clear-text token found');
  }
});

/* ٤) وضع Vercel مع Supabase: دائم + SSE مرفوض (polling) */
test('serverless + Supabase runs persistent; SSE is refused in favour of polling', async (t) => {
  fake.reset();
  const w = await worker(t, { VERCEL: '1', APP_URL: 'https://bbq-test.vercel.app' });
  const owner = await login(w);
  const boot = await w.req('GET', '/api/bootstrap');
  assert.equal(boot.data.settings.storage, 'postgres');
  assert.equal(boot.data.settings.realtime, false);
  assert.equal(boot.data.settings.demoLogin, false);
  assert.equal((await w.req('GET', '/api/events', { token: owner.token })).status, 400);
  const health = await w.req('GET', '/api/health');
  assert.equal(health.data.persistent, true);
  assert.equal(health.data.ownerFromEnv, true);

  const client = (await w.req('POST', '/api/auth/signup', { body: CLIENT })).data;
  const placed = await w.req('POST', '/api/orders', { token: client.token, body: ORDER, key: 'serverless-001' });
  assert.equal(placed.status, 201);
  assert.equal((await w.req('GET', '/api/admin/orders', { token: owner.token })).data.orders.length, 1);
  const notes = (await w.req('GET', '/api/notifications', { token: owner.token })).data;
  assert.equal(notes.unread, 1);
});

/* ٥) الصور: تحميل كسول لمجموعة files — مش مع كل طلب، وجلب عند الطلب عبر bbq_get_row */
test('images are excluded from the full load and fetched on demand across workers', async (t) => {
  fake.reset();
  const a = await worker(t, {});
  const owner = await login(a);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const boundary = '----bbqtest' + Date.now();
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="t.png"\r\nContent-Type: image/png\r\n\r\n`),
    png, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const up = await fetch('http://127.0.0.1:' + a.port + '/api/admin/menu/s1/image', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + owner.token, 'content-type': 'multipart/form-data; boundary=' + boundary },
    body: payload,
  });
  const upJson = await up.json();
  assert.equal(up.status, 200, JSON.stringify(upJson));
  assert.match(upJson.item.image, /^\/api\/img\//);

  /* جلب الصورة بلا صلاحيات (روابط عامة بكاش طويل) — عبر bbq_get_row عند الطلب */
  const img = await fetch('http://127.0.0.1:' + a.port + upJson.item.image);
  assert.equal(img.status, 200);
  const imgBytes = new Uint8Array(await img.arrayBuffer());
  assert.ok(imgBytes.byteLength > 0);
  const missing = await fetch('http://127.0.0.1:' + a.port + '/api/img/does-not-exist');
  assert.equal(missing.status, 404);

  /* عامل جديد (cold): الصورة محفوظة رغم إن التحميل الكامل بقى بيستثني files */
  const b = await worker(t, {});
  const imgB = await fetch('http://127.0.0.1:' + b.port + upJson.item.image);
  assert.equal(imgB.status, 200);
  const imgBBytes = new Uint8Array(await imgB.arrayBuffer());
  assert.deepEqual(Array.from(imgBBytes), Array.from(imgBytes));

  /* التحميل الكامل فعلًا مش جايب الصور (الحِمل الثقيل اتشال من كل طلب) */
  assert.equal(fake.loadCollections({ includeFiles: false }).files, undefined);
  assert.ok((fake.loadCollections({ includeFiles: true }).files || []).length >= 1);
});
