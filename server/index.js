/* ============================================================================
   index.js — السيرفر الرئيسي (API + الملفات الثابتة)
   ----------------------------------------------------------------------------
   - بدون أي مكتبات خارجية: تشغيل بـ `npm start` أو `node server/index.js`
   - كل الصلاحيات بتتفحص هنا على السيرفر (Backend) مش بس إخفاء أزرار.
   - إشعارات فورية للـAdmin/Supervisor عبر SSE (Server-Sent Events).
   ========================================================================== */
'use strict';
require('./env').load();
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const auth = require('./auth');
const seed = require('./seed');
const mail = require('./mail');
const ai = require('./ai');
const whatsapp = require('./whatsapp');
const payments = require('./payments');
const imagekit = require('./imagekit');
const deployEnv = require('./deploy-env');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/* Vercel = سيرفرلس: مفيش SSE ولا قرص ثابت (بنستخدم Upstash Redis في التخزين) */
const SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const REALTIME = !SERVERLESS;

let readyPromise = null;
/** لازم تتنادى قبل معالجة أي طلب: بتحمّل البيانات وتزرع البيانات الأولية مرة واحدة */
function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await store.init();
      await store.transaction(() => seed.seed());
      /* كلمات سر الطاقم من متغيرات البيئة (ADMIN_PASSWORD / SUPERVISOR_PASSWORD)
         بتتوفّر مع كل إقلاع لحين ما يتغيّر من اللوحة — في ترانزاكشن منفصلة عشان
         الكتابة في المتجر لازم تكون جوه store.transaction(). */
      await store.transaction(() => deployEnv.syncCredentials());
      return true;
    })().catch((e) => {
      readyPromise = null;
      throw e;
    });
  }
  return readyPromise;
}

/* ============================== أدوات مساعدة ============================== */

