/* ============================================================================
   payments.js — الدفع أونلاين
   ----------------------------------------------------------------------------
   مزوّدات مدعومة:
     demo   → صفحة دفع محاكاة على السيرفر نفسه (تجربة كاملة فورًا من غير أي حساب)
     stripe → Stripe Checkout (صفحة دفع مستضافة — مش بنلمس بيانات الكارت)
     paymob → Paymob (Accept) — الأشهر في مصر: بطاقات + محافظ إلكترونية

   ملاحظات مهمة:
   - مبلغ الطلب بيتحدد من السيرفر دايمًا (order.total) مش من المتصفح.
   - التأكيد النهائي للدفع بييجي من Webhook موقّع، ومش بنعتمد على رجوع العميل للصفحة لوحده.
   - كل عملية بتتسجل في payments + order.payment_status.
   ========================================================================== */
'use strict';
const crypto = require('crypto');
const store = require('./store');

const settings = () => store.find('settings', (s) => s.id === 'main') || {};
const cfg = () => settings().paymentConfig || {};
const currency = () => (cfg().currency || 'EGP').toUpperCase();

async function fetchT(url, opts = {}, ms = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

function record(order, patch) {
  const existing = store.find('payments', (p) => String(p.orderId) === String(order.id) && p.status !== 'failed');
  if (existing) { store.update('payments', existing.id, { ...patch, updatedAt: new Date().toISOString() }); return existing.id; }
  const row = {
    id: store.uid(), orderId: order.id, userId: order.user_id,
    amount: order.total, currency: currency(),
    status: 'pending', provider: cfg().provider || 'demo',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...patch,
  };
  store.insert('payments', row);
  return row.id;
}

/* ------------------------------ إنشاء عملية دفع ------------------------------ */
/**
 * @returns {{url:string, provider:string, ref:string, mode:'redirect'|'iframe'}}
 */
async function createPayment(order) {
  const c = cfg();
  const provider = c.provider || 'demo';
  const cents = Math.round(Number(order.total) * 100);

  if (provider === 'demo') {
    const token = store.token();
    store.update('orders', order.id, { paymentProvider: 'demo', paymentRef: token, paymentUrl: `/pay.html?ref=${encodeURIComponent(order.id)}&t=${token}` });
    record(order, { ref: token, provider: 'demo', status: 'pending' });
    return { url: `/pay.html?ref=${encodeURIComponent(order.id)}&t=${token}`, provider: 'demo', ref: token, mode: 'redirect' };
  }

  if (provider === 'stripe') {
    const s = c.stripe || {};
    if (!s.secretKey) throw new Error('مفتاح Stripe السري مطلوب');
    const appUrl = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
    const body = new URLSearchParams();
    body.set('mode', 'payment');
    body.set('success_url', `${appUrl}/#/order/${order.id}?pay=success`);
    body.set('cancel_url', `${appUrl}/#/order/${order.id}?pay=cancel`);
    body.set('client_reference_id', order.id);
    body.set('metadata[order_id]', order.id);
    body.set('payment_method_types[0]', 'card');
    body.set('line_items[0][quantity]', '1');
    body.set('line_items[0][price_data][currency]', currency().toLowerCase());
    body.set('line_items[0][price_data][unit_amount]', String(cents));
    body.set('line_items[0][price_data][product_data][name]', `طلب ${order.id} — ${settings().name || ''}`);
    if (order.customer?.email) body.set('customer_email', order.customer.email);

    const r = await fetchT('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + s.secretKey, 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) throw new Error('Stripe: ' + (j.error?.message || r.status));
    store.update('orders', order.id, { paymentProvider: 'stripe', paymentRef: j.id, paymentUrl: j.url });
    record(order, { ref: j.id, provider: 'stripe', status: 'pending' });
    return { url: j.url, provider: 'stripe', ref: j.id, mode: 'redirect' };
  }

  if (provider === 'paymob') {
    const p = c.paymob || {};
    if (!p.apiKey || !p.integrationId || !p.iframeId) throw new Error('إعدادات Paymob ناقصة (apiKey / integrationId / iframeId)');
    const base = (p.baseUrl || 'https://accept.paymob.com').replace(/\/$/, '');

    /* 1) توثيق */
    let r = await fetchT(`${base}/api/auth/tokens`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ api_key: p.apiKey }),
    });
    let j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) throw new Error('Paymob auth: ' + JSON.stringify(j).slice(0, 140));
    const authToken = j.token;

    /* 2) تسجيل الطلب عند Paymob */
    r = await fetchT(`${base}/api/ecommerce/orders`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        auth_token: authToken, delivery_needed: false, amount_cents: cents, currency: currency(),
        merchant_order_id: order.id,
        items: (order.items || []).map((i) => ({ name: i.name, amount_cents: Math.round(i.line_total * 100), quantity: 1 })),
      }),
    });
    j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new Error('Paymob order: ' + JSON.stringify(j).slice(0, 140));
    const pmOrderId = j.id;

    /* 3) مفتاح الدفع */
    const [first = 'Customer', ...rest] = String(order.customer?.name || 'Customer').split(' ');
    r = await fetchT(`${base}/api/acceptance/payment_keys`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        auth_token: authToken, amount_cents: cents, expiration: 3600, order_id: pmOrderId,
        currency: currency(), integration_id: Number(p.integrationId),
        billing_data: {
          first_name: first, last_name: rest.join(' ') || '.',
          phone_number: order.customer?.phone || '+201000000000',
          email: order.customer?.email || 'customer@example.com',
          street: order.customer?.address || '-', building: 'NA', floor: 'NA', apartment: 'NA',
          city: order.customer?.area || 'Cairo', state: 'NA', country: 'EG', postal_code: 'NA',
        },
      }),
    });
    j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) throw new Error('Paymob payment key: ' + JSON.stringify(j).slice(0, 140));

    const iframeUrl = `${base}/api/acceptance/iframes/${p.iframeId}?payment_token=${j.token}`;
    store.update('orders', order.id, { paymentProvider: 'paymob', paymentRef: String(pmOrderId), paymentUrl: iframeUrl });
    record(order, { ref: String(pmOrderId), provider: 'paymob', status: 'pending' });
    return { url: iframeUrl, provider: 'paymob', ref: String(pmOrderId), mode: 'iframe' };
  }

  throw new Error('مزوّد دفع غير معروف: ' + provider);
}

