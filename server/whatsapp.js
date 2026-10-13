/* ============================================================================
   whatsapp.js — إشعارات واتساب للعميل وللمطعم
   ----------------------------------------------------------------------------
   بيشتغل مع أكثر من مزوّد (بدّل من لوحة الإدارة بدون أي كود):
     console  → افتراضي: الرسالة بتتطبع في الـconsole (تجربة بدون أي إعداد)
     link     → من غير API: بيرجّع رابط wa.me جاهز للموظف بضغطة واحدة
     meta     → WhatsApp Cloud API (Meta) الرسمي
     twilio   → Twilio WhatsApp
     greenapi → Green API (شغال برقم واتساب عادي بمسح QR)
     ultramsg → UltraMsg
     callmebot→ CallMeBot (مجاني، اتجاه واحد)
   كل رسالة بتتسجل في whatsapp_log (نجحت / فشلت / رابط) وتقدر تعيد إرسالها من اللوحة.
   ========================================================================== */
'use strict';
const store = require('./store');

const CFG = () => {
  const s = store.find('settings', (x) => x.id === 'main') || {};
  return s.whatsappNotify || {};
};

/* ------------------------------ القوالب الافتراضية ------------------------------ */
const DEFAULT_TEMPLATES = {
  new: 'أهلًا {name} 👋\nوصلنا طلبك {order} بإجمالي {total}.\nهنبدأ نجهّزه على الفحم حالًا 🔥\nتابع طلبك من هنا:\n{link}',
  received: 'تم استلام طلبك {order} ✅\nالمطعم أكّد الطلب وهنبدأ التجهيز على طول.',
  preparing: 'طلبك {order} بيتجهّز دلوقتي على الفحم 🔥\nهيطلعلك على طول.',
  on_way: 'طلبك {order} خرج للتوصيل 🛵\nقريب عندك — {eta}',
  delivered: 'بالهنا والشفا ❤️\nطلبك {order} تم توصيله بنجاح. تشرفنا بيك ومنتظرينك تاني!',
  cancelled: 'طلبك {order} اتلغى ✖️\nلو حصل بالغلط كلمنا على {phone} وهنظبطها.',
  paid: 'تم استلام دفعك لطلب {order} 💳\nالمبلغ: {total}\nشكرًا ليك! ❤️',
  payment_link: 'لإتمام دفع طلب {order} ({total}) افتح الرابط ده 💳\n{paylink}\n\nملحوظة: الطلب بيتجهّز بعد تأكيد الدفع.',
  staff_new: '🧾 طلب جديد {order}\n{name} · {total}\n📱 {phone}\n📍 {address}',
};

/* ------------------------------ أدوات ------------------------------ */
function normalizePhone(raw, cc = '20') {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  const code = String(cc || '20').replace(/\D/g, '');
  if (d.startsWith(code)) return d;
  if (d.startsWith('0')) return code + d.slice(1);
  if (d.length <= 10) return code + d;
  return d;
}