const isInside = (parent, child) => {
  const rel = path.relative(parent, child);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

function readBody(req, limit = 12 * 1024 * 1024) {
  // Some serverless runtimes supply the raw body after consuming the stream.
  const supplied = req.rawBody ?? (Buffer.isBuffer(req.body) || typeof req.body === 'string' ? req.body : undefined);
  if (supplied !== undefined) {
    const buffer = Buffer.isBuffer(supplied) ? supplied : Buffer.from(String(supplied));
    return buffer.length > limit ? Promise.reject(new Error('too_large')) : Promise.resolve(buffer);
  }
  if (req.readableEnded) return Promise.reject(Object.assign(new Error('تعذر قراءة بيانات الطلب الخام'), { status: 400 }));
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function jsonBody(req) {
  let data;
  try {
    /* Vercel may provide req.body as an already-parsed JSON object. */
    if (req.body !== undefined && !Buffer.isBuffer(req.body) && typeof req.body !== 'string') {
      data = req.body;
    } else {
      const buf = await readBody(req);
      data = buf.length ? JSON.parse(buf.toString('utf8')) : {};
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid_json');
    return data;
  } catch (e) {
    if (e.message === 'too_large') throw e;
    throw Object.assign(new Error('بيانات الطلب غير صالحة'), { status: 400 });
  }
}

const settings = () => store.find('settings', (s) => s.id === 'main') || seed.SEED_SETTINGS;

/* نسخة عامة من الإعدادات (بدون أي حاجة حساسة) */
const maskSecret = (v) => (v ? '••••••' + String(v).slice(-4) : '');

function publicSettings() {
  const s = settings();
  const pc = s.paymentConfig || {};
  const methods = (s.payments || []).filter((x) => x.enabled !== false && (x.kind !== 'online' || payments.onlineReady()));
  return {
    name: s.name, tagline: s.tagline, currency: s.currency, phone: s.phone, whatsapp: s.whatsapp,
    address: s.address, hoursText: s.hoursText, openHour: s.openHour, closeHour: s.closeHour,
    forceState: s.forceState, deliveryFee: s.deliveryFee, freeDeliveryOver: s.freeDeliveryOver,
    minOrder: s.minOrder, deliveryEta: s.deliveryEta, promos: s.promos,
    addons: s.addons, statuses: s.statuses, imageLibrary: s.imageLibrary, aiAutoImages: s.aiAutoImages,
    /* طرق الدفع المتاحة للعميل (المفعّلة بس) — من غير أي مفاتيح */
    payments: methods
      .map((x) => ({ id: x.id, label: x.label, kind: x.kind || 'cod', note: x.note || '' })),
    onlinePayment: {
      enabled: methods.some((x) => x.kind === 'online'),
      provider: pc.provider || 'demo',
      currency: pc.currency || 'EGP',
      isDemo: (pc.provider || 'demo') === 'demo',
    },
    whatsappNotify: {
      enabled: !!(s.whatsappNotify && s.whatsappNotify.enabled),
      provider: (s.whatsappNotify && s.whatsappNotify.provider) || 'console',
      requireOptIn: !s.whatsappNotify || s.whatsappNotify.requireOptIn !== false,
    },
    /* realtime=false معناها إن السيرفر سيرفرلس → الواجهة بتستخدم polling بدل SSE */
    realtime: REALTIME,
    storage: store.MODE,
    demoLogin: auth.DEMO_OPEN,
  };
}

const menuPublic = () => store.all('menu').filter((m) => m.active !== false);

function orderItemsFlat(order) {
  return order.items.map((i, idx) => ({
    id: `${order.id}-${idx + 1}`,
    order_id: order.id, menu_item_id: i.id, name: i.name,
    qty: i.qty, price: i.price, line_total: i.line_total, addons: i.addons || [], note: i.note || '',
  }));
}

function notifyStaff({ type, title, body, orderId, extra = {} }) {
  const staff = store.filter('users', (u) => (u.role === 'admin' || u.role === 'supervisor') && u.active !== false);
  const notes = staff.map((u) => store.insert('notifications', {
    id: store.uid(), userId: u.id, type, title, body, orderId: orderId || null,
    read: false, createdAt: new Date().toISOString(), ...extra,
  }));
  sseBroadcast(staff.map((u) => u.id), { kind: 'notification', items: notes });
  return notes;
}

/* Optional outbound messages run only AFTER the order/status is safely saved. */
function afterOrderCommit(work) {
  if (settings().whatsappNotify?.enabled) store.afterCommit(() => store.transaction(work));
}

/* ============================== SSE للإشعارات ============================== */
const sseClients = new Set();   // { res, userId, role }

function sseSend(res, data) {
  try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch { /* العميل قفل */ }
}
function sseBroadcast(userIds, payload) {
  store.afterCommit(() => {
    for (const c of sseClients) {
      if (!userIds || userIds.includes(c.userId)) {
        if (!auth.sessionUser(c.req)) { c.res.end(); sseClients.delete(c); continue; }
        sseSend(c.res, payload);
      }
    }
  });
}

/* ============================== الطلبات ============================== */
function computeTotals(items, promoCode) {
  const s = settings();
  const menu = store.all('menu');
  let subtotal = 0;
  const lines = [];
  const invalid = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!Array.isArray(items) || items.length > 100) invalid('بيانات السلة غير صالحة');
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') invalid('بيانات الصنف غير صالحة');
    const m = menu.find((x) => String(x.id) === String(raw.id));
    if (!m || m.active === false || m.available === false || m.noPrice || !Number.isFinite(Number(m.price)) || Number(m.price) <= 0) {
      invalid('صنف في السلة غير متاح للطلب — راجع المنيو');
    }
    const qty = raw.qty === undefined ? 1 : Number(raw.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) invalid('الكمية لازم تكون من ١ إلى ٥٠');
    if (raw.addons !== undefined && (!Array.isArray(raw.addons) || raw.addons.length > 10)) invalid('الإضافات غير صالحة');

    /* الإضافات: بناخد الاسم من العميل وبناخد السعر من الإعدادات بتاعة السيرفر
       (كده محدش يقدر يغيّر سعر الإضافات من المتصفح) */
    const allowed = (s.addons && (s.addons[m.cat] || s.addons.default)) || [];
    const addons = [];
    for (const rawAddon of raw.addons || []) {
      const name = typeof rawAddon === 'string' ? rawAddon : (rawAddon && rawAddon.name);
      if (!name) continue;
      const found = allowed.find((a) => a.name === name);
      if (found && !addons.some((a) => a.name === found.name)) addons.push({ name: found.name, price: Number(found.price) || 0 });
    }
    const unit = Number(m.price || 0) + addons.reduce((x, a) => x + a.price, 0);
    const line_total = unit * qty;
    subtotal += line_total;
    lines.push({
      id: m.id, name: m.name, image: m.image, cat: m.cat,
      qty, price: Number(m.price || 0), addons, note: String(raw.note || '').slice(0, 200),
      unit_price: unit, line_total,
    });
  }

  let delivery = lines.length ? Number(s.deliveryFee || 0) : 0;
  let discount = 0;
  const promo = (s.promos || []).find((p) => p.code.toUpperCase() === String(promoCode || '').toUpperCase());
  if (promo && subtotal >= (promo.min || 0)) {
    if (promo.type === 'percent') discount = Math.round(subtotal * promo.value / 100);
    else if (promo.type === 'fixed') discount = Math.min(promo.value, subtotal);
    else if (promo.type === 'freedelivery') delivery = 0;
  }
  if (s.freeDeliveryOver > 0 && subtotal >= s.freeDeliveryOver) delivery = 0;
  const total = Math.max(0, subtotal + delivery - discount);
  return { lines, subtotal, delivery, discount, total, promo: promo ? promo.code : null };
}

function orderPaymentInfo(order) {
  const method = (settings().payments || []).find((m) => m.id === order.payment);
  const required = method?.kind === 'online' && order.payment_status !== 'paid';
  return {
    required: !!required, url: required ? order.paymentUrl || null : null,
    provider: order.paymentProvider || null, mode: order.paymentProvider === 'paymob' ? 'iframe' : 'redirect',
  };
}

/* ============================== الراوتات ============================== */
async function api(req, res, u, url) {
  const p = url.pathname;
  const q = url.searchParams;
  /* The response is returned to handle(); it is sent ONLY AFTER durable commit. */
  const send = (code, data) => ({ code, data });
  const bad = (code, msg) => send(code, { error: msg });

  /* ------------------------------- عام ------------------------------- */
  if (p === '/api/health') {
    /* فحص سريع للنشر — من غير أي قيمة سرية.
       persistent = هل البيانات فعلاً بتعيش بعد إعادة التشغيل؟ */
    const appUrl = String(process.env.APP_URL || '').trim();
    return send(200, {
      ok: true,
      time: new Date().toISOString(),
      serverless: SERVERLESS,
      realtime: REALTIME,
      storage: store.MODE,                                  // postgres | redis | file
      persistent: store.MODE !== 'file' || !SERVERLESS,     // سيرفرلس من غير قاعدة سحابية = مش دائم
      appUrl: !!appUrl,
      ownerFromEnv: !!String(process.env.ADMIN_PASSWORD || '').trim() || !!String(process.env.ADMIN_PASSWORD_HASH || '').trim(),
    });
  }

  if (p === '/api/bootstrap') {
    return send(200, {
      settings: publicSettings(),
      categories: store.all('categories').filter((c) => c.active !== false).sort((a, b) => a.sort - b.sort),
      menu: menuPublic().sort((a, b) => (a.sort || 0) - (b.sort || 0)),
      user: auth.publicUser(u),
    });
  }

  /* ------------------------------ الحسابات ----------------------------- */
  if (p === '/api/auth/signup' && req.method === 'POST') {
    const b = await jsonBody(req);
    const email = String(b.email || '').trim().toLowerCase();
    if (!auth.validEmail(email)) return bad(400, 'إيميل غير صالح');
    if (!auth.validPassword(b.password)) return bad(400, 'كلمة السر لازم تكون من ٦ إلى ١٢٨ حرف');
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (name.length < 2 || name.length > 120) return bad(400, 'اكتب اسمك من ٢ إلى ١٢٠ حرف');
    if (email === auth.OWNER_EMAIL) return bad(409, 'البريد ده مخصص لحساب صاحب المطعم');
    if (b.phone && (typeof b.phone !== 'string' || !/^[+\d\s()-]{10,30}$/.test(b.phone) || b.phone.replace(/\D/g, '').length < 10 || b.phone.replace(/\D/g, '').length > 15)) return bad(400, 'رقم الهاتف غير صالح');
    if (auth.byEmail(email)) return bad(409, 'الإيميل ده مسجل بالفعل');
    const user = auth.createUser({ name, email, password: b.password, role: 'customer' });  // أي مستخدم جديد = Customer
    if (b.phone) store.update('users', user.id, { phone: String(b.phone).trim() });
    const s = auth.createSession(user, { ua: req.headers['user-agent'] });
    store.afterCommit(() => console.log(`👤 مستخدم جديد: ${email}`));
    return send(201, { token: s.token, user: auth.publicUser(auth.byId(user.id)) });
  }

  if (p === '/api/auth/login' && req.method === 'POST') {
    const b = await jsonBody(req);
    const email = String(b.email || '').trim().toLowerCase();
    if (!auth.validEmail(email) || !auth.validPassword(b.password)) return bad(401, 'الإيميل أو كلمة السر غلط');
    if (auth.tooManyAttempts(email)) return bad(429, 'محاولات كتير — استنى ربع ساعة وجرّب تاني');
    const user = auth.byEmail(email);
    const ok = user && user.salt && auth.verifyPassword(b.password || '', user.salt, user.hash);
    auth.noteAttempt(email, !!ok);
    if (!ok) return bad(401, 'الإيميل أو كلمة السر غلط');
    if (user.active === false) return bad(403, 'حسابك معطّل — كلّم الأدمن');
    const s = auth.createSession(user, { ua: req.headers['user-agent'] });
    return send(200, { token: s.token, user: auth.publicUser(user) });
  }

  if (p === '/api/auth/demo' && req.method === 'POST') {
    const user = auth.demoLogin();
    if (!user) return bad(403, 'الدخول التجريبي مقفول');
    const s = auth.createSession(user);
    return send(200, { token: s.token, user: auth.publicUser(user) });
  }

  if (p === '/api/auth/logout' && req.method === 'POST') {
    auth.destroySession(req);
    return send(200, { ok: true });
  }

  if (p === '/api/auth/me') return send(200, { user: auth.publicUser(u) });

  if (p === '/api/auth/forgot' && req.method === 'POST') {
    if (!mail.configured()) return bad(503, 'خدمة استعادة كلمة السر غير مفعّلة حاليًا — تواصل مع المطعم');
    const b = await jsonBody(req);
    const r = auth.resetToken(b.email);
    if (r) {
      const link = `${process.env.APP_URL || 'http://localhost:' + PORT}/#/reset?token=${r.token}`;
      const delivered = await mail.send({
        to: r.user.email, subject: `${settings().name} — استعادة كلمة السر`,
        text: `أهلًا ${r.user.name || ''}،\n\nلإعادة تعيين كلمة السر افتح الرابط ده (صالح ساعة واحدة):\n${link}\n\nلو مش إنت اللي طلبت، تجاهل الرسالة.`,
      });
      if (!delivered.ok) throw Object.assign(new Error('تعذر إرسال رسالة الاستعادة — جرّب لاحقًا'), { status: 503 });
    }
    return send(200, { ok: true, message: 'لو الإيميل مسجل عندنا، هتلاقي رسالة الاستعادة في بريدك.' });
  }

  if (p === '/api/auth/reset' && req.method === 'POST') {
    const b = await jsonBody(req);
    if (!auth.validPassword(b.password)) return bad(400, 'كلمة السر لازم تكون من ٦ إلى ١٢٨ حرف');
    const user = auth.consumeResetToken(String(b.token || ''), b.password);
    if (!user) return bad(400, 'الرابط غير صالح أو انتهت صلاحيته');
    return send(200, { ok: true, message: 'تم تغيير كلمة السر — سجّل الدخول من جديد' });
  }

  if (p === '/api/auth/password' && req.method === 'POST') {
    if (!u) return bad(401, 'محتاج تسجيل دخول');
    const b = await jsonBody(req);
    if (!auth.verifyPassword(b.currentPassword, u.salt, u.hash)) return bad(400, 'كلمة السر الحالية غلط');
    if (!auth.validPassword(b.password)) return bad(400, 'كلمة السر لازم تكون من ٦ إلى ١٢٨ حرف');
    const updated = auth.changePassword(u, b.password);
    const session = auth.createSession(updated, { ua: req.headers['user-agent'] });
    return send(200, { token: session.token, user: auth.publicUser(updated) });
  }

  let whatsappPref = null;
  if (p === '/api/me' && req.method === 'PATCH') {
    if (!u) return bad(401, 'محتاج تسجيل دخول');
    const b = await jsonBody(req);
    const patch = {};
    for (const k of ['name', 'phone', 'area', 'address']) {
      if (b[k] != null) patch[k] = String(b[k]).slice(0, 300);
    }
    if (b.notifyWhatsapp != null) { patch.notifyWhatsapp = !!b.notifyWhatsapp; whatsappPref = patch.notifyWhatsapp; }
    const updated = store.update('users', u.id, patch);
    return send(200, { user: auth.publicUser(updated) });
  }

  /* ------------------------------ الطلبات ------------------------------ */
  if (p === '/api/orders' && req.method === 'POST') {
    if (!u) return bad(401, 'لازم تسجّل الدخول الأول عشان نربط الطلب بحسابك');
    const b = await jsonBody(req);
    const requestId = String(req.headers['idempotency-key'] || '');
    if (requestId && !/^[a-zA-Z0-9_-]{8,128}$/.test(requestId)) return bad(400, 'معرّف الطلب غير صالح');
    const requestHash = crypto.createHash('sha256').update(JSON.stringify({
      items: b.items, customer: b.customer, payment: b.payment || 'cash',
      promoCode: b.promoCode || '', notifyWhatsapp: b.notifyWhatsapp !== false,
    })).digest('hex');
    if (requestId) {
      const previous = store.find('orders', (o) => o.user_id === u.id && o.requestId === requestId);
      if (previous) {
        if (previous.requestHash !== requestHash) return bad(409, 'الطلب ده اتسجّل ببيانات مختلفة — راجع طلباتك');
        return send(200, { order: previous, items: orderItemsFlat(previous), payment: orderPaymentInfo(previous), reused: true });
      }
    }
    const c = b.customer || {};
    if (!String(c.name || '').trim() || String(c.name).trim().length < 2) return bad(400, 'الاسم مطلوب');
    if (String(c.phone || '').replace(/\D/g, '').length < 10) return bad(400, 'رقم الهاتف غير صالح');
    if (!String(c.address || '').trim() || String(c.address).trim().length < 5) return bad(400, 'العنوان مطلوب');

    const t = computeTotals(b.items, b.promoCode);
    if (!t.lines.length) return bad(400, 'السلة فاضية');
    const s = settings();
    if (t.subtotal < Number(s.minOrder || 0)) return bad(400, `أقل مبلغ للطلب ${s.minOrder} ${s.currency}`);

    /* طريقة الدفع: لازم تكون مفعّلة في الإعدادات */
    const method = (s.payments || []).find((x) => x.id === String(b.payment || 'cash') && x.enabled !== false);
    if (!method || (method.kind === 'online' && !payments.onlineReady())) return bad(400, 'طريقة الدفع غير متاحة حاليًا — اختار الدفع عند التوصيل');
    const isOnline = method.kind === 'online';

    const number = store.nextOrderNumber();
    const order = {
      id: 'BBQ-' + number,
      number,
      user_id: u.id,
      ...(requestId ? { requestId, requestHash } : {}),
      customer: {
        name: String(c.name).slice(0, 120), phone: String(c.phone).slice(0, 30),
        area: String(c.area || '').slice(0, 120), address: String(c.address).slice(0, 400),
        notes: String(c.notes || '').slice(0, 400), time: String(c.time || 'في أقرب وقت').slice(0, 60),
        email: u.email,
        notifyWhatsapp: b.notifyWhatsapp !== false && c.notifyWhatsapp !== false,
      },
      payment: method.id,
      paymentLabel: method.label,
      payment_status: isOnline ? 'pending' : 'unpaid',
      items: t.lines,
      subtotal: t.subtotal, delivery: t.delivery, discount: t.discount, total: t.total,
      promo: t.promo,
      status: 'new',                         // الحالة الأولى دايمًا: طلب جديد
      history: [{ status: 'new', at: new Date().toISOString(), by: u.id }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.insert('orders', order);

    /* لو الدفع أونلاين: رابط الدفع بيتولّد من السيرفر بالمبلغ المحسوب عندنا */
    let payInfo = null;
    if (isOnline) {
      try { payInfo = await payments.createPayment(order); }
      catch (e) { console.warn('[payments] فشل إنشاء رابط الدفع:', e.message); payInfo = null; }
    }
    const fresh = store.find('orders', (o) => o.id === order.id) || order;

    /* إشعار داخل التطبيق للـAdmin والـSupervisors فقط */
    notifyStaff({
      type: 'new_order',
      title: 'طلب جديد 🧾',
      body: `${fresh.id} · ${fresh.customer.name} · ${fresh.total} ${s.currency}${isOnline ? ' · دفع أونلاين' : ''}`,
      orderId: fresh.id,
      extra: { total: fresh.total, customer: fresh.customer.name, phone: fresh.customer.phone, payment: method.id },
    });
    store.afterCommit(() => console.log(`🧾 طلب جديد ${fresh.id} من ${fresh.customer.name} — ${fresh.total} ${s.currency} (${method.label})`));

    /* واتساب: تأكيد للعميل + إشعار للمطعم (لو مفعّل) + رابط الدفع */
    afterOrderCommit(() => Promise.all([
      whatsapp.notifyCustomer(fresh, 'new'), whatsapp.notifyStaffWhatsapp(fresh),
      ...(payInfo && payInfo.url ? [whatsapp.sendPaymentLink(fresh)] : []),
    ]));

    sseBroadcast([u.id], { kind: 'order:mine', orderId: fresh.id, status: fresh.status });
    return send(201, {
      order: fresh, items: orderItemsFlat(fresh),
      payment: orderPaymentInfo(fresh),
    });
  }

  if (p === '/api/orders/mine') {
    if (!u) return bad(401, 'محتاج تسجيل دخول');
    const rows = store.filter('orders', (o) => String(o.user_id) === String(u.id))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return send(200, { orders: rows });
  }

  let m = /^\/api\/orders\/([^/]+)(?:\/(\w+))?$/.exec(p);
  if (m) {
    if (!u) return bad(401, 'محتاج تسجيل دخول');
    const order = store.find('orders', (o) => o.id === decodeURIComponent(m[1]));
    if (!order) return bad(404, 'الطلب غير موجود');
    const owner = String(order.user_id) === String(u.id);
    if (!owner && !auth.isStaff(u)) return bad(403, 'مش مسموح لك تشوف الطلب ده');   // حماية على السيرفر

    if (m[2] === 'items') return send(200, { items: orderItemsFlat(order) });

    /* إنشاء/تجديد رابط الدفع لطلب معيّن */
    if (m[2] === 'pay' && req.method === 'POST') {
      if (!owner && !auth.isStaff(u)) return bad(403, 'غير مسموح');
      if (order.payment_status === 'paid') return send(200, { alreadyPaid: true, url: null });
      try {
        const info = await payments.createPayment(order);
        return send(200, { url: info.url, provider: info.provider, mode: info.mode, order: store.find('orders', (o) => o.id === order.id) });
      } catch (e) { return bad(500, e.message); }
    }

    /* التحقق من الدفع بعد رجوع العميل من صفحة الدفع (تأكيد حقيقي من المزوّد) */
    if (m[2] === 'verify' && req.method === 'POST') {
      if (!owner && !auth.isStaff(u)) return bad(403, 'غير مسموح');
      const out = await payments.verifyPayment(order);
      const fresh = store.find('orders', (o) => o.id === order.id) || order;
      if (out.status === 'paid' && order.payment_status !== 'paid') {
        afterOrderCommit(() => whatsapp.notifyPaid(fresh));
        notifyStaff({ type: 'payment_paid', title: 'تم دفع طلب 💳', body: `${fresh.id} · ${fresh.customer.name} · ${fresh.total} ${settings().currency}`, orderId: fresh.id });
        sseBroadcast([fresh.user_id], { kind: 'order:mine', orderId: fresh.id, status: fresh.status });
      }
      return send(200, { status: out.status, order: fresh, provider: out.provider });
    }
    if (m[2] === 'cancel' && req.method === 'POST') {
      if (!owner && !auth.isStaff(u)) return bad(403, 'غير مسموح');
      if (owner && !['new', 'received'].includes(order.status)) return bad(400, 'الطلب بدأ تجهيزه — كلّم المطعم');
      const updated = store.update('orders', order.id, {
        status: 'cancelled', updatedAt: new Date().toISOString(),
        history: [...(order.history || []), { status: 'cancelled', at: new Date().toISOString(), by: u.id }],
      });
      sseBroadcast([order.user_id], { kind: 'order:mine', orderId: order.id, status: 'cancelled' });
      notifyStaff({ type: 'order_cancelled', title: 'طلب اتلغى ✖️', body: `${order.id} · ${order.customer.name}`, orderId: order.id });
      afterOrderCommit(() => whatsapp.notifyCustomer(updated, 'cancelled'));
      return send(200, { order: updated });
    }
    if (req.method === 'GET') return send(200, { order, items: orderItemsFlat(order) });
  }

  /* صورة مخزّنة في قاعدة البيانات (وضع Vercel) — مع كاش قوي عشان متتطلبش كل مرة */
  if (p.startsWith('/api/img/')) {
    const f = imagekit.getFile(decodeURIComponent(p.replace('/api/img/', '')));
    if (!f) return bad(404, 'الصورة غير موجودة');
    res.writeHead(200, {
      'content-type': f.mime || 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
      'content-length': f.buffer.length,
    });
    return res.end(f.buffer);
  }

  /* ---------------------------- الدفع (الصفحة العامة والـWebhooks) ---------------------------- */
  if (p === '/api/payments/demo/info') {
    if (!payments.demoAllowed()) return bad(404, 'الدفع التجريبي غير متاح');
    const info = payments.demoInfo(q.get('ref') || '', q.get('t') || '');
    if (!info) return bad(404, 'رابط دفع غير صالح أو منتهي');
    return send(200, info);
  }

  if (p === '/api/payments/demo/complete' && req.method === 'POST') {
    if (!payments.demoAllowed()) return bad(404, 'الدفع التجريبي غير متاح');
    const b = await jsonBody(req);
    const out = payments.demoComplete(String(b.ref || ''), String(b.token || ''), !!b.ok);
    if (!out.ok) return bad(400, out.error || 'فشل تنفيذ الدفع');
    const o = out.order;
    if (out.status === 'paid') {
      afterOrderCommit(() => whatsapp.notifyPaid(o));
      notifyStaff({ type: 'payment_paid', title: 'تم دفع طلب 💳', body: `${o.id} · ${o.customer.name} · ${o.total} ${settings().currency}`, orderId: o.id });
    }
    sseBroadcast([o.user_id], { kind: 'order:mine', orderId: o.id, status: o.status });
    return send(200, { status: out.status, order: o, redirect: `/#/order/${o.id}?pay=${out.status === 'paid' ? 'success' : 'fail'}` });
  }

  /* Stripe: التأكيد بييجي هنا بتوقيع موقّع (مش بنعتمد على رجوع العميل) */
  if (p === '/api/webhooks/stripe' && req.method === 'POST') {
    const raw = await readBody(req);
    const out = await payments.handleStripeWebhook(raw, req.headers['stripe-signature']);
    if (out.ok && out.status === 'paid' && out.orderId) {
      const o = store.find('orders', (x) => x.id === out.orderId);
      if (o) {
        afterOrderCommit(() => whatsapp.notifyPaid(o));
        notifyStaff({ type: 'payment_paid', title: 'تم دفع طلب 💳', body: `${o.id} · ${o.customer.name} · ${o.total} ${settings().currency}`, orderId: o.id });
        sseBroadcast([o.user_id], { kind: 'order:mine', orderId: o.id, status: o.status });
      }
    }
    return send(out.ok ? 200 : 400, out);
  }

  /* Paymob: بيقبل POST (JSON) أو GET (params) */
  if (p === '/api/webhooks/paymob') {
    let payload = {};
    if (req.method === 'POST') payload = await jsonBody(req);
    else { try { payload = JSON.parse(q.get('obj') || '{}'); } catch { payload = {}; } }
    const out = await payments.handlePaymobCallback(payload, q.get('hmac') || payload.hmac);
    if (out.ok && out.status === 'paid' && out.orderId) {
      const o = store.find('orders', (x) => x.id === out.orderId);
      if (o) {
        afterOrderCommit(() => whatsapp.notifyPaid(o));
        notifyStaff({ type: 'payment_paid', title: 'تم دفع طلب 💳', body: `${o.id} · ${o.customer.name} · ${o.total} ${settings().currency}`, orderId: o.id });
        sseBroadcast([o.user_id], { kind: 'order:mine', orderId: o.id, status: o.status });
      }
    }
    return send(200, out);   // Paymob بيتوقع 200
  }

  /* ---------------------------- الإشعارات ---------------------------- */
  if (p === '/api/notifications') {
    if (!u) return bad(401, 'محتاج تسجيل دخول');
    const rows = store.filter('notifications', (n) => String(n.userId) === String(u.id))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50);
    return send(200, { notifications: rows, unread: rows.filter((n) => !n.read).length });
  }
  if (p === '/api/notifications/read' && req.method === 'POST') {
    if (!u) return bad(401, 'محتاج تسجيل دخول');
    const b = await jsonBody(req);
    const mine = store.filter('notifications', (n) => String(n.userId) === String(u.id));
    for (const n of mine) {
      if (b.all || String(n.id) === String(b.id)) store.update('notifications', n.id, { read: true });
    }
    return send(200, { ok: true });
  }

  if (p === '/api/events') {
    if (!u) return bad(401, 'محتاج تسجيل دخول');
    if (!REALTIME) return bad(400, 'البث المباشر غير مدعوم على الاستضافة السيرفرلس — استخدم التحديث الدوري');
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform', connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    const client = { res, req, userId: u.id, role: u.role };
    sseClients.add(client);
    sseSend(res, { kind: 'hello', role: u.role });
    const beat = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* ignore */ } }, 25000);
    req.on('close', () => { clearInterval(beat); sseClients.delete(client); });
    return;
  }

  /* ============================== لوحة الإدارة ============================== */
  if (p.startsWith('/api/admin/')) {
    if (!u) return bad(401, 'محتاج تسجيل دخول');
    if (!auth.isStaff(u)) return bad(403, 'ممنوع — الصفحة دي للمشرفين والأدمن بس');   // حماية حقيقية على السيرفر

    if (p === '/api/admin/stats') {
      const today = new Date().toDateString();
      const all = store.all('orders');
      const todays = all.filter((o) => new Date(o.createdAt).toDateString() === today);
      const counts = {};
      for (const s of settings().statuses) counts[s.id] = 0;
      for (const o of todays) counts[o.status] = (counts[o.status] || 0) + 1;
      const paidToday = todays.filter((o) => o.payment_status === 'paid');
      const payCounts = { paid: 0, pending: 0, unpaid: 0, failed: 0, refunded: 0 };
      for (const o of todays) { const k = o.payment_status || 'unpaid'; payCounts[k] = (payCounts[k] || 0) + 1; }
      return send(200, {
        today: {
          orders: todays.length,
          sales: todays.filter((o) => o.status !== 'cancelled').reduce((x, o) => x + o.total, 0),
          paidSales: paidToday.reduce((x, o) => x + o.total, 0),
          paidOrders: paidToday.length,
          payCounts,
          counts,
        },
        all: { orders: all.length, sales: all.filter((o) => o.status !== 'cancelled').reduce((x, o) => x + o.total, 0) },
        statuses: settings().statuses,
      });
    }

    if (p === '/api/admin/orders') {
      let rows = store.all('orders').slice();
      const status = q.get('status'), search = (q.get('q') || '').trim().toLowerCase();
      const pay = q.get('payment');
      const from = q.get('from'), to = q.get('to');
      if (status && status !== 'all') rows = rows.filter((o) => o.status === status);
      if (pay && pay !== 'all') rows = rows.filter((o) => (o.payment_status || 'unpaid') === pay);
      if (search) {
        rows = rows.filter((o) =>
          [o.id, o.customer?.name, o.customer?.phone, o.customer?.address, o.customer?.email, o.user_id]
            .filter(Boolean).some((v) => String(v).toLowerCase().includes(search)));
      }
      if (from) rows = rows.filter((o) => new Date(o.createdAt) >= new Date(from));
      if (to) rows = rows.filter((o) => new Date(o.createdAt) <= new Date(to + 'T23:59:59'));
      rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const limit = Math.min(500, Number(q.get('limit') || 100));
      return send(200, { orders: rows.slice(0, limit), total: rows.length });
    }

    if (p === '/api/admin/customers') {
      const users = store.filter('users', (x) => x.role === 'customer');
      const orders = store.all('orders');
      const rows = users.map((x) => {
        const mine = orders.filter((o) => String(o.user_id) === String(x.id));
        return {
          ...auth.publicUser(x), orders: mine.length,
          total: mine.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0),
          lastOrder: mine.length ? mine.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0].createdAt : null,
        };
      }).sort((a, b) => b.total - a.total);
      return send(200, { customers: rows });
    }

    /* --------- إعدادات الدفع (Admin فقط) --------- */
    if (p === '/api/admin/payments') {
      if (!auth.isAdmin(u)) return bad(403, 'إعدادات الدفع للأدمن فقط');
      const ss = settings();
      if (req.method === 'GET') {
        const pc = ss.paymentConfig || {};
        return send(200, {
          config: {
            provider: pc.provider || 'demo', currency: pc.currency || 'EGP',
            stripe: { secretKey: maskSecret(pc.stripe && pc.stripe.secretKey), webhookSecret: maskSecret(pc.stripe && pc.stripe.webhookSecret), publicKey: (pc.stripe && pc.stripe.publicKey) || '' },
            paymob: {
              apiKey: maskSecret(pc.paymob && pc.paymob.apiKey), hmacSecret: maskSecret(pc.paymob && pc.paymob.hmacSecret),
              integrationId: (pc.paymob && pc.paymob.integrationId) || '', iframeId: (pc.paymob && pc.paymob.iframeId) || '',
              baseUrl: (pc.paymob && pc.paymob.baseUrl) || 'https://accept.paymob.com',
            },
          },
          methods: ss.payments || [],
          paid: (store.all('payments') || []).slice(-40).reverse(),
        });
      }
      if (req.method === 'PATCH') {
        const b = await jsonBody(req);
        const pc = { ...(settings().paymentConfig || {}) };
        if (b.provider) pc.provider = b.provider;
        if (b.currency) pc.currency = String(b.currency).toUpperCase().slice(0, 4);
        for (const grp of ['stripe', 'paymob']) {
          if (!b[grp]) continue;
          pc[grp] = { ...(pc[grp] || {}) };
          for (const [k, v] of Object.entries(b[grp])) {
            if (typeof v === 'string' && v.startsWith('••••')) continue;   // القيمة المقنّعة = مش اتغيرت
            pc[grp][k] = String(v).slice(0, 300);
          }
        }
        const patch = { paymentConfig: pc };
        if (Array.isArray(b.methods)) {
          patch.payments = b.methods.map((x) => ({
            id: String(x.id).slice(0, 30), label: String(x.label || '').slice(0, 80),
            kind: x.kind === 'online' ? 'online' : 'cod', enabled: x.enabled !== false,
            note: String(x.note || '').slice(0, 160),
          }));
        }
        store.update('settings', 'main', patch);
        return send(200, { ok: true, settings: publicSettings() });
      }
    }

    if (p === '/api/admin/payments/test' && req.method === 'POST') {
      if (!auth.isAdmin(u)) return bad(403, 'للأدمن فقط');
      return send(200, await payments.testConfig());
    }

    /* --------- إعدادات وسجل واتساب --------- */
    if (p === '/api/admin/whatsapp') {
      if (!auth.isAdmin(u)) return bad(403, 'إعدادات الواتساب للأدمن فقط');
      const w = settings().whatsappNotify || {};
      if (req.method === 'GET') {
        const masked = JSON.parse(JSON.stringify(w));
        if (masked.meta) masked.meta.token = maskSecret(masked.meta.token);
        if (masked.twilio) masked.twilio.authToken = maskSecret(masked.twilio.authToken);
        if (masked.greenapi) masked.greenapi.token = maskSecret(masked.greenapi.token);
        if (masked.ultramsg) masked.ultramsg.token = maskSecret(masked.ultramsg.token);
        if (masked.callmebot) masked.callmebot.apiKey = maskSecret(masked.callmebot.apiKey);
        return send(200, { config: masked, templates: { ...whatsapp.DEFAULT_TEMPLATES, ...(w.templates || {}) }, log: whatsapp.recent(60) });
      }
      if (req.method === 'PATCH') {
        const b = await jsonBody(req);
        const wc = JSON.parse(JSON.stringify(w));
        for (const k of ['enabled', 'staffEnabled', 'requireOptIn']) if (b[k] != null) wc[k] = !!b[k];
        if (b.provider) wc.provider = String(b.provider).slice(0, 20);
        if (b.defaultCountryCode) wc.defaultCountryCode = String(b.defaultCountryCode).replace(/\D/g, '').slice(0, 4) || '20';
        if (Array.isArray(b.staffNumbers)) wc.staffNumbers = b.staffNumbers.map((n) => String(n).slice(0, 20)).slice(0, 10);
        if (b.notifyOn && typeof b.notifyOn === 'object') wc.notifyOn = { ...(wc.notifyOn || {}), ...b.notifyOn };
        if (b.templates && typeof b.templates === 'object') {
          wc.templates = { ...(wc.templates || {}) };
          for (const [k, v] of Object.entries(b.templates)) wc.templates[k] = String(v).slice(0, 900);
        }
        for (const grp of ['meta', 'twilio', 'greenapi', 'ultramsg', 'callmebot']) {
          if (!b[grp]) continue;
          wc[grp] = { ...(wc[grp] || {}) };
          for (const [k, v] of Object.entries(b[grp])) {
            if (typeof v === 'string' && v.startsWith('••••')) continue;
            wc[grp][k] = String(v).slice(0, 300);
          }
        }
        store.update('settings', 'main', { whatsappNotify: wc });
        return send(200, { ok: true, settings: publicSettings() });
      }
    }

    if (p === '/api/admin/whatsapp/log') {
      return send(200, { log: whatsapp.recent(60) });
    }

    if (p === '/api/admin/whatsapp/test' && req.method === 'POST') {
      if (!auth.isAdmin(u)) return bad(403, 'للأدمن فقط');
      const b = await jsonBody(req);
      if (!String(b.phone || '').replace(/\D/g, '')) return bad(400, 'اكتب رقم للاختبار');
      const row = await whatsapp.testSend(b.phone, b.text);
      return send(200, { row });
    }

    /* إرسال رسالة واتساب أو رابط دفع للعميل من صفحة الطلب */
    m = /^\/api\/admin\/orders\/([^/]+)\/whatsapp$/.exec(p);
    if (m && req.method === 'POST') {
      const b = await jsonBody(req);
      let order = store.find('orders', (o) => o.id === decodeURIComponent(m[1]));
      if (!order) return bad(404, 'الطلب غير موجود');
      let row;
      if (b.kind === 'payment_link') {
        if (order.payment_status !== 'paid' && !order.paymentUrl) {
          try { await payments.createPayment(order); } catch (e) { return bad(400, e.message); }
          order = store.find('orders', (o) => o.id === order.id);
        }
        row = await whatsapp.sendPaymentLink(order);
      } else {
        row = await whatsapp.notifyCustomer(order, b.status || order.status, { force: true });
      }
      return send(200, { row });
    }

    /* تحديث حالة الدفع يدويًا (كاش/تحويل/مرتجع) */
    m = /^\/api\/admin\/orders\/([^/]+)\/payment$/.exec(p);
    if (m && req.method === 'PATCH') {
      const b = await jsonBody(req);
      const order = store.find('orders', (o) => o.id === decodeURIComponent(m[1]));
      if (!order) return bad(404, 'الطلب غير موجود');
      let fresh;
      if (b.status === 'paid') { fresh = payments.markPaid(order, 'manual', order.paymentRef, { by: u.id }); }
      else if (b.status === 'refunded') { fresh = payments.markRefunded(order); }
      else if (b.status === 'unpaid') { store.update('orders', order.id, { payment_status: 'unpaid' }); fresh = store.find('orders', (o) => o.id === order.id); }
      else return bad(400, 'حالة دفع غير معروفة');
      sseBroadcast([order.user_id], { kind: 'order:mine', orderId: order.id, status: order.status });
      return send(200, { order: fresh });
    }

    m = /^\/api\/admin\/orders\/([^/]+)\/status$/.exec(p);
    if (m && req.method === 'PATCH') {
      const b = await jsonBody(req);
      const order = store.find('orders', (o) => o.id === decodeURIComponent(m[1]));
      if (!order) return bad(404, 'الطلب غير موجود');
      const st = String(b.status || '');
      if (!settings().statuses.some((s) => s.id === st)) return bad(400, 'حالة غير معروفة');
      const updated = store.update('orders', order.id, {
        status: st, updatedAt: new Date().toISOString(),
        history: [...(order.history || []), { status: st, at: new Date().toISOString(), by: u.id }],
      });
      /* العميل بيتحدّث عنده فورًا في "طلباتي" (SSE) حتى بدون إعادة نشر التطبيق */
      sseBroadcast([order.user_id], { kind: 'order:mine', orderId: order.id, status: st });
      afterOrderCommit(() => whatsapp.notifyCustomer(updated, st));   // إشعار واتساب للعميل
      notifyStaff({ type: 'status_change', title: 'تحديث حالة طلب', body: `${order.id} → ${settings().statuses.find((x) => x.id === st).label}`, orderId: order.id, extra: { silent: true } });
      return send(200, { order: updated });
    }

    /* ------ إدارة المنيو (Admin فقط) ------ */
    if (p.startsWith('/api/admin/menu') && !auth.isAdmin(u)) return bad(403, 'إدارة المنيو للأدمن فقط');

    if (p === '/api/admin/menu' && req.method === 'POST') {
      const b = await jsonBody(req);
      const item = {
        id: b.id || store.uid().slice(0, 8),
        name: String(b.name || '').trim(),
        desc: String(b.desc || '').slice(0, 400),
        price: b.price == null || b.price === '' ? null : Number(b.price),
        oldPrice: b.oldPrice ? Number(b.oldPrice) : null,
        cat: String(b.cat || 'meals'),
        image: String(b.image || ''),
        featured: !!b.featured,
        spicy: !!b.spicy,
        noPrice: !!b.noPrice,
        priceLabel: String(b.priceLabel || ''),
        active: b.active !== false, available: b.available !== false,
        imageSource: b.imageSource || 'manual',
        sort: store.all('menu').length,
        updatedAt: new Date().toISOString(),
      };
      if (!item.name) return bad(400, 'اسم الصنف مطلوب');
      if (!item.image) {                                   // صنف جديد بدون صورة → توليد صورة تلقائيًا
        const g = await ai.generateFoodImage(item);
        item.image = g.url; item.imageSource = g.source;
      }
      store.insert('menu', item);
      return send(201, { item });
    }

    m = /^\/api\/admin\/menu\/([^/]+)$/.exec(p);
    if (m && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const id = decodeURIComponent(m[1]);
      const item = store.find('menu', (x) => String(x.id) === String(id));
      if (!item) return bad(404, 'الصنف غير موجود');
      if (req.method === 'DELETE') { store.remove('menu', id); return send(200, { ok: true }); }
      const b = await jsonBody(req);
      const patch = {};
      for (const k of ['name', 'desc', 'cat', 'image', 'priceLabel']) if (b[k] != null) patch[k] = String(b[k]).slice(0, 400);
      for (const k of ['price', 'oldPrice', 'sort']) if (b[k] != null) patch[k] = b[k] === '' || b[k] === null ? null : Number(b[k]);
      for (const k of ['featured', 'spicy', 'noPrice', 'active', 'available']) if (b[k] != null) patch[k] = !!b[k];
      patch.updatedAt = new Date().toISOString();
      const updated = store.update('menu', id, patch);
      return send(200, { item: updated });
    }

    /* رفع صورة يدويًا لصنف */
    m = /^\/api\/admin\/menu\/([^/]+)\/image$/.exec(p);
    if (m && req.method === 'POST') {
      const item = store.find('menu', (x) => String(x.id) === String(decodeURIComponent(m[1])));
      if (!item) return bad(404, 'الصنف غير موجود');
      const ctype = req.headers['content-type'] || '';
      let url = null;
      if (ctype.includes('multipart/form-data')) {
        const buf = await readBody(req);
        const { files } = imagekit.parseMultipart(buf, ctype);
        const f = files.find((x) => x.field === 'image' || x.type.startsWith('image/'));
        if (!f) return bad(400, 'مفيش صورة في الطلب');
        url = imagekit.saveUpload(f, { prefix: 'menu' }).url;
      } else {
        const b = await jsonBody(req);
        if (b.url && /^https?:\/\//i.test(b.url)) url = String(b.url).slice(0, 500);
        else return bad(400, 'ابعت صورة كملف (multipart) أو رابط https');
      }
      const updated = store.update('menu', item.id, { image: url, imageSource: 'upload', updatedAt: new Date().toISOString() });
      return send(200, { item: updated });
    }

    /* توليد صورة بالذكاء الاصطناعي لصنف واحد */
    m = /^\/api\/admin\/menu\/([^/]+)\/generate-image$/.exec(p);
    if (m && req.method === 'POST') {
      const item = store.find('menu', (x) => String(x.id) === String(decodeURIComponent(m[1])));
      if (!item) return bad(404, 'الصنف غير موجود');
      const g = await ai.generateFoodImage(item);
      const updated = store.update('menu', item.id, { image: g.url, imageSource: g.source, updatedAt: new Date().toISOString() });
      return send(200, { item: updated, provider: g.provider, source: g.source });
    }

    /* توليد جماعي للأصناف المستوردة/اللي بدون صورة */
    if (p === '/api/admin/menu/generate-images' && req.method === 'POST') {
      const b = await jsonBody(req);
      const only = b.only === 'missing';
      const targets = store.all('menu').filter((x) => (only ? !x.image : x.imageSource !== 'upload'));
      const done = [];
      for (const item of targets) {
        const g = await ai.generateFoodImage(item);
        store.update('menu', item.id, { image: g.url, imageSource: g.source, updatedAt: new Date().toISOString() });
        done.push({ id: item.id, name: item.name, image: g.url, provider: g.provider });
      }
      return send(200, { generated: done.length, items: done });
    }

    /* --------- إدارة المستخدمين (Admin فقط) --------- */
    if (p.startsWith('/api/admin/users') && !auth.isAdmin(u)) return bad(403, 'إدارة المستخدمين للأدمن فقط');

    if (p === '/api/admin/users') {
      const rows = store.all('users').map((x) => ({
        ...auth.publicUser(x),
        hasPassword: !!x.hash,
        orders: store.all('orders').filter((o) => String(o.user_id) === String(x.id)).length,
      })).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      return send(200, { users: rows });
    }

    m = /^\/api\/admin\/users\/([^/]+)$/.exec(p);
    if (m && req.method === 'PATCH') {
      const target = auth.byId(decodeURIComponent(m[1]));
      if (!target) return bad(404, 'المستخدم غير موجود');
      const b = await jsonBody(req);
      if (target.isOwner && ((b.role != null && b.role !== 'admin') || (b.active != null && b.active !== true))) return bad(400, 'لا يمكن تعطيل حساب صاحب المطعم أو إزالة صلاحياته');
      const patch = {};
      if (b.role != null) {
        if (!auth.ROLES.includes(b.role)) return bad(400, 'Role غير معروف');
        if (String(target.id) === String(u.id) && b.role !== 'admin') return bad(400, 'مش منطقي تشيل صلاحيتك إنت');
        patch.role = b.role;
      }
      if (b.active != null) {
        if (String(target.id) === String(u.id)) return bad(400, 'مش منطقي تعطّل حسابك إنت');
        patch.active = !!b.active;
      }
      if (b.name != null) patch.name = String(b.name).slice(0, 120);
      const updated = store.update('users', target.id, patch);
      if (patch.active === false || patch.role != null) {
        store.write('sessions', store.all('sessions').filter((s) => String(s.userId) !== String(target.id)));  // اطرد جلساته
      }
      return send(200, { user: auth.publicUser(updated) });
    }

    /* --------- الإعدادات (Admin فقط) --------- */
    if (p === '/api/admin/settings' && req.method === 'PATCH') {
      if (!auth.isAdmin(u)) return bad(403, 'الإعدادات للأدمن فقط');
      const b = await jsonBody(req);
      const allowed = ['name', 'tagline', 'phone', 'whatsapp', 'address', 'hoursText', 'openHour', 'closeHour',
        'forceState', 'deliveryFee', 'freeDeliveryOver', 'minOrder', 'deliveryEta', 'payments', 'promos', 'addons', 'aiAutoImages'];
      const patch = {};
      for (const k of allowed) if (b[k] !== undefined) patch[k] = b[k];
      const updated = store.update('settings', 'main', patch);
      return send(200, { settings: publicSettings(), raw: updated });
    }

    if (p === '/api/admin/backup' && auth.isAdmin(u)) {
      return send(200, { backup: store.backup(), at: new Date().toISOString() });
    }

    if (p === '/api/admin/outbox' && auth.isAdmin(u)) {
      return send(200, { messages: mail.outbox() });
    }
    if (p === '/api/admin/system') {
      if (!auth.isAdmin(u)) return bad(403, 'تقرير النظام لصاحب المطعم فقط');
      /* تقرير متغيرات البيئة + اتصال تجريبي بـ Upstash (للأدمن فقط) */
      return send(200, await deployEnv.report({ ping: true }));
    }
  }

  return bad(404, 'راوت غير موجود');
}

