/* Production-style tests: real HTTP workers, restarts, races and storage failures.
   Redis is emulated locally; these tests do not claim an external DB is connected. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { once } = require('events');
const fake = require('../tools/fake-upstash');

const ROOT = path.join(__dirname, '..');
const OWNER = 'aliielramal@gmail.com';
const PASSWORD = 'isolated-owner-password';
const CLIENT = { name: 'عميل حقيقي', email: 'customer@example.com', password: 'customer-password', phone: '01012345678' };
const ORDER = {
  items: [{ id: 'm1', qty: 1, price: 1 }],
  customer: { name: 'عميل حقيقي', phone: '01012345678', address: 'شارع النصر، عمارة ٥، الدور الثاني' },
  payment: 'cash', total: 1, status: 'delivered',
};

async function worker(t, env = {}) {
  const script = `
    const http = require('http');
    const { handle } = require('./server/index');
    const server = http.createServer(async (req, res) => {
      if (process.env.TEST_PREPARSED_BODY === '1' && req.headers['content-type'] === 'application/json') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        req.rawBody = Buffer.concat(chunks);
        req.body = JSON.parse(req.rawBody.toString() || '{}');
      }
      await handle(req, res);
    });
    server.listen(0, '127.0.0.1', () => console.log('TEST_WORKER:' + server.address().port));
    process.on('SIGTERM', () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
  `;
  const proc = spawn(process.execPath, ['-e', script], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, BBQ_ENV_FILE: '', STORAGE: 'file', ADMIN_EMAIL: OWNER,
      ADMIN_PASSWORD: PASSWORD, ADMIN_PASSWORD_HASH: '', NODE_ENV: 'production',
      SEED_DEMO: '0', DEMO_LOGIN: '0', ALLOW_DEMO_PAYMENTS: '0', ALLOW_CONSOLE_MAIL: '0',
      VERCEL: '', AWS_LAMBDA_FUNCTION_NAME: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '',
      SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '',
      RESEND_API_KEY: '', ...env,
    },
  });
  let output = '', errors = '';
  proc.stderr.on('data', (buf) => { errors += buf; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Worker startup timeout: ' + errors)), 10000);
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
    stop, logs: () => output + errors,
    async req(method, route, { token, body, key, raw } = {}) {
      const headers = {};
      if (token) headers.authorization = 'Bearer ' + token;
      if (key) headers['idempotency-key'] = key;
      if (body !== undefined || raw !== undefined) headers['content-type'] = 'application/json';
      const res = await fetch('http://127.0.0.1:' + port + route, {
        method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
      });
      return { status: res.status, data: await res.json(), headers: res.headers };
    },
  };
}
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbq-real-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
async function login(w, email = OWNER, password = PASSWORD) {
  const r = await w.req('POST', '/api/auth/login', { body: { email, password } });
  assert.equal(r.status, 200); return r.data;
}
async function redis(t) {
  fake.store.clear(); fake.controls.offline = false; fake.controls.failCommits = 0; fake.controls.loseLease = false;
  const server = await fake.start(0);
  t.after(async () => { fake.controls.offline = false; server.closeAllConnections(); await new Promise((r) => server.close(r)); });
  return {
    STORAGE: 'redis', VERCEL: '1', REDIS_PREFIX: 'real-tests:',
    UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:' + server.address().port,
    UPSTASH_REDIS_REST_TOKEN: 'test-only-token',
  };
}

// Each subtest uses private temporary state, never server/data or the user's password.
test('durable registration, owner security, order delivery, retries and restart', async (t) => {
  const dir = temp(t);
  const env = { BBQ_DATA_DIR: path.join(dir, 'data'), BBQ_UPLOAD_DIR: path.join(dir, 'uploads') };
  const w = await worker(t, env);
  const boot = await w.req('GET', '/api/bootstrap');
  assert.equal(boot.status, 200);
  assert.equal(boot.headers.get('cache-control'), 'no-store');
  assert.equal(boot.data.settings.demoLogin, false);
  assert.equal(boot.data.settings.onlinePayment.enabled, false);
  assert.ok(boot.data.settings.payments.every((p) => p.kind !== 'online'));
  assert.equal((await w.req('POST', '/api/auth/demo')).status, 403);
  assert.equal((await w.req('POST', '/api/auth/login', { body: { email: 'admin@bbq.app', password: 'admin123' } })).status, 401);
  const owner = await login(w, ' ALIIELRAMAL@GMAIL.COM ');
  assert.equal(owner.user.name, 'صاحب المطعم'); assert.equal(owner.user.role, 'admin'); assert.equal(owner.user.isOwner, true);
  assert.equal((await w.req('GET', '/api/admin/users', { token: owner.token })).data.users.length, 1);
  assert.equal((await w.req('POST', '/api/auth/signup', { body: { ...CLIENT, email: OWNER.toUpperCase() } })).status, 409);
  assert.equal((await w.req('POST', '/api/auth/signup', { body: { ...CLIENT, name: '' } })).status, 400);
  assert.equal((await w.req('POST', '/api/auth/signup', { body: { ...CLIENT, password: 'x'.repeat(129) } })).status, 400);
  assert.equal((await w.req('POST', '/api/auth/signup', { raw: '{invalid' })).status, 400);

  const registered = await w.req('POST', '/api/auth/signup', { body: { ...CLIENT, role: 'admin', isOwner: true } });
  assert.equal(registered.status, 201); const client = registered.data;
  assert.equal(client.user.role, 'customer'); assert.equal(client.user.isOwner, false);
  assert.equal(client.user.phone, CLIENT.phone);
  assert.equal((await w.req('POST', '/api/auth/signup', { body: { ...CLIENT, email: ' CUSTOMER@EXAMPLE.COM ' } })).status, 409);
  assert.equal((await w.req('GET', '/api/admin/orders', { token: client.token })).status, 403);
  assert.equal((await w.req('POST', '/api/orders', { body: ORDER })).status, 401);
  assert.equal((await w.req('POST', '/api/auth/forgot', { body: { email: CLIENT.email } })).status, 503);

  const invalidOrders = [
    { ...ORDER, items: [{ id: 'm1', qty: 1.5 }] },
    { ...ORDER, items: [{ id: 'm1', qty: 1 }, { id: 'missing', qty: 1 }] },
    { ...ORDER, items: { id: 'm1', qty: 1 } },
    { ...ORDER, payment: 'missing' }, { ...ORDER, payment: 'online' },
  ];
  for (const body of invalidOrders) assert.equal((await w.req('POST', '/api/orders', { token: client.token, body })).status, 400);
  const orderBody = { ...ORDER, user_id: owner.user.id };
  const placed = await w.req('POST', '/api/orders', { token: client.token, body: orderBody, key: 'retry-order-001' });
  assert.equal(placed.status, 201);
  const order = placed.data.order;
  assert.equal(order.id, 'BBQ-1001'); assert.equal(order.user_id, client.user.id); assert.equal(order.status, 'new');
  assert.equal(order.total, 260); assert.equal(order.items[0].price, 240);
  assert.equal(order.payment_status, 'unpaid');
  const replay = await w.req('POST', '/api/orders', { token: client.token, body: orderBody, key: 'retry-order-001' });
  assert.equal(replay.status, 200); assert.equal(replay.data.reused, true); assert.equal(replay.data.order.id, order.id);
  assert.equal((await w.req('POST', '/api/orders', { token: client.token, body: { ...orderBody, customer: { ...ORDER.customer, address: 'عنوان مختلف طويل' } }, key: 'retry-order-001' })).status, 409);
  const adminOrders = await w.req('GET', '/api/admin/orders', { token: owner.token });
  assert.equal(adminOrders.data.orders.length, 1); assert.equal(adminOrders.data.orders[0].id, order.id);
  const notes = await w.req('GET', '/api/notifications', { token: owner.token });
  assert.equal(notes.data.notifications.length, 1); assert.equal(notes.data.notifications[0].orderId, order.id);
  assert.equal((await w.req('GET', '/api/notifications', { token: client.token })).data.notifications.length, 0);
  assert.equal((await w.req('PATCH', '/api/admin/orders/' + order.id + '/status', { token: owner.token, body: { status: 'preparing' } })).status, 200);
  assert.equal((await w.req('GET', '/api/orders/mine', { token: client.token })).data.orders[0].status, 'preparing');
  assert.equal((await w.req('GET', '/api/orders/mine?token=' + client.token)).status, 401);

  const another = (await w.req('POST', '/api/auth/signup', { body: { ...CLIENT, email: 'other@example.com' } })).data;
  assert.equal((await w.req('GET', '/api/orders/' + order.id, { token: another.token })).status, 403);
  await w.req('PATCH', '/api/admin/users/' + another.user.id, { token: owner.token, body: { role: 'admin' } });
  const secondAdmin = await login(w, 'other@example.com', CLIENT.password);
  assert.equal((await w.req('PATCH', '/api/admin/users/' + owner.user.id, { token: secondAdmin.token, body: { role: 'customer' } })).status, 400);
  assert.equal((await w.req('PATCH', '/api/admin/users/' + owner.user.id, { token: secondAdmin.token, body: { active: false } })).status, 400);
  assert.equal((await w.req('POST', '/api/auth/password', { token: owner.token, body: { currentPassword: 'incorrect', password: 'changed-owner-password' } })).status, 400);
  const changed = await w.req('POST', '/api/auth/password', { token: owner.token, body: { currentPassword: PASSWORD, password: 'changed-owner-password' } });
  assert.equal(changed.status, 200);
  assert.equal((await w.req('GET', '/api/admin/orders', { token: owner.token })).status, 401);
  assert.equal((await w.req('GET', '/api/admin/orders', { token: changed.data.token })).status, 200);
  const file = path.join(env.BBQ_DATA_DIR, 'database.json');
  const saved = fs.readFileSync(file, 'utf8');
  assert.ok(!saved.includes(PASSWORD) && !saved.includes(CLIENT.password) && !saved.includes(client.token));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.match(JSON.parse(saved).collections.users[0].hash, /^[a-f0-9]{128}$/);
  await w.stop();
  const restarted = await worker(t, env); // Original bootstrap password must NOT overwrite the changed one.
  const ownerAfter = await login(restarted, OWNER, 'changed-owner-password');
  assert.equal((await restarted.req('POST', '/api/auth/login', { body: { email: OWNER, password: PASSWORD } })).status, 401);
  assert.equal((await restarted.req('GET', '/api/admin/orders', { token: ownerAfter.token })).data.orders[0].id, order.id);
  const mine = await restarted.req('GET', '/api/orders/mine', { token: client.token });
  assert.equal(mine.data.orders[0].status, 'preparing');
  const logout = await restarted.req('POST', '/api/auth/logout', { token: client.token });
  assert.equal(logout.status, 200);
  assert.equal((await restarted.req('GET', '/api/orders/mine', { token: client.token })).status, 401);

  // Corruption is never silently replaced by an empty database.
  const intact = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, '{corrupt');
  assert.equal((await restarted.req('GET', '/api/bootstrap')).status, 503);
  assert.equal(fs.readFileSync(file, 'utf8'), '{corrupt');
  fs.writeFileSync(file, intact);
  fs.chmodSync(env.BBQ_DATA_DIR, 0o500);
  try {
    assert.equal((await restarted.req('POST', '/api/auth/signup', { body: { ...CLIENT, email: 'not-saved@example.com' } })).status, 503);
  } finally { fs.chmodSync(env.BBQ_DATA_DIR, 0o700); }
  assert.equal((await restarted.req('POST', '/api/auth/signup', { body: { ...CLIENT, email: 'not-saved@example.com' } })).status, 201);
});

test('warm Redis workers share users, sessions, orders and updates; writes are atomic under races/failure', async (t) => {
  const env = await redis(t);
  const a = await worker(t, env), b = await worker(t, env);
  const owner = await login(a);
  const warm = await b.req('GET', '/api/bootstrap'); assert.equal(warm.data.settings.realtime, false);
  const customer = (await b.req('POST', '/api/auth/signup', { body: CLIENT })).data;
  assert.equal((await a.req('GET', '/api/auth/me', { token: customer.token })).data.user.id, customer.user.id);
  await a.req('PATCH', '/api/admin/whatsapp', { token: owner.token, body: { enabled: true, provider: 'link' } });
  fake.controls.failCommits = 1;
  const failed = await b.req('POST', '/api/orders', { token: customer.token, body: ORDER, key: 'atomic-retry-001' });
  assert.equal(failed.status, 503); assert.equal(failed.data.code, 'STORAGE_UNAVAILABLE');
  assert.equal((await a.req('GET', '/api/admin/orders', { token: owner.token })).data.orders.length, 0);
  assert.equal((await a.req('GET', '/api/notifications', { token: owner.token })).data.notifications.length, 0);
  assert.equal((await a.req('GET', '/api/admin/whatsapp/log', { token: owner.token })).data.log.length, 0); // No outbound confirmation before commit.
  const retry = await a.req('POST', '/api/orders', { token: customer.token, body: ORDER, key: 'atomic-retry-001' });
  assert.equal(retry.status, 201); assert.equal(retry.data.order.id, 'BBQ-1001');
  assert.equal((await a.req('GET', '/api/admin/whatsapp/log', { token: owner.token })).data.log.length, 1);
  assert.equal((await b.req('GET', '/api/admin/orders', { token: owner.token })).data.orders[0].id, retry.data.order.id);
  assert.equal((await a.req('PATCH', '/api/admin/orders/BBQ-1001/status', { token: owner.token, body: { status: 'on_way' } })).status, 200);
  assert.equal((await b.req('GET', '/api/orders/mine', { token: customer.token })).data.orders[0].status, 'on_way');
  fake.controls.loseLease = true;
  assert.equal((await b.req('POST', '/api/orders', { token: customer.token, body: ORDER, key: 'lost-lease-001' })).status, 503);
  assert.equal((await a.req('GET', '/api/admin/orders', { token: owner.token })).data.orders.length, 1);

  const duplicates = await Promise.all([a, b].map((w) => w.req('POST', '/api/auth/signup', { body: { ...CLIENT, email: 'same@example.com' } })));
  assert.deepEqual(duplicates.map((r) => r.status).sort(), [201, 409]);
  const signups = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? a : b).req('POST', '/api/auth/signup', { body: { ...CLIENT, email: `race${i}@example.com` } })));
  assert.ok(signups.every((r) => r.status === 201));
  const races = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).req('POST', '/api/orders', { token: customer.token, body: ORDER, key: `parallel-order-${i}` })));
  assert.ok(races.every((r) => r.status === 201));
  assert.equal(new Set(races.map((r) => r.data.order.id)).size, 12);
  const repeated = await Promise.all([a, b].map((w) => w.req('POST', '/api/orders', { token: customer.token, body: ORDER, key: 'simultaneous-retry-001' })));
  assert.deepEqual(repeated.map((r) => r.status).sort(), [200, 201]);
  assert.equal(repeated[0].data.order.id, repeated[1].data.order.id);
  const all = (await a.req('GET', '/api/admin/orders', { token: owner.token })).data.orders;
  assert.equal(all.length, 14); assert.equal(new Set(all.map((o) => o.number)).size, 14);
  assert.deepEqual(all.map((o) => o.number).sort((x, y) => x - y), Array.from({ length: 14 }, (_, i) => 1001 + i));
  const users = (await b.req('GET', '/api/admin/users', { token: owner.token })).data.users;
  assert.equal(users.length, 11);
  assert.equal((await b.req('GET', '/api/notifications', { token: owner.token })).data.notifications.filter((n) => n.type === 'new_order').length, 14);

  // A database outage cannot switch a warm worker to /tmp or report success.
  fake.controls.offline = true;
  assert.equal((await a.req('POST', '/api/auth/signup', { body: { ...CLIENT, email: 'offline@example.com' } })).status, 503);
  assert.equal((await b.req('GET', '/api/bootstrap')).status, 503);
  fake.controls.offline = false;
  assert.equal((await b.req('POST', '/api/auth/signup', { body: { ...CLIENT, email: 'offline@example.com' } })).status, 201);
  const manifest = fake.store.get('real-tests:collections');
  fake.store.set('real-tests:collections', 'corrupt-json');
  assert.equal((await a.req('GET', '/api/bootstrap')).status, 503);
  assert.equal(fake.store.get('real-tests:collections'), 'corrupt-json');
  fake.store.set('real-tests:collections', manifest);
  assert.equal((await b.req('GET', '/api/orders/mine', { token: customer.token })).data.orders.length, 14);
  await a.stop(); await b.stop();
  const cold = await worker(t, env);
  assert.equal((await cold.req('GET', '/api/orders/mine', { token: customer.token })).data.orders.length, 14);
});

test('serverless storage/owner misconfiguration fails closed and never writes temporary data', async (t) => {
  const dir = temp(t);
  const dataDir = path.join(dir, 'must-not-exist');
  for (const storage of ['redis', 'file']) {
    const w = await worker(t, { VERCEL: '1', STORAGE: storage, BBQ_DATA_DIR: dataDir });
    const r = await w.req('GET', '/api/health');
    assert.equal(r.status, 503); assert.equal(r.data.code, 'STORAGE_UNAVAILABLE');
    /* الـ503 بيشرح نفسه: تقرير تشخيص عام + سبب واضح، من غير أي قيمة سرية. */
    assert.ok(r.data.setup && r.data.setup.serverless === true, '503 carries a public setup report');
    /* التوصية الحالية Supabase؛ STORAGE=redis الصريح لسه بيطلب بيانات Upstash. */
    const legacyRedis = storage === 'redis';
    const expected = legacyRedis
      ? ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']
      : ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
    for (const key of expected) {
      assert.ok(r.data.setup.missing.includes(key), `missing lists ${key}`);
    }
    assert.ok((r.data.detail || '').includes(legacyRedis ? 'Upstash' : 'Supabase'), '503 carries the human-readable reason');
    assert.ok(!JSON.stringify(r.data).includes(PASSWORD), 'setup report never leaks secret values');
    assert.equal(fs.existsSync(dataDir), false);
    assert.equal((await w.req('POST', '/api/auth/signup', { body: CLIENT })).status, 503);
    await w.stop();
  }
  const w = await worker(t, { BBQ_DATA_DIR: path.join(dir, 'no-owner'), BBQ_UPLOAD_DIR: path.join(dir, 'uploads'), ADMIN_PASSWORD: '' });
  const r = await w.req('GET', '/api/bootstrap');
  assert.equal(r.status, 503); assert.equal(r.data.code, 'OWNER_NOT_CONFIGURED');
  assert.ok(r.data.setup && r.data.setup.missing.includes('ADMIN_PASSWORD'), 'missing lists ADMIN_PASSWORD');
  assert.ok((r.data.detail || '').includes('ADMIN_PASSWORD'), 'reason mentions ADMIN_PASSWORD');
  assert.equal(fs.existsSync(path.join(dir, 'no-owner', 'database.json')), false);
});