/* ------------------------------ تأكيد الدفع ------------------------------ */
function markPaid(order, provider, ref, raw) {
  const now = new Date().toISOString();
  store.update('orders', order.id, { payment_status: 'paid', paidAt: now, paymentProvider: provider || order.paymentProvider, paymentRef: ref || order.paymentRef });
  record(order, { status: 'paid', provider, ref, raw: raw ? JSON.stringify(raw).slice(0, 4000) : undefined, paidAt: now });
  return store.find('orders', (o) => o.id === order.id);
}
function markFailed(order, provider, ref, raw) {
  store.update('orders', order.id, { payment_status: 'failed' });
  record(order, { status: 'failed', provider, ref, raw: raw ? JSON.stringify(raw).slice(0, 4000) : undefined });
  return store.find('orders', (o) => o.id === order.id);
}
function markRefunded(order) {
  store.update('orders', order.id, { payment_status: 'refunded', refundedAt: new Date().toISOString() });
  record(order, { status: 'refunded' });
  return store.find('orders', (o) => o.id === order.id);
}

/** بيعيد التحقق من المزوّد (لما العميل يرجع من صفحة الدفع) */
async function verifyPayment(order) {
  const provider = order.paymentProvider || cfg().provider || 'demo';
  if (order.payment_status === 'paid') return { status: 'paid', provider };

  if (provider === 'demo') {
    const rec = store.find('payments', (p) => String(p.orderId) === String(order.id) && p.provider === 'demo');
    const status = rec && rec.status === 'paid' ? 'paid' : (rec && rec.status === 'failed' ? 'failed' : 'pending');
    return { status, provider };
  }

  if (provider === 'stripe') {
    const s = cfg().stripe || {};
    if (!s.secretKey || !order.paymentRef) return { status: order.payment_status || 'pending', provider };
    const r = await fetchT(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(order.paymentRef)}`, {
      headers: { authorization: 'Bearer ' + s.secretKey },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { status: order.payment_status || 'pending', provider, error: j.error?.message };
    if (j.payment_status === 'paid') { markPaid(order, 'stripe', j.id, { id: j.id, amount_total: j.amount_total }); return { status: 'paid', provider }; }
    if (j.status === 'expired') { markFailed(order, 'stripe', j.id); return { status: 'failed', provider }; }
    return { status: 'pending', provider };
  }

  /* paymob: التأكيد بييجي من الـWebhook — هنا بنرجّع الحالة المسجلة */
  return { status: order.payment_status || 'pending', provider };
}

/* ------------------------------ Stripe Webhook ------------------------------ */
function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!secret) return { ok: false, reason: 'مفيش webhook secret' };
  const parts = String(sigHeader || '').split(',').reduce((acc, kv) => {
    const [k, v] = kv.split('=');
    acc[k] = v; return acc;
  }, {});
  if (!parts.t || !parts.v1) return { ok: false, reason: 'توقيع ناقص' };
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody.toString('utf8')}`).digest('hex');
  const ok = expected.length === parts.v1.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  return { ok, reason: ok ? '' : 'توقيع غير صحيح' };
}