/* ============================== الملفات الثابتة ============================== */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';

  let base, filePath;
  if (rel.startsWith('/uploads/')) {
    base = store.UPLOAD_DIR;
    filePath = path.join(base, rel.replace('/uploads/', ''));
  } else {
    base = PUBLIC_DIR;
    filePath = path.join(base, rel);
  }
  if (!isInside(base, filePath) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403); return res.end('Forbidden');
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (rel.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'not found' })); }
    filePath = path.join(PUBLIC_DIR, 'index.html');       // SPA fallback (التوجيه بالـhash)
  }
  const ext = path.extname(filePath).toLowerCase();
  const data = fs.readFileSync(filePath);
  const etag = '"' + require('crypto').createHash('sha1').update(data).digest('hex').slice(0, 16) + '"';
  if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
    etag,
  });
  res.end(data);
}

/* ============================== السيرفر ============================== */
/* رسالة 503 للإعداد الناقص: جملة عامة للعميل + السبب الواضح لصاحب المطعم + تقرير تشخيص آمن. */
function setupDetail(code) {
  if (code === 'OWNER_NOT_CONFIGURED') {
    return 'السبب: حساب صاحب المطعم مش مجهّز — أضف ADMIN_PASSWORD (أو ADMIN_PASSWORD_HASH) في متغيرات البيئة على الاستضافة واعمل Redeploy.';
  }
  /* STORAGE_UNAVAILABLE: السبب بيعتمد على القاعدة المطلوبة حاليًا (Supabase أولًا) */
  const setup = deployEnv.publicReport();
  const keys = [...(setup.missing || []), ...(setup.invalid || [])];
  if (keys.some((k) => k.startsWith('UPSTASH'))) {
    return 'السبب: قاعدة البيانات الدائمة (Upstash Redis) مش متوصلة — راجع UPSTASH_REDIS_REST_URL وUPSTASH_REDIS_REST_TOKEN في متغيرات البيئة على الاستضافة واعمل Redeploy.';
  }
  return 'السبب: قاعدة البيانات الدائمة (Supabase PostgreSQL) مش متوصلة — راجع SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY في متغيرات البيئة على الاستضافة (بعد تشغيل migrations في SQL Editor) واعمل Redeploy.';
}