test('legacy migration preserves customers/orders, provisions the owner even with existing users, disables known demo credentials', async (t) => {
  const dir = temp(t), dataDir = path.join(dir, 'data'); fs.mkdirSync(dataDir);
  const hash = (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
  };
  const legacy = [
    { id: 'legacy-admin', email: 'admin@bbq.app', name: 'أدمن قديم', role: 'admin', active: true, ...hash('admin123') },
    { id: 'legacy-customer', email: CLIENT.email, name: CLIENT.name, role: 'customer', active: true, ...hash(CLIENT.password) },
    { id: 'real-supervisor', email: 'supervisor@bbq.app', name: 'مشرف فعلي', role: 'supervisor', active: true, ...hash('privately-changed-password') },
  ];
  fs.writeFileSync(path.join(dataDir, 'users.json'), JSON.stringify(legacy));
  fs.writeFileSync(path.join(dataDir, 'orders.json'), JSON.stringify([{ id: 'BBQ-1042', number: 1042, user_id: 'legacy-customer', status: 'new', total: 260, items: [], customer: ORDER.customer }]));
  const w = await worker(t, { BBQ_DATA_DIR: dataDir, BBQ_UPLOAD_DIR: path.join(dir, 'uploads') });
  const owner = await login(w);
  assert.equal(owner.user.isOwner, true);
  const users = (await w.req('GET', '/api/admin/users', { token: owner.token })).data.users;
  assert.equal(users.find((u) => u.id === 'legacy-admin').active, false);
  assert.equal(users.find((u) => u.id === 'real-supervisor').active, true);
  const customer = await login(w, CLIENT.email, CLIENT.password);
  const orders = (await w.req('GET', '/api/orders/mine', { token: customer.token })).data.orders;
  assert.equal(orders.length, 1); assert.equal(orders[0].id, 'BBQ-1042');
  const placed = await w.req('POST', '/api/orders', { token: customer.token, body: ORDER });
  assert.equal(placed.status, 201); assert.equal(placed.data.order.id, 'BBQ-1043');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'users.json'), 'utf8')).length, 3); // Original files kept.
  assert.ok(fs.existsSync(path.join(dataDir, 'database.json')));
});