async function handleStripeWebhook(rawBody, sigHeader) {
  const s = cfg().stripe || {};
  const check = verifyStripeSignature(rawBody, sigHeader, s.webhookSecret);
  const event = JSON.parse(rawBody.toString('utf8') || '{}');
  if (!check.ok) {
    console.warn('[stripe webhook] رُفض:', check.reason);
    return { ok: false, reason: check.reason, event };
  }
  const type = event.type;
  const obj = event.data?.object || {};
  const orderId = obj.metadata?.order_id || obj.client_reference_id;
  const order = orderId && store.find('orders', (o) => o.id === orderId);
  if (!order) return { ok: false, reason: 'الطلب غير موجود', event };

  if (type === 'checkout.session.completed' && obj.payment_status === 'paid') {
    markPaid(order, 'stripe', obj.id, { id: obj.id, type });
    return { ok: true, orderId: order.id, status: 'paid', event };
  }
  if (type === 'checkout.session.expired') {
    markFailed(order, 'stripe', obj.id, { type });
    return { ok: true, orderId: order.id, status: 'failed', event };
  }
  return { ok: true, orderId: order.id, status: order.payment_status, ignored: type };
}

/* ------------------------------ Paymob Webhook ------------------------------ */
/* ترتيب الحقول الرسمي لعمل الـHMAC عند Paymob */
const PAYMOB_HMAC_FIELDS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id',
  'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment',
  'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan', 'source_data.sub_type',
  'source_data.type', 'success',
];
const pick = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

function paymobHmac(obj, secret) {
  const str = PAYMOB_HMAC_FIELDS.map((f) => {
    const v = pick(obj, f);
    return v === true ? 'true' : v === false ? 'false' : v == null ? '' : String(v);
  }).join('');
  return crypto.createHmac('sha512', secret).update(str).digest('hex');
}