function sendJSON(res, code, data) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function handle(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const routedPath = url.searchParams.get('__path') || url.searchParams.get('...route') || url.searchParams.get('route') || '';
    if (routedPath && ['/api/index', '/api/index.js', '/api/[...route]', '/api/[...route].js'].includes(url.pathname)) {
      url.pathname = '/api/' + String(routedPath).replace(/^\/+/, '');
    }
    url.searchParams.delete('__path');
    if (url.pathname.startsWith('/api/')) {
      await ensureReady();
      const reply = await store.transaction(() => api(req, res, auth.sessionUser(req), url));
      if (reply) sendJSON(res, reply.code, reply.data);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end('Method not allowed'); }
    serveStatic(req, res, url);
  } catch (e) {
    console.error('[server]', e.code || e.status || 'error', e.message);
    if (res.headersSent) { if (!res.writableEnded) res.end(); return; }
    const unavailable = e.code === 'STORAGE_UNAVAILABLE' || e.code === 'OWNER_NOT_CONFIGURED';
    sendJSON(res, unavailable ? 503 : (e.status || 500), {
      error: unavailable ? 'خدمة التسجيل والطلبات غير متاحة مؤقتًا — المطعم محتاج يراجع إعدادات قاعدة البيانات والحساب. لم يتم تأكيد الطلب.'
        : e.message === 'too_large' ? 'الملف كبير جدًا (الحد 12 ميجا)' : e.status ? e.message : 'خطأ في السيرفر',
      /* التشخيص العام (أسماء المتغيرات الناقصة فقط، من غير قيم سرية) بيخلّي صفحة
         #/setup و /api/health يشرحوا الإصلاح بالظبط بدل صفحة «مش قادرين نوصل». */
      ...(unavailable ? { code: e.code, detail: setupDetail(e.code), setup: deployEnv.publicReport() } : {}),
    });
  }
}