test('pre-parsed serverless JSON bodies still support registration/login/orders and signed raw-body webhooks', async (t) => {
  const dir = temp(t);
  const w = await worker(t, { TEST_PREPARSED_BODY: '1', BBQ_DATA_DIR: path.join(dir, 'data'), BBQ_UPLOAD_DIR: path.join(dir, 'uploads') });
  const owner = await login(w);
  const signup = await w.req('POST', '/api/auth/signup', { body: CLIENT });
  assert.equal(signup.status, 201);
  const placed = await w.req('POST', '/api/orders', { token: signup.data.token, body: ORDER });
  assert.equal(placed.status, 201);
  assert.equal((await w.req('GET', '/api/admin/orders', { token: owner.token })).data.orders.length, 1);
  const secret = 'isolated-webhook-secret';
  await w.req('PATCH', '/api/admin/payments', { token: owner.token, body: { provider: 'stripe', stripe: { webhookSecret: secret } } });
  // Unlike JSON.stringify(req.body), req.rawBody preserves the exact signed bytes.
  const raw = ' { "type": "checkout.session.completed", "data": { "object": { "id": "test-session", "payment_status": "paid", "metadata": { "order_id": "BBQ-1001" } } } } ';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac('sha256', secret).update(timestamp + '.' + raw).digest('hex');
  const port = /TEST_WORKER:(\d+)/.exec(w.logs())[1];
  const result = await fetch('http://127.0.0.1:' + port + '/api/webhooks/stripe', {
    method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 't=' + timestamp + ',v1=' + signature }, body: raw,
  });
  assert.equal(result.status, 200); assert.equal((await result.json()).ok, true);
});