function render(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

const linkFor = (phone, text) => `https://wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

function logEntry(e) {
  const row = {
    id: store.uid(),
    at: new Date().toISOString(),
    orderId: e.orderId || null,
    type: e.type || 'custom',
    to: e.phone || '',
    via: e.provider || (CFG().provider || 'console'),
    result: e.result,          // sent | link | console | failed | skipped
    error: e.error || '',
    message: e.message || '',
    link: e.link || '',
  };
  store.insert('whatsapp_log', row);
  return row;
}

async function fetchT(url, opts = {}, ms = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

/* ------------------------------ المزوّدون ------------------------------ */
async function deliver(phone, text, cfg) {
  switch (cfg.provider) {
    case 'meta': {
      const c = cfg.meta || {};
      if (!c.token || !c.phoneId) throw new Error('إعدادات Meta ناقصة (token / phoneId)');
      const body = c.templateName
        ? { messaging_product: 'whatsapp', to: phone, type: 'template',
            template: { name: c.templateName, language: { code: c.templateLang || 'ar' },
              components: [{ type: 'body', parameters: [{ type: 'text', text }] }] } }
        : { messaging_product: 'whatsapp', to: phone, type: 'text', text: { preview_url: true, body: text } };
      const r = await fetchT(`https://graph.facebook.com/v21.0/${c.phoneId}/messages`, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + c.token, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('Meta: ' + (j.error?.message || r.status));
      return { result: 'sent', id: j.messages?.[0]?.id };
    }
    case 'twilio': {
      const c = cfg.twilio || {};
      if (!c.accountSid || !c.authToken) throw new Error('إعدادات Twilio ناقصة');
      const auth = Buffer.from(`${c.accountSid}:${c.authToken}`).toString('base64');
      const params = new URLSearchParams({ From: c.from || 'whatsapp:+14155238886', To: 'whatsapp:+' + phone, Body: text });
      const r = await fetchT(`https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}/Messages.json`, {
        method: 'POST', headers: { authorization: 'Basic ' + auth, 'content-type': 'application/x-www-form-urlencoded' }, body: params,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('Twilio: ' + (j.message || r.status));
      return { result: 'sent', id: j.sid };
    }
    case 'greenapi': {
      const c = cfg.greenapi || {};
      if (!c.instanceId || !c.token) throw new Error('إعدادات Green API ناقصة');
      const base = (c.baseUrl || 'https://api.green-api.com').replace(/\/$/, '');
      const r = await fetchT(`${base}/waInstance${c.instanceId}/sendMessage/${c.token}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chatId: phone + '@c.us', message: text }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.idMessage) throw new Error('Green API: ' + JSON.stringify(j).slice(0, 120));
      return { result: 'sent', id: j.idMessage };
    }
    case 'ultramsg': {
      const c = cfg.ultramsg || {};
      if (!c.instanceId || !c.token) throw new Error('إعدادات UltraMsg ناقصة');
      const params = new URLSearchParams({ token: c.token, to: '+' + phone, body: text });
      const r = await fetchT(`https://api.ultramsg.com/${c.instanceId}/messages/chat`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.sent) throw new Error('UltraMsg: ' + JSON.stringify(j).slice(0, 120));
      return { result: 'sent', id: j.id };
    }
    case 'callmebot': {
      const c = cfg.callmebot || {};
      if (!c.apiKey) throw new Error('إعدادات CallMeBot ناقصة (apiKey)');
      const url = `https://api.callmebot.com/whatsapp.php?phone=+${phone}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(c.apiKey)}`;
      const r = await fetchT(url);
      if (!r.ok) throw new Error('CallMeBot: ' + r.status);
      return { result: 'sent' };
    }
    case 'link':
      return { result: 'link', link: linkFor(phone, text) };
    case 'console':
    default:
      console.log(`\n💬 واتساب (console) → +${phone}\n${text}\n`);
      return { result: 'console' };
  }
}

/* ------------------------------ الإرسال ------------------------------ */
/**
 * إرسال رسالة واتساب. لو المزوّد API وفشل → بيرجع رابط wa.me كبديل (أبدًا ما بنسيب المطعم في النص).
 */
async function send({ phone, text, orderId = null, type = 'custom', force = false }) {
  const cfg = CFG();
  const to = normalizePhone(phone, cfg.defaultCountryCode || '20');
  if (!normalizePhoneRaw(phone)) return logEntry({ phone: '', message: text, type, orderId, result: 'skipped', error: 'مفيش رقم' });
  if (!cfg.enabled && !force) return logEntry({ phone: to, message: text, type, orderId, result: 'skipped', error: 'الإشعارات مقفولة' });

  try {
    const out = await deliver(to, text, cfg);
    return logEntry({ phone: to, message: text, type, orderId, result: out.result, link: out.link || '' });
  } catch (e) {
    const link = linkFor(to, text);
    console.warn('[whatsapp] فشل الإرسال:', e.message, '→ رابط بديل جاهز');
    return logEntry({ phone: to, message: text, type, orderId, result: 'failed', error: e.message, link });
  }
}
const normalizePhoneRaw = (raw) => String(raw || '').replace(/\D/g, '').length >= 8;

/* ------------------------------ إشعارات الطلب ------------------------------ */
function varsFor(order) {
  const s = store.find('settings', (x) => x.id === 'main') || {};
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  return {
    name: order.customer?.name || 'عميلنا',
    order: order.id,
    total: `${order.total} ${s.currency || 'ج.م'}`,
    phone: s.phone || '',
    eta: s.deliveryEta || '٤٥ دقيقة',
    address: [order.customer?.area, order.customer?.address].filter(Boolean).join(' — '),
    link: appUrl ? `${appUrl}/#/order/${order.id}` : '/#/order/' + order.id,
    paylink: order.paymentUrl ? (order.paymentUrl.startsWith('http') ? order.paymentUrl : appUrl + order.paymentUrl) : '',
  };
}

/** إشعار العميل بتغيير حالة طلبه */
async function notifyCustomer(order, statusId, opts = {}) {
  const cfg = CFG();
  if (!cfg.enabled) return null;
  if (cfg.notifyOn && cfg.notifyOn[statusId] === false) return null;
  if (cfg.requireOptIn !== false && order.customer?.notifyWhatsapp === false) {
    /* العميل موقف التحديثات — نسجّل السبب عشان الأدمن يشوفه في السجل */
    return logEntry({
      phone: normalizePhone(order.customer?.phone, cfg.defaultCountryCode || '20'),
      orderId: order.id, type: 'status:' + statusId, result: 'skipped',
      error: 'العميل موقّف تحديثات الواتساب',
      message: render((cfg.templates && cfg.templates[statusId]) || DEFAULT_TEMPLATES[statusId] || '', varsFor(order)),
    });
  }
  const tpl = (cfg.templates && cfg.templates[statusId]) || DEFAULT_TEMPLATES[statusId];
  if (!tpl) return null;
  return send({
    phone: order.customer?.phone,
    text: render(tpl, varsFor(order)),
    orderId: order.id, type: 'status:' + statusId,
    force: !!opts.force,
  });
}

/** إشعار إدارة المطعم بطلب جديد */
async function notifyStaffWhatsapp(order, staffChat = true) {
  const cfg = CFG();
  if (!cfg.enabled || !cfg.staffEnabled || !staffChat) return null;
  const numbers = (cfg.staffNumbers || []).filter(Boolean);
  const tpl = (cfg.templates && cfg.templates.staff_new) || DEFAULT_TEMPLATES.staff_new;
  const text = render(tpl, varsFor(order));
  const rows = [];
  for (const n of numbers) rows.push(await send({ phone: n, text, orderId: order.id, type: 'staff_new', force: true }));
  return rows;
}

/** إرسال رابط الدفع للعميل */
async function sendPaymentLink(order) {
  const cfg = CFG();
  const tpl = (cfg.templates && cfg.templates.payment_link) || DEFAULT_TEMPLATES.payment_link;
  return send({ phone: order.customer?.phone, text: render(tpl, varsFor(order)), orderId: order.id, type: 'payment_link', force: true });
}

/** إشعار تأكيد الدفع */
async function notifyPaid(order) {
  const cfg = CFG();
  const tpl = (cfg.templates && cfg.templates.paid) || DEFAULT_TEMPLATES.paid;
  return send({ phone: order.customer?.phone, text: render(tpl, varsFor(order)), orderId: order.id, type: 'paid' });
}

/* اختبار الإعدادات */
async function testSend(phone, text) {
  return send({ phone, text: text || `تجربة من ${'The Original BBQ'} ✅ — الإعدادات شغالة`, type: 'test', force: true });
}

const recent = (n = 50) => store.all('whatsapp_log').slice(-n).reverse();

module.exports = {
  DEFAULT_TEMPLATES, normalizePhone, render, linkFor, send,
  notifyCustomer, notifyStaffWhatsapp, sendPaymentLink, notifyPaid, testSend, recent, CFG,
};