/* One handler, with the same commit-before-response guarantee on Node and Vercel. */
const serverlessHandler = handle;
const server = http.createServer(handle);
if (require.main === module) {
  ensureReady().then(() => server.listen(PORT, HOST, async () => {
    console.log('');
    console.log('🔥 The Original BBQ — التسجيل والطلبات شغالين على تخزين دائم');
    console.log(`   افتح: http://localhost:${PORT}`);
    console.log(`   الإدارة: /#/admin · صاحب المطعم: ${auth.OWNER_EMAIL}`);
    console.log(`   التخزين: ${store.MODE === 'redis' ? 'Upstash Redis (بديل قديم)'
      : store.MODE === 'postgres' ? 'Supabase PostgreSQL — دائم'
        : 'قرص السيرفر — يلزم قرص دائم على الاستضافة'}`);
    if (process.env.APP_URL) console.log(`   APP_URL: ${process.env.APP_URL}`);
    /* تنبيهات الإعداد — نفس اللي بيظهر في تبويب 🛠️ النظام بلوحة الإدارة */
    const rep = await deployEnv.report({ ping: false });
    for (const w of rep.warnings) console.log(`   ${w.level === 'danger' ? '🚨' : '⚠️ '} ${w.message}`);
    if (rep.missing.length) console.log(`   🚨 متغيرات ناقصة: ${rep.missing.join('، ')}`);
    if (rep.warnings.length || rep.missing.length) console.log(`   الشرح: ${store.MODE === 'redis' ? 'docs/VERCEL-UPSTASH.md' : 'docs/SUPABASE.md'}`);
    console.log('');
  })).catch((e) => {
    console.error('[startup]', e.message);
    process.exitCode = 1;
  });
}
module.exports = { server, serverlessHandler, handle, ensureReady, api, computeTotals, publicSettings, SERVERLESS, REALTIME };