async function handlePaymobCallback(payload, providedHmac) {
  const p = cfg().paymob || {};
  const obj = payload.obj || payload;          // بعض الاستدعاءات بترجّع obj جوه، وبعضها مباشرة
  const orderId = obj?.order?.merchant_order_id;
  const order = orderId && store.find('orders', (o) => o.id === orderId);

  let verified = false;
  if (p.hmacSecret) {
    const expected = paymobHmac(obj, p.hmacSecret);
    const given = providedHmac || obj.hmac || '';
    verified = !!given && expected.length === String(given).length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(given)));
    if (!verified) console.warn('[paymob webhook] توقيع غير صحيح — تم الرفض');
    else verified = true;
  } else {
    console.warn('[paymob webhook] مفيش hmac secret — التوقيع مش بيتحقق (يُفضل ضبطه)');
    verified = true;
  }
  if (!order) return { ok: false, verified, reason: 'الطلب غير موجود', orderId };
  if (!verified) return { ok: false, verified, reason: 'توقيع غير صحيح', orderId };

  const success = obj.success === true || obj.success === 'true';
  const isRefunded = obj.is_refunded === true || obj.is_refunded === 'true';
  if (success && !obj.pending) { markPaid(order, 'paymob', obj.id, { id: obj.id, success: true }); return { ok: true, verified, orderId: order.id, status: 'paid' }; }
  if (isRefunded) { markRefunded(order); return { ok: true, verified, orderId: order.id, status: 'refunded' }; }
  markFailed(order, 'paymob', obj.id, { id: obj.id, success: false });
  return { ok: true, verified, orderId: order.id, status: 'failed' };
}

/* ------------------------------ المحاكاة (demo) ------------------------------ */
function demoInfo(ref, token) {
  const order = store.find('orders', (o) => o.id === ref);
  if (!order) return null;
  if (order.paymentRef !== token) return null;
  return {
    order: {
      id: order.id, total: order.total, currency: currency(), items: order.items,
      customer: { name: order.customer?.name, phone: order.customer?.phone, address: [order.customer?.area, order.customer?.address].filter(Boolean).join(' — ') },
      payment_status: order.payment_status || 'pending',
    },
  };
}

function demoComplete(ref, token, ok) {
  const order = store.find('orders', (o) => o.id === ref);
  if (!order || order.paymentRef !== token) return { ok: false, error: 'رابط دفع غير صالح' };
  if (order.payment_status === 'paid') return { ok: true, status: 'paid', order };
  if (ok) { markPaid(order, 'demo', token, { simulated: true }); return { ok: true, status: 'paid', order: store.find('orders', (x) => x.id === ref) || order }; }
  markFailed(order, 'demo', token, { simulated: true });
  return { ok: true, status: 'failed', order };
}

/* ------------------------------ اختبار الإعدادات ------------------------------ */
async function testConfig() {
  const c = cfg();
  const provider = c.provider || 'demo';
  if (provider === 'demo') return { ok: true, message: 'المحاكاة جاهزة — تقدر تجرّب الدفع كامل من غير أي حساب.' };
  if (provider === 'stripe') {
    const s = c.stripe || {};
    if (!s.secretKey) return { ok: false, message: 'مفتاح Stripe السري ناقص' };
    const r = await fetchT('https://api.stripe.com/v1/balance', { headers: { authorization: 'Bearer ' + s.secretKey } });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, message: 'اتصال Stripe ناجح ✅' + (s.secretKey.startsWith('sk_test') ? ' (وضع الاختبار)' : '') }
      : { ok: false, message: 'Stripe: ' + (j.error?.message || r.status) };
  }
  if (provider === 'paymob') {
    const p = c.paymob || {};
    if (!p.apiKey) return { ok: false, message: 'Paymob API key ناقص' };
    const base = (p.baseUrl || 'https://accept.paymob.com').replace(/\/$/, '');
    const r = await fetchT(`${base}/api/auth/tokens`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ api_key: p.apiKey }) });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.token ? { ok: true, message: 'اتصال Paymob ناجح ✅' } : { ok: false, message: 'Paymob: ' + (j.message || r.status) };
  }
  return { ok: false, message: 'مزوّد غير معروف' };
}

module.exports = {
  createPayment, verifyPayment, markPaid, markFailed, markRefunded,
  handleStripeWebhook, handlePaymobCallback, verifyStripeSignature, paymobHmac,
  demoInfo, demoComplete, testConfig, currency,
};
