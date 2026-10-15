/* ============================================================================
   app.js — واجهة التطبيق (العميل + لوحة الإدارة)
   ----------------------------------------------------------------------------
   ملاحظة مهمة: إخفاء الأزرار هنا "شكلي" — كل الصلاحيات بتتفحص على السيرفر.
   لو حد فتح رابط الإدارة مباشرة وهو Customer، السيرفر بيرجّع 403.
   ========================================================================== */
'use strict';

/* ============================== ١) أدوات ============================== */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
function fmtDT(ts) {
  const d = new Date(ts); let hh = d.getHours();
  const ap = hh >= 12 ? 'م' : 'ص'; hh = hh % 12 || 12;
  return `${AR_DAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]} · ${hh}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}
function fmtT(ts) {
  const d = new Date(ts); let hh = d.getHours();
  const ap = hh >= 12 ? 'م' : 'ص'; hh = hh % 12 || 12;
  return `${hh}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'الآن';
  if (s < 3600) return `قبل ${Math.floor(s / 60)} دقيقة`;
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} ساعة`;
  return fmtDT(ts);
}
const formatAmount = (n) => Math.round(Number(n) || 0).toLocaleString('ar-EG');
// The display currency comes from restaurant settings; never relabel live EGP prices as SAR.
const displayCurrency = () => ({ SAR: 'ر.س', EGP: 'ج.م' })[S.currency] || S.currency || 'ر.س';
const money = (n) => `${formatAmount(n)} ${h(displayCurrency())}`;
const moneyHTML = (n) => `<span class="price-amount"><bdi dir="ltr">${formatAmount(n)}</bdi> <small>${h(displayCurrency())}</small></span>`;

function icon(name) {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    flame: '<path d="M12 3c1 4-3 5-3 8 0 1 .6 2 1.5 2.5 0-2 2-3 3-5 2 2 4.5 4.5 4.5 7.5a6 6 0 0 1-12 0c0-4 4-7 6-13Z"/>',
    cart: '<path d="M3 3h2l2.5 12h11l2-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
    moon: '<path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>',
    phone: '<path d="m7 3 3 5-2 2a14 14 0 0 0 6 6l2-2 5 3-1 4C10 22 2 14 3 4Z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M20 12H4m6-6-6 6 6 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    chat: '<path d="M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-.8L3 21l1.8-5A9 9 0 1 1 21 11Z"/><path d="M8 10h8M8 14h5"/>',
    chef: '<path d="M7 15a5 5 0 0 1-2-9 4 4 0 0 1 7-2 4 4 0 0 1 7 2 5 5 0 0 1-2 9v6H7Z"/><path d="M7 17h10"/>',
    sliders: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.4"/><circle cx="8" cy="17" r="2.4"/>',
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.flame}</svg>`;
}


let toastTimer;
function toast(msg, ms = 2400) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.innerHTML = `<div class="t">${h(msg)}</div>`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.innerHTML = ''; }, ms);
}

/* ============================== الثيم ==============================
   Day / النهار = داكن. Night / الليل = فاتح. Shared with pay.html in theme.js. */
const getTheme = () => window.BBQTheme.get();
function updateThemeControls() {
  const night = getTheme() === 'night';
  const label = night ? 'تفعيل وضع النهار (داكن)' : 'تفعيل وضع الليل (فاتح)';
  const btn = $('#themeBtn');
  if (btn) {
    btn.innerHTML = icon(night ? 'moon' : 'sun');
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(night));
  }
  $$('[data-act="theme"]').forEach((b) => {
    if (b.id === 'themeBtn') return;
    b.innerHTML = `${icon(night ? 'moon' : 'sun')} ${night ? 'الليل — فاتح' : 'النهار — داكن'}`;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', String(night));
  });
}
function applyTheme(t, persist = true) {
  window.BBQTheme.set(t, { persist });
  updateThemeControls();
}
function toggleTheme() {
  const next = getTheme() === 'night' ? 'day' : 'night';
  applyTheme(next);
  toast(next === 'night' ? 'وضع الليل — فاتح 🌙' : 'وضع النهار — داكن ☀️', 1600);
}
window.addEventListener('bbq:theme', updateThemeControls);

/* ============================== ٢) الاتصال بالسيرفر ============================== */
const TOKEN_KEY = 'bbq_token';
function readStorage(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } }
const api = {
  token: readStorage(TOKEN_KEY),
  setToken(t) { this.token = t || ''; try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} },
  async req(path, { method = 'GET', body, raw, signal, idempotencyKey } = {}) {
    const headers = {};
    if (this.token) headers.authorization = 'Bearer ' + this.token;
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    let payload;
    if (raw) payload = raw;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    let res;
    try { res = await fetch(path, { method, headers, body: payload, signal, cache: 'no-store' }); }
    catch (err) { if (err.name === 'AbortError') throw err; throw new Error('الاتصال بالمطعم انقطع — جرّب تاني. إعادة المحاولة لن تكرر نفس الطلب.'); }
    let data = {};
    try { data = await res.json(); } catch { throw new Error('تعذر الحصول على رد صحيح من المطعم — جرّب لاحقًا'); }
    if (!res.ok) {
      const e = new Error(data.error || ('خطأ ' + res.status));
      e.status = res.status; e.code = data.code; e.detail = data.detail; e.setup = data.setup;
      throw e;
    }
    return data;
  },
};

/* ============================== ٣) حالة التطبيق ============================== */
let S = {};                 // إعدادات المطعم (من السيرفر)
let CATS = [], MENU = [];
let ME = null;              // المستخدم المسجل
let NOTIFS = [];
let cart = [];
try { cart = JSON.parse(localStorage.getItem('bbq_cart') || '[]'); } catch { cart = []; }
const isStaff = () => !!ME && (ME.role === 'admin' || ME.role === 'supervisor');
const isAdmin = () => !!ME && ME.role === 'admin';
const saveCart = () => { try { localStorage.setItem('bbq_cart', JSON.stringify(cart)); } catch {} };
const byId = (id) => MENU.find((x) => String(x.id) === String(id));
const catName = (id) => (CATS.find((c) => c.id === id) || {}).name || '';

async function loadBootstrap() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const d = await api.req('/api/bootstrap', { signal: controller.signal });
    S = d.settings; CATS = d.categories; MENU = d.menu; ME = d.user;
    if (!ME && api.token) api.setToken('');
  } finally { clearTimeout(timeout); }
}

/* ============================== ٣٫٥) صفحة إصلاح الإعداد الناقص ==============================
   لما السيرفر يقفل كل الـAPI برسالة 503 (STORAGE_UNAVAILABLE / OWNER_NOT_CONFIGURED)
   الصفحة القديمة كانت بتقول «مش قادرين نوصل للمطعم / تأكد من الإنترنت» — وده تضليل.
   هنا بنعرض السبب الحقيقي وخطوات الإصلاح على الاستضافة (Vercel/Supabase) بالصوت والصورة. */
let lastSetupError = null;
const SETUP_CODES = ['STORAGE_UNAVAILABLE', 'OWNER_NOT_CONFIGURED'];
const isSetupError = (e) => !!e && SETUP_CODES.includes(e.code);

function setupStepsHTML(code) {
  /* الخطوات بتتبع القاعدة اللي التطبيق محتاجها فعلًا: Supabase أولًا، وLegacy لو الناقص Upstash */
  const missing = (lastSetupError && lastSetupError.setup && lastSetupError.setup.missing) || [];
  const legacyUpstash = code === 'STORAGE_UNAVAILABLE' && missing.some((k) => String(k).startsWith('UPSTASH'));
  const upstashSteps = [
    'افتح <a href="https://upstash.com" target="_blank" rel="noopener" style="color:var(--link)">upstash.com</a> وأنشئ قاعدة Redis مجانية (Upstash Redis).',
    'من صفحة القاعدة انسخ <b>REST URL</b> و<b>REST Token</b> — الرابط لازم يبدأ بـ <code dir="ltr">https://</code> (رابط <code dir="ltr">redis://</code> مش هيشتغل).',
    'على Vercel: المشروع → <b>Settings → Environment Variables</b> → أضف <code dir="ltr">UPSTASH_REDIS_REST_URL</code> و<code dir="ltr">UPSTASH_REDIS_REST_TOKEN</code> وفعّلهم لـ Production وPreview.',
    'اعمل <b>Redeploy</b> من تبويب Deployments لآخر نسخة — المتغيرات بتتقرأ مع النشر مش مع التصفح.',
  ];
  const steps = code === 'STORAGE_UNAVAILABLE' ? (legacyUpstash ? upstashSteps : [
    'افتح <a href="https://supabase.com" target="_blank" rel="noopener" style="color:var(--link)">supabase.com</a> وأنشئ مشروع جديد (الخطة المجانية كافية).',
    'من <b>SQL Editor</b> شغّل ملف المشروع <code dir="ltr">supabase/migrations/0001_init.sql</code> كامل — بيعمل الجداول والحماية ودوال الحفظ الذري.',
    'من <b>Settings → API</b> انسخ <b>Project URL</b> و<b>service_role</b> المفتاح السري — ده للسيرفر بس، مش بيتحط في الواجهة أبدًا.',
    'على Vercel: المشروع → <b>Settings → Environment Variables</b> → أضف <code dir="ltr">SUPABASE_URL</code> و<code dir="ltr">SUPABASE_SERVICE_ROLE_KEY</code> (وكمان <code dir="ltr">APP_URL</code> و<code dir="ltr">ADMIN_PASSWORD</code>) وفعّلهم لـ Production وPreview.',
    'اعمل <b>Redeploy</b> من تبويب Deployments لآخر نسخة — المتغيرات بتتقرأ مع النشر مش مع التصفح.',
  ]) : [
    'على Vercel: المشروع → <b>Settings → Environment Variables</b> → أضف <code dir="ltr">ADMIN_PASSWORD</code> (٦ أحرف على الأقل) — واختياريًا <code dir="ltr">ADMIN_EMAIL</code> لإيميل صاحب المطعم.',
    'لو المتغير موجود بالفعل ومتأكد من قيمته، اعمل <b>Redeploy</b> — الإضافة بعد النشر مش بتسري إلا بنشر جديد.',
  ];
  return `<ol style="margin:10px 0 0;padding-inline-start:22px;line-height:2.1">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>`;
}

function setupPageHTML() {
  const code = lastSetupError?.code || '';
  const setup = lastSetupError?.setup || null;
  const chips = (list) => (list || []).map((k) => `<code dir="ltr">${h(k)}</code>`).join('، ');
  return `${headerHTML('home')}<main class="app"><div class="wrap" style="max-width:640px">
    <div class="page-head"><h1>إعدادات الاستضافة ناقصة</h1>
      <p>الموقع منشور وشغال، بس السيرفر بيقفل التسجيل والطلبات لأن متغيرات البيئة الإجبارية مش متظبطة${code ? ` (<code dir="ltr">${h(code)}</code>)` : ''}.</p></div>
    <div class="box" style="margin-top:14px;border-color:color-mix(in srgb, var(--danger, #c22) 45%, transparent)">
      <strong>🛠️ إصلاح المشكلة (لصاحب المطعم)</strong>
      ${lastSetupError?.detail ? `<p class="small" style="margin:8px 0 0">${h(lastSetupError.detail)}</p>` : ''}
      ${code ? setupStepsHTML(code) : '<p class="small muted" style="margin:8px 0 0">افتح <code dir="ltr">/api/health</code> عشان تشوف المتغيرات الناقصة بالظبط.</p>'}
      ${setup && setup.missing && setup.missing.length ? `<p class="small" style="margin:10px 0 0">الناقص حاليًا: ${chips(setup.missing)}</p>` : ''}
      ${setup && setup.invalid && setup.invalid.length ? `<p class="small" style="margin:6px 0 0">قيم محتاجة تصحيح: ${chips(setup.invalid)}</p>` : ''}
      <p class="small muted" style="margin:10px 0 0">بعد الإصلاح افتح <code dir="ltr">/api/health</code> ولازم تلاقي <code dir="ltr">ok:true</code> — الشرح الكامل خطوة بخطوة في ملف المشروع <code dir="ltr">docs/SUPABASE.md</code>.</p>
      <div class="btn-row" style="margin-top:12px">
        <a class="btn btn-ghost" dir="ltr" href="/api/health" target="_blank" rel="noopener">/api/health فتح</a>
        <button class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button>
      </div>
    </div>
    <div class="box" style="margin-top:12px">
      <strong>لو أنت عميل:</strong>
      <p class="small muted" style="margin:6px 0 0">التوقف من جهة المطعم نفسه — مش مشكلة في جهازك ولا في اتصالك بالإنترنت. أول ما المطعم يظبط إعداداته هتقدر تسجّل وتطلب عادي، ومفيش أي خطوة مطلوبة منك.</p>
    </div>
  </div>${footerHTML()}</main>`;
}

/* بحث عن الأصناف المستوردة اللي مش عندها صورة (للأدمن) */
const missingImages = () => MENU.filter((m) => !m.image || m.imageSource === 'pool' || m.imageSource === 'placeholder');

/* ============================== ٤) السلة ============================== */
const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);
const lineTotal = (i) => (i.price + (i.addons || []).reduce((a, x) => a + x.price, 0)) * i.qty;

function cartTotals() {
  const subtotal = cart.reduce((s, i) => s + lineTotal(i), 0);
  let delivery = 0, discount = 0;
  const promo = S.promos ? S.promos.find((p) => p.code === promoCode) : null;
  if (promo && subtotal >= (promo.min || 0)) {
    if (promo.type === 'percent') discount = Math.round(subtotal * promo.value / 100);
    else if (promo.type === 'fixed') discount = Math.min(promo.value, subtotal);
  }
  if (cart.length) {
    delivery = Number(S.deliveryFee || 0);
    if (S.freeDeliveryOver > 0 && subtotal >= S.freeDeliveryOver) delivery = 0;
    if (promo && promo.type === 'freedelivery' && subtotal >= (promo.min || 0)) delivery = 0;
  }
  return { subtotal, delivery, discount, total: Math.max(0, subtotal + delivery - discount) };
}

let promoCode = '';
function addToCart(item, qty, addons, note) {
  if (item.available === false) { toast('الصنف ده نفد اليوم. اختار حاجة تانية من المنيو.'); return; }
  const key = [item.id, (addons || []).map((a) => a.name).sort().join('+'), note || ''].join('|');
  const found = cart.find((c) => c.key === key);
  if (found) found.qty += qty;
  else cart.push({ key, id: item.id, name: item.name, image: item.image, price: item.price || 0, qty, addons: addons || [], note: note || '' });
  saveCart(); renderCartBar(); updateBadges();
  toast(`تم إضافة ${item.name} للسلة ✅`);
}

/* ============================== ٥) الراوتر ============================== */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const seg = pathPart.split('/').filter(Boolean);
  return { name: seg[0] || 'home', sub: seg[1] || null, param: seg[1] || null, q: new URLSearchParams(queryPart || '') };
}
const go = (p) => {
  const target = '#/' + String(p).replace(/^#?\/?/, '');
  if (location.hash === target) softRender(); else location.hash = target;
};

const NAV = [
  { to: 'home', icon: 'home', label: 'الرئيسية' },
  { to: 'orders', icon: 'flame', label: 'اطلب الآن' },
  { to: 'cart', icon: 'cart', label: 'السلة', cart: true },
  { to: 'my-orders', icon: 'receipt', label: 'طلباتي' },
  { to: 'account', icon: 'user', label: 'حسابي' },
];
const navItems = () => (isStaff() ? [...NAV, { to: 'admin', icon: 'chef', label: 'الإدارة' }] : NAV);

/* ============================== ٦) عناصر مشتركة ============================== */
function statusOf(id) { return (S.statuses || []).find((s) => s.id === id) || { id, label: id, emoji: '•', note: '' }; }

/* ===== حالة الدفع ===== */
const PAY_STATES = {
  paid:     { label: 'مدفوع',                icon: '✅', color: 'var(--green)' },
  pending:  { label: 'بانتظار الدفع',        icon: '⏳', color: 'var(--link)' },
  unpaid:   { label: 'الدفع عند الاستلام',    icon: '💵', color: 'var(--muted)' },
  failed:   { label: 'فشل الدفع',            icon: '⚠️', color: 'var(--red)' },
  refunded: { label: 'مرتجع',                icon: '↩️', color: 'var(--blue)' },
};
const payState = (o) => PAY_STATES[o.payment_status || 'unpaid'] || PAY_STATES.unpaid;
function payChip(o) {
  const st = payState(o);
  return `<span class="pay-chip" style="color:${st.color}">${st.icon} ${st.label}</span>`;
}
const isOnline = (o) => (S.payments || []).find((p) => p.id === o.payment)?.kind === 'online';
function statusChip(id) { const s = statusOf(id); return `<span class="status-chip s-${h(s.id)}">${s.emoji} ${h(s.label)}</span>`; }
const FLOW = () => (S.statuses || []).filter((s) => s.id !== 'cancelled');

function headerHTML(active) {
  const unread = NOTIFS.filter((n) => !n.read).length;
  const night = getTheme() === 'night';
  const themeLabel = night ? 'تفعيل وضع النهار (داكن)' : 'تفعيل وضع الليل (فاتح)';
  return `
  <header class="header app-header ${isStaff() ? 'staff-header' : ''}">
    <div class="header-inner">
      <a class="brand" href="#/" aria-label="${h(S.name || 'The Original BBQ')} — الرئيسية">
        <span class="logo-container"><img class="app-logo" src="/img/logo.svg?v=fba50bf4289a" alt="شعار The Original BBQ الكامل" width="56" height="40" /></span>
        <span class="brand-text header-info">
          ${ME ? `<span class="brand-greet">أهلًا ${h(String(ME.name || '').split(' ')[0] || 'يا صديقي')} 👋</span>` : ''}
          <span class="brand-name" dir="auto">${h((S.name || 'The Original BBQ').toUpperCase())}</span>
          <span class="brand-sub tagline">${h(S.tagline || 'مشاوي على الفحم')} · على أصوله</span>
        </span>
      </a>
      <nav class="header-links" aria-label="التنقل الرئيسي">
        <a href="#/" class="${active === 'home' ? 'active' : ''}" ${active === 'home' ? 'aria-current="page"' : ''}>الرئيسية</a>
        <a href="#/orders" class="${active === 'orders' ? 'active' : ''}" ${active === 'orders' ? 'aria-current="page"' : ''}>اطلب الآن</a>
        <a href="#/my-orders" class="${active === 'my-orders' ? 'active' : ''}" ${active === 'my-orders' ? 'aria-current="page"' : ''}>طلباتي</a>
      </nav>
      <div class="header-actions">
        ${isStaff() ? `<button class="icon-btn" id="notifBtn" title="الإشعارات" aria-label="الإشعارات">${icon('bell')}${unread ? `<span class="badge-n red">${formatAmount(unread)}</span>` : ''}</button>` : ''}
        <button class="icon-btn theme-toggle" id="themeBtn" data-act="theme" title="${themeLabel}" aria-label="${themeLabel}" aria-pressed="${night}">${icon(night ? 'moon' : 'sun')}</button>
        <a class="icon-btn header-phone" href="tel:${h(S.phone || '')}" title="اتصل بالمطعم" aria-label="اتصل بالمطعم">${icon('phone')}</a>
        <button class="icon-btn" data-act="nav" data-to="cart" title="السلة" aria-label="السلة">${icon('cart')}<span class="badge-n ${cartCount() ? '' : 'hidden'}" id="headBadge">${formatAmount(cartCount())}</span></button>
      </div>
    </div>
  </header>`;
}

function navHTML(active) {
  const items = navItems();
  /* 5 عناصر (عميل): السلة بتاعتنا في النص — بتطلع كزر دائري كبير فوق الشريط زي تطبيقات الدليفري */
  const bump = items.length === 5;
  return `
  <nav class="nav bottom-nav ${bump ? 'nav-bump' : ''}" aria-label="التنقل السريع">
    <div class="nav-inner" style="grid-template-columns:repeat(${items.length},minmax(0,1fr))">
      ${items.map((n) => {
        const cls = ['nav-item', n.to === 'cart' && bump ? 'nav-cta' : null, active === n.to ? 'active on' : null].filter(Boolean).join(' ');
        return `
        <button data-act="nav" data-to="${n.to}" class="${cls}" ${active === n.to ? 'aria-current="page"' : ''}>
          <span class="ni">${icon(n.icon)}</span><span>${n.label}</span>
          ${n.cart ? `<span class="nb ${cartCount() ? '' : 'hidden'}" id="navBadge">${formatAmount(cartCount())}</span>` : ''}
        </button>`;
      }).join('')}
    </div>
  </nav>`;
}

function footerHTML() {
  return `
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <div class="logo-row"><img class="footer-logo" src="/img/logo.svg?v=fba50bf4289a" alt="The Original BBQ — مشاوي على الفحم" width="100" height="71" loading="lazy" /></div>
        <div><strong dir="auto">${h(S.name || 'The Original BBQ')}</strong><span>طعم أصلي. على أصوله.</span>
          <div class="socials">
            <a href="tel:${h(S.phone || '')}" aria-label="اتصل بالمطعم">${icon('phone')}</a>
            <a href="https://wa.me/${h(S.whatsapp || '')}" target="_blank" rel="noopener" aria-label="واتساب المطعم">${icon('chat')}</a>
          </div>
        </div>
      </div>
      <div class="footer-details">
        ${S.address ? `<div>${icon('pin')} ${h(S.address)}</div>` : ''}
        ${S.hoursText ? `<div>${icon('clock')} ${h(S.hoursText)}</div>` : ''}
        ${S.deliveryEta ? `<div>${icon('cart')} التوصيل خلال ${h(S.deliveryEta)}${Number(S.deliveryFee) ? ` · ${money(S.deliveryFee)}` : ''}</div>` : ''}
        ${Number(S.freeDeliveryOver) ? `<div>توصيل مجاني للطلبات فوق ${money(S.freeDeliveryOver)}</div>` : ''}
      </div>
    </div>
    <div class="credit">© ${new Date().getFullYear()} ${h(S.name || 'The Original BBQ')}</div>
  </footer>`;
}

function renderCartBar() {
  let bar = $('#cartBar');
  const { name } = parseHash();
  const hide = !cart.length || ['cart', 'checkout', 'login', 'signup', 'admin'].includes(name);
  document.body.classList.toggle('cart-visible', !hide);
  if (!bar) {
    bar = document.createElement('button');
    bar.type = 'button'; bar.id = 'cartBar'; bar.className = 'cart-bar floating-cart';
    document.body.appendChild(bar);
  }
  bar.classList.toggle('show', !hide);
  bar.setAttribute('aria-hidden', String(hide));
  bar.tabIndex = hide ? -1 : 0;
  if (hide) return;
  const t = cartTotals();
  bar.setAttribute('aria-label', `عرض السلة: ${formatAmount(cartCount())} صنف، ${money(t.total)}`);
  bar.innerHTML = `<span class="cart-bar-info">${icon('cart')}<span class="cart-bar-count">${formatAmount(cartCount())}</span><span>سلتك · ${money(t.total)}</span></span><span class="cart-bar-action">عرض السلة ${icon('arrow')}</span>`;
  bar.onclick = () => go('cart');
}

function updateBadges() {
  for (const [id, val] of [['#navBadge', cartCount()], ['#headBadge', cartCount()]]) {
    const el = $(id); if (el) { el.textContent = formatAmount(val); el.classList.toggle('hidden', !val); }
  }
}

function sectionHeaderHTML(title, link, count) {
  return `<div class="section-header">
    <h2 class="section-title"><span class="fire-icon">${icon('flame')}</span>${h(title)}</h2>
    <span class="section-line" aria-hidden="true"></span>
    ${count !== undefined ? `<span class="section-count">${formatAmount(count)} صنف</span>` : ''}
    ${link ? `<a class="link" href="${h(link)}">شوف الكل ←</a>` : ''}
  </div>`;
}

function itemCardHTML(it) {
  const unavailable = it.available === false;
  const badge = unavailable ? '<span class="tag off">نفد اليوم</span>'
    : it.spicy ? '<span class="tag badge-hot">🔥 حار</span>'
    : it.featured ? '<span class="tag hot">الأكثر طلبًا</span>'
    : it.cat === 'offers' ? '<span class="tag offer">عرض</span>' : '';
  const priceHTML = it.noPrice ? '<span class="price small">عرض خاص</span>'
    : `<span class="price">${it.priceLabel ? `<small>${h(it.priceLabel)}</small> ` : ''}
      ${it.oldPrice ? `<span class="old-price">${money(it.oldPrice)}</span> ` : ''}${moneyHTML(it.price)}</span>`;
  return `
  <article class="card menu-card" data-menu-id="${h(it.id)}">
    <button class="card-img" data-act="item" data-id="${h(it.id)}" aria-label="تفاصيل ${h(it.name)}">
      ${it.image ? `<img src="${h(it.image)}" alt="${h(it.name)}" loading="lazy" decoding="async" width="116" height="144">` : ''}${badge}
    </button>
    <div class="card-body">
      <h3 class="card-title"><button data-act="item" data-id="${h(it.id)}">${h(it.name)}</button></h3>
      ${it.desc ? `<p class="card-desc">${h(it.desc)}</p>` : ''}
      <div class="card-footer">
        ${priceHTML}
        <button class="btn-add" data-act="item" data-id="${h(it.id)}" aria-label="${it.noPrice ? 'تفاصيل عرض' : 'أضف'} ${h(it.name)}${it.noPrice ? '' : ' إلى السلة'}" ${unavailable ? 'disabled' : ''}>${icon(it.noPrice ? 'chat' : 'plus')}</button>
      </div>
    </div>
  </article>`;
}

/* ============================== ٧) صفحة الرئيسية ============================== */
function isOpenNow() {
  const f = S.forceState;
  if (f === 'open') return true;
  if (f === 'closed') return false;
  const hh = new Date().getHours() + new Date().getMinutes() / 60;
  const open = Number(S.openHour || 0), close = Number(S.closeHour || 24) % 24;
  if (Number(S.closeHour) >= 24) return hh >= open || hh < close;
  return hh >= open && hh < close;
}

/* شرائح الـhero: كل حاجة جاية من بيانات المطعم الفعلية (إعدادات + تصنيفات + عروض). */
function heroSlides() {
  const slides = [{
    img: '/img/ai-hero.jpg',
    eyebrow: 'THE ORIGINAL BBQ',
    title: 'على الفحم.<br><span>على أصوله.</span>',
    text: 'تتبيلة الأصلي، ورائحة الفحم اللي تعرفها — اختار اللي نفسك فيه، وخلّي الباقي علينا.',
    cta: 'اطلب دلوقتي', to: '#/orders',
  }];
  const offers = CATS.find((c) => c.id === 'offers');
  if (offers && offers.image) slides.push({
    img: offers.image,
    eyebrow: 'عروض اليوم',
    title: 'عروض تفتح <span>النفس</span>',
    text: 'خصومات على أطباق مختارة — لفترة محدودة.',
    cta: 'شوف العروض', to: '#/orders?cat=' + encodeURIComponent(offers.name),
  });
  const meals = CATS.find((c) => c.id === 'meals');
  if (meals && meals.image) slides.push({
    img: meals.image,
    eyebrow: 'وجبات متكاملة',
    title: 'وجبة واحدة <span>تكفي</span>',
    text: 'ميكسات جريل ووجبات كاملة بمشروباتها — جاهزة على الفحم.',
    cta: 'اطلب وجبة', to: '#/orders?cat=' + encodeURIComponent(meals.name),
  });
  return slides;
}

let heroTimer = null;
let heroIndex = 0;
function heroGo(i) {
  const slides = $$('#heroTrack .hero-slide');
  if (!slides.length) return;
  heroIndex = ((i % slides.length) + slides.length) % slides.length;
  slides.forEach((s, k) => {
    s.classList.toggle('on', k === heroIndex);
    if (k === heroIndex) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true');
  });
  $$('.hero-dot').forEach((d, k) => {
    d.classList.toggle('on', k === heroIndex);
    d.setAttribute('aria-current', k === heroIndex ? 'true' : 'false');
  });
}
function bindHero() {
  if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
  const car = $('#heroCarousel');
  if (!car) return;
  const count = $$('#heroTrack .hero-slide').length;
  if (count <= 1) return;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  const start = () => { if (!heroTimer) heroTimer = setInterval(() => heroGo(heroIndex + 1), 5200); };
  start();
  car.addEventListener('mouseenter', () => { if (heroTimer) { clearInterval(heroTimer); heroTimer = null; } });
  car.addEventListener('mouseleave', start);
}

/* كارت مدمج لصفحة الرئيسية (صورة فوق + اسم + سعر + زر إضافة) — شكل "الاكثر طلبًا" */
function pickBadge(it) {
  if (it.available === false) return '<span class="pick-tag off">نفد اليوم</span>';
  if (it.spicy) return '<span class="pick-tag hot">🔥 حار</span>';
  if (it.featured) return '<span class="pick-tag best">الأكثر طلبًا</span>';
  if (it.cat === 'offers') return '<span class="pick-tag offer">عرض</span>';
  return '';
}
function pickCardHTML(it) {
  const unavailable = it.available === false;
  return `
  <article class="pick-card" data-menu-id="${h(it.id)}">
    <button class="pick-img" data-act="item" data-id="${h(it.id)}" aria-label="تفاصيل ${h(it.name)}">
      ${it.image ? `<img src="${h(it.image)}" alt="" loading="lazy" decoding="async">` : ''}${pickBadge(it)}
    </button>
    <div class="pick-body">
      <h3 class="pick-name"><button data-act="item" data-id="${h(it.id)}">${h(it.name)}</button></h3>
      <p class="pick-desc">${h(it.desc || catName(it.cat) || '')}</p>
      <div class="pick-foot">
        ${it.noPrice ? '<span class="pick-special">عرض خاص</span>'
          : `<span class="price">${it.priceLabel ? `<small>${h(it.priceLabel)}</small> ` : ''}${it.oldPrice ? `<span class="old-price">${money(it.oldPrice)}</span> ` : ''}${moneyHTML(it.price)}</span>`}
        <button class="btn-add pick-add" data-act="item" data-id="${h(it.id)}" aria-label="${it.noPrice ? 'تفاصيل عرض' : 'أضف'} ${h(it.name)}${it.noPrice ? '' : ' إلى السلة'}" ${unavailable ? 'disabled' : ''}>${icon(it.noPrice ? 'chat' : 'plus')}</button>
      </div>
    </div>
  </article>`;
}

function viewsHome() {
  const open = isOpenNow();
  const slides = heroSlides();
  const picks = MENU.filter((i) => i.featured).slice(0, 8);
  const picksList = picks.length ? picks : MENU.slice(0, 8);
  const promo = (S.promos || [])[0];
  const promoTitle = promo ? (promo.label || (promo.type === 'percent'
    ? `خصم ${formatAmount(promo.value)}% على أي طلب${promo.min ? ' فوق ' + money(promo.min) : ''}`
    : promo.code)) : '';
  return `
  ${headerHTML('home')}
  <main class="app"><div class="wrap home-wrap">
    <div class="home-status row" role="status">
      <span class="pill"><span class="dot ${open ? '' : 'closed'}"></span>${open ? 'مفتوح الآن' : 'مقفول حاليًا'}</span>
      ${S.deliveryEta ? `<span class="small muted">${icon('clock')} توصيل خلال ${h(S.deliveryEta)}</span>` : ''}
      <span class="spacer"></span>
      <a class="small home-call" href="https://wa.me/${h(S.whatsapp || '')}" target="_blank" rel="noopener">${icon('chat')} كلّمنا</a>
    </div>

    <form class="searchbar" id="homeSearchForm" role="search" action="#/orders" method="get">
      <span class="searchbar-ico">${icon('search')}</span>
      <input type="search" name="q" id="homeSearchInput" placeholder="دوّر على طبقك المفضل… 🍢" aria-label="ابحث في المنيو" autocomplete="off">
      <button type="button" class="searchbar-filters" data-act="nav" data-to="orders" aria-label="كل المنيو والفلاتر">${icon('sliders')}</button>
    </form>

    <section class="hero-carousel" id="heroCarousel" aria-roledescription="carousel" aria-label="أبرز الأطباق والعروض">
      <div class="hero-track" id="heroTrack">
        ${slides.map((s, i) => `
        <div class="hero-slide ${i === 0 ? 'on' : ''}" ${i ? 'aria-hidden="true"' : ''}>
          <img src="${h(s.img)}" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>
          <div class="hero-scrim" aria-hidden="true"></div>
          <div class="hero-slide-content">
            <div class="eyebrow light">${icon('flame')} ${h(s.eyebrow)}</div>
            <h2 ${i === 0 ? 'id="homeTitle"' : ''}>${s.title}</h2>
            <p>${h(s.text)}</p>
            <a class="btn btn-primary btn-sm hero-cta" href="${h(s.to)}">${h(s.cta)} ${icon('arrow')}</a>
          </div>
        </div>`).join('')}
      </div>
      ${slides.length > 1 ? `<div class="hero-dots" role="group" aria-label="شرائح العرض">
        ${slides.map((s, i) => `<button type="button" class="hero-dot ${i === 0 ? 'on' : ''}" data-act="hero-dot" data-i="${i}" aria-label="الشريحة ${formatAmount(i + 1)} من ${formatAmount(slides.length)}"></button>`).join('')}
      </div>` : ''}
    </section>

    <div class="cat-row" aria-label="تصنيفات المنيو">
      <button class="cat-chip" data-act="nav" data-to="orders"><span class="cat-chip-ico">${icon('flame')}</span><span class="cat-chip-label">الكل</span></button>
      ${CATS.map((c) => `
        <button class="cat-chip" data-act="cat" data-id="${h(c.id)}">
          <span class="cat-chip-ico">${c.image ? `<img src="${h(c.image)}" alt="" loading="lazy">` : icon('flame')}</span>
          <span class="cat-chip-label">${h(c.name)}</span>
        </button>`).join('')}
    </div>

    ${sectionHeaderHTML('الاكثر طلبًا', '#/orders?sort=hot')}
    <div class="picks-grid">${picksList.map(pickCardHTML).join('')}</div>

    ${promo ? `
    <a class="promo-strip" href="#/checkout?promo=${h(promo.code)}" aria-label="${h(promoTitle)}">
      <span class="promo-copy">
        <span class="promo-eyebrow">عرض حصري</span>
        <strong>${h(promoTitle)}</strong>
        <span class="promo-cta">اطلب دلوقتي ${icon('arrow')}</span>
      </span>
      <span class="promo-badge" aria-hidden="true">${promo.type === 'percent' ? formatAmount(promo.value) + '%' : h(promo.code)}</span>
    </a>` : ''}

    ${sectionHeaderHTML('ليه الأصلي؟')}
    <div class="perks">
      <div class="perk"><div class="ico">${icon('flame')}</div><h4>من الشواية لحد بابك</h4><p>مشاوي بتتجهّز على الفحم مع كل طلب.</p></div>
      <div class="perk"><div class="ico">${icon('receipt')}</div><h4>خليك متابع طلبك</h4><p>من أول ما نستلمه، لحد ما يوصل بالهنا.</p></div>
      <div class="perk"><div class="ico">${icon('cart')}</div><h4>اطلب على راحتك</h4><p>اختار إضافاتك، واكتب لنا اللي بتحبّه.</p></div>
    </div>
  </div>${footerHTML()}</main>`;
}

/* ============================== ٨) صفحة الطلب / المنيو ============================== */
const normalizeSearch = (text) => String(text).normalize('NFKD')
  .replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase();

function viewsMenu(q) {
  const category = CATS.find((c) => c.name === q.get('cat') || c.id === q.get('cat'));
  const activeCat = category ? category.id : null;
  const search = (q.get('q') || '').trim();
  const sort = q.get('sort') || 'rec';
  const open = isOpenNow();
  let list = MENU.slice();
  if (activeCat) list = list.filter((i) => i.cat === activeCat);
  if (search) list = list.filter((i) => normalizeSearch(i.name + ' ' + (i.desc || '')).includes(normalizeSearch(search)));
  if (sort === 'cheap') list.sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9));
  if (sort === 'pricey') list.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
  if (sort === 'hot') list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

  const groupHTML = (title, items, id) => `<section class="menu-section" ${id ? `id="section-${h(id)}"` : ''}>
    ${sectionHeaderHTML(title, null, items.length)}
    <div class="menu-grid">${items.map(itemCardHTML).join('')}</div>
  </section>`;
  let results;
  if (!list.length) {
    results = `<div class="empty menu-empty"><div class="big">${icon('search')}</div><h3>مفيش أصناف بالاسم ده</h3><p>جرّب كلمة تانية، أو ارجع لكل المنيو.</p><button class="btn btn-primary btn-sm" data-act="clear-menu">شوف كل الأصناف</button></div>`;
  } else if (!activeCat && !search && sort === 'rec') {
    results = CATS.map((c) => {
      const items = list.filter((i) => i.cat === c.id);
      return items.length ? groupHTML(c.name, items, c.id) : '';
    }).join('');
    const other = list.filter((i) => !CATS.some((c) => c.id === i.cat));
    if (other.length) results += groupHTML('أصناف أخرى', other);
  } else {
    results = groupHTML(search ? `نتائج «${search}»` : category ? category.name : sort === 'hot' ? 'الأكثر طلبًا' : 'كل الأصناف', list);
  }

  return `
  ${headerHTML('orders')}
  <main class="app ordering-page"><div class="wrap">
    <div class="order-intro">
      <div>
        <div class="eyebrow">THE ORIGINAL MENU</div>
        <h1>مشاوي على الفحم</h1>
        <p>اختار اللي نفسك فيه، وإحنا نولّع الفحم.</p>
        <div class="intro-details">
          <span class="pill"><span class="dot ${open ? '' : 'closed'}"></span>${open ? 'مفتوح الآن' : 'مقفول حاليًا'}</span>
          ${S.deliveryEta ? `<span>${icon('clock')} التوصيل خلال ${h(S.deliveryEta)}</span>` : ''}
          <span id="menuResultCount" role="status" aria-live="polite">${formatAmount(list.length)} صنف${activeCat ? ` في ${h(catName(activeCat))}` : ''}</span>
        </div>
      </div>
      <div class="menu-intro-media">
        <img src="/img/ai-hero.jpg" alt="مشاوي من منيو الأصلي" width="330" height="172" fetchpriority="high">
        <span class="grill-note">من الشواية إلى بابك</span>
      </div>
    </div>
    <div class="menu-controls">
      <div class="menu-search">${icon('search')}<input id="searchInput" type="search" aria-label="ابحث في المنيو" placeholder="نفسك في إيه؟ ابحث هنا…" value="${h(search)}" autocomplete="off"></div>
      <div class="menu-sort">
        <label for="sortSel">ترتيب حسب</label>
        <select id="sortSel" aria-label="ترتيب الأصناف">
          <option value="rec" ${sort === 'rec' ? 'selected' : ''}>المقترح</option>
          <option value="hot" ${sort === 'hot' ? 'selected' : ''}>الأكثر طلبًا</option>
          <option value="cheap" ${sort === 'cheap' ? 'selected' : ''}>الأقل سعرًا</option>
          <option value="pricey" ${sort === 'pricey' ? 'selected' : ''}>الأعلى سعرًا</option>
        </select>
      </div>
    </div>
    <div class="tabs" role="group" aria-label="تصنيفات الأصناف">
      <button class="tab ${!activeCat ? 'active' : ''}" data-act="filter" data-id="" aria-pressed="${!activeCat}">كل المنيو</button>
      ${CATS.map((c) => `<button class="tab ${activeCat === c.id ? 'active' : ''}" data-act="filter" data-id="${h(c.id)}" aria-pressed="${activeCat === c.id}">${h(c.name)}</button>`).join('')}
    </div>
    <div class="menu-results">${results}</div>
  </div>${footerHTML()}</main>`;
}

/* ============================== ٩) شيت الصنف ============================== */
let sheet = { item: null, addons: [], qty: 1, note: '' };
let sheetReturnFocus = null;

function openSheet(id) {
  const it = byId(id); if (!it) return;
  sheetReturnFocus = document.activeElement;
  sheet = { item: it, addons: [], qty: 1, note: '' };
  let bd = $('#sheet');
  if (!bd) { bd = document.createElement('div'); bd.id = 'sheet'; bd.className = 'sheet-backdrop'; document.body.appendChild(bd); }
  bd.innerHTML = sheetHTML(); bd.classList.add('show'); bd.inert = false; bd.setAttribute('aria-hidden', 'false');
  bd.onclick = (e) => { if (e.target === bd || e.target.closest('[data-act="sheet-close"]')) closeSheet(); };
  document.body.style.overflow = 'hidden';
  $('[data-act="sheet-close"]', bd)?.focus();
}
function closeSheet() {
  const bd = $('#sheet');
  const wasOpen = bd?.classList.contains('show');
  if (bd) { bd.classList.remove('show'); bd.inert = true; bd.setAttribute('aria-hidden', 'true'); }
  document.body.style.overflow = '';
  if (wasOpen && sheetReturnFocus?.isConnected) sheetReturnFocus.focus({ preventScroll: true });
}

function sheetHTML() {
  const it = sheet.item;
  const list = (S.addons && (S.addons[it.cat] || S.addons.default)) || [];
  const extras = sheet.addons.reduce((s, a) => s + a.price, 0);
  const total = ((it.price || 0) + extras) * sheet.qty;
  return `
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
    <div class="hero-img">
      ${it.image ? `<img src="${h(it.image)}" alt="${h(it.name)}">` : ''}
      <button class="close" data-act="sheet-close" aria-label="إغلاق تفاصيل الصنف">✕</button>
    </div>
    <div class="content">
      <h2 id="sheetTitle">${h(it.name)}</h2>
      ${it.priceLabel ? `<div class="small muted">${h(it.priceLabel)}</div>` : ''}
      ${it.desc ? `<p class="muted small">${h(it.desc)}</p>` : ''}
      <div class="row" style="margin:8px 0 14px">
        ${it.oldPrice ? `<span class="old-price">${money(it.oldPrice)}</span>` : ''}
        <span class="price" style="font-size:19px">${it.price == null ? 'عرض خاص' : money(it.price)}</span>
      </div>
      ${it.noPrice ? `
        <p class="small muted">العرض ده بيتجهّز على واتساب — ابعتلنا وهنأكدلك التفاصيل.</p>
        <div class="sheet-foot">
          <a class="btn btn-primary btn-block" target="_blank" rel="noopener"
             href="https://wa.me/${h(S.whatsapp)}?text=${encodeURIComponent('مرحبًا ' + S.name + ' 👋\nعايز أطلب: ' + it.name + '\n' + (it.desc || ''))}">💬 اطلب العرض على واتساب</a>
        </div>` : `
        ${list.length ? `
          <div style="margin-bottom:14px">
            <strong>إضافات اختيارية</strong>
            <div style="margin-top:8px">
              ${list.map((a, i) => `
                <button class="opt ${sheet.addons.includes(a) ? 'on' : ''}" data-act="addon" data-i="${i}" aria-pressed="${sheet.addons.includes(a)}">
                  <span><span class="tick" aria-hidden="true">✓</span> ${h(a.name)}</span><span class="muted small">+ ${money(a.price)}</span>
                </button>`).join('')}
            </div>
          </div>` : ''}
        <div style="margin-bottom:14px">
          <label for="sheetNote" class="sheet-label">ملاحظة (اختياري)</label>
          <input id="sheetNote" placeholder="مثال: من غير مخلل…" value="${h(sheet.note)}" style="margin-top:8px">
        </div>
        <div class="row" style="justify-content:space-between">
          <span class="qty"><button data-act="sheet-minus" aria-label="تقليل الكمية">−</button><span class="n">${formatAmount(sheet.qty)}</span><button data-act="sheet-plus" aria-label="زيادة الكمية">+</button></span>
          <span class="small muted">سعر الوحدة ${money((it.price || 0) + extras)}</span>
        </div>
        <div class="sheet-foot">
          <button class="btn btn-primary btn-block" data-act="sheet-add" ${it.available === false ? 'disabled' : ''}>${it.available === false ? 'نفد اليوم' : 'أضف للسلة — ' + money(total)}</button>
        </div>`}
    </div>
  </div>`;
}
function refreshSheet() {
  const bd = $('#sheet'); if (bd && bd.classList.contains('show')) {
    const n = $('#sheetNote'); if (n) sheet.note = n.value;
    const focused = document.activeElement;
    const action = focused?.getAttribute('data-act');
    const index = focused?.getAttribute('data-i');
    bd.innerHTML = sheetHTML();
    if (action) $$('[data-act]', bd).find((el) => el.getAttribute('data-act') === action && el.getAttribute('data-i') === index)?.focus();
  }
}

/* ============================== ١٠) السلة والشيك أوت ============================== */
function viewsCart() {
  if (!cart.length) {
    return `${headerHTML('cart')}<main class="app"><div class="wrap">
      <div class="page-head"><h1>السلة</h1></div>
      <div class="empty"><div class="big">🛒</div><h3>سلتك فاضية</h3><p>اختار من المنيو وابدأ طلبك</p>
      <a class="btn btn-primary" style="margin-top:14px" href="#/orders">تصفح المنيو</a></div>
    </div>${footerHTML()}</main>`;
  }
  const t = cartTotals();
  const short = Math.max(0, Number(S.minOrder || 0) - t.subtotal);
  return `
  ${headerHTML('cart')}<main class="app"><div class="wrap">
    <div class="page-head"><h1>السلة</h1><p>${formatAmount(cartCount())} صنف</p></div>
    <div class="list" style="margin-top:14px">
      ${cart.map((c) => `
        <div class="box">
          <div class="row" style="align-items:flex-start">
            <div class="tbl-thumb" style="width:74px;height:74px">${c.image ? `<img src="${h(c.image)}" alt="">` : ''}</div>
            <div style="flex:1;min-width:0">
              <div class="row" style="justify-content:space-between"><strong>${h(c.name)}</strong>
                <button class="muted" data-act="rm" data-key="${h(c.key)}" aria-label="حذف ${h(c.name)} من السلة">✕</button></div>
              ${c.addons && c.addons.length ? `<div class="small muted">إضافات: ${h(c.addons.map((a) => a.name).join('، '))}</div>` : ''}
              <div class="row" style="justify-content:space-between;margin-top:10px">
                <span class="qty"><button data-act="minus" data-key="${h(c.key)}" aria-label="تقليل كمية ${h(c.name)}">−</button><span class="n">${formatAmount(c.qty)}</span><button data-act="plus" data-key="${h(c.key)}" aria-label="زيادة كمية ${h(c.name)}">+</button></span>
                <span class="price">${money(lineTotal(c))}</span>
              </div>
              <div style="margin-top:10px"><input placeholder="ملاحظة على الصنف" value="${h(c.note || '')}" data-note="${h(c.key)}" style="padding:9px 12px;font-size:13px"></div>
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="box" style="margin-top:12px">
      <strong>كود الخصم</strong>
      <div class="row" style="margin-top:8px">
        <input id="promoInput" placeholder="اكتب الكود…" value="${h(promoCode)}">
        <button class="btn btn-sm" data-act="promo">تطبيق</button>
      </div>
      <div class="small muted" style="margin-top:8px">أكواد متاحة: ${(S.promos || []).map((x) => `<b>${h(x.code)}</b>`).join(' · ')}</div>
    </div>

    <div class="box" style="margin-top:12px">
      <div class="line"><span>المجموع</span><span>${money(t.subtotal)}</span></div>
      <div class="line"><span>التوصيل</span><span>${t.delivery ? money(t.delivery) : (cart.length ? 'مجاني 🎉' : '—')}</span></div>
      ${t.discount ? `<div class="line" style="color:var(--green)"><span>خصم</span><span>− ${money(t.discount)}</span></div>` : ''}
      <div class="line total"><span>الإجمالي</span><span class="price">${money(t.total)}</span></div>
    </div>

    ${short > 0 ? `<div class="box center" style="margin-top:12px;border-color:color-mix(in srgb, var(--gold) 45%, transparent)">أقل مبلغ للطلب ${money(S.minOrder)} — باقي ${money(short)}</div>` : ''}
    <button class="btn btn-primary btn-block" style="margin-top:14px" data-act="nav" data-to="checkout" ${short > 0 ? 'disabled' : ''}>
      متابعة الطلب — ${money(t.total)}
    </button>
    <a class="btn btn-ghost btn-block" style="margin-top:8px" href="#/orders">أضف أصناف تانية</a>
  </div>${footerHTML()}</main>`;
}

const TIME_SLOTS = ['في أقرب وقت', 'بعد ٣٠ دقيقة', 'بعد ساعة', 'بعد ساعتين'];

function viewsCheckout() {
  /* من شريط العرض على الرئيسية: #/checkout?promo=CODE → بنعتمد الكود تلقائيًا لو حقيقي */
  const q = parseHash().q;
  const promoParam = q.get('promo');
  if (promoParam && !promoCode && (S.promos || []).some((p) => p.code === promoParam)) promoCode = promoParam;
  if (!ME) {
    return `${headerHTML('checkout')}<main class="app"><div class="wrap">
      <div class="empty" style="padding-top:60px"><div class="big">🔐</div><h3>سجّل الدخول الأول</h3>
      <p>عشان نربط الطلب بحسابك وتقدر تتابعه في «طلباتي» من أي وقت</p>
      <div class="btn-row" style="justify-content:center;margin-top:14px">
        <a class="btn btn-primary" href="#/login?return=checkout">تسجيل الدخول</a>
        <a class="btn btn-ghost" href="#/signup?return=checkout">إنشاء حساب</a>
      </div></div></div></main>`;
  }
  if (!cart.length) {
    return `${headerHTML('checkout')}<main class="app"><div class="wrap"><div class="empty" style="padding-top:60px">
      <div class="big">🛒</div><h3>السلة فاضية</h3><a class="btn btn-primary" style="margin-top:14px" href="#/orders">تصفح المنيو</a></div></div></main>`;
  }
  const t = cartTotals();
  return `
  ${headerHTML('checkout')}<main class="app"><div class="wrap">
    <div class="page-head"><h1>إتمام الطلب</h1><p>${formatAmount(cartCount())} صنف · الإجمالي ${money(t.total)}</p></div>
    <form id="checkoutForm" class="list" style="margin-top:14px">
      <div class="box">
        <div class="grid2">
          <div><label class="lbl">الاسم *</label><input name="name" value="${h(ME.name || '')}" required></div>
          <div><label class="lbl">الهاتف *</label><input name="phone" value="${h(ME.phone || '')}" inputmode="tel" placeholder="01xxxxxxxxx" required></div>
          <div><label class="lbl">المنطقة</label><input name="area" value="${h(ME.area || '')}" placeholder="المعادي، مدينة نصر…"></div>
          <div><label class="lbl">وقت التوصيل</label><select name="time">${TIME_SLOTS.map((x) => `<option>${h(x)}</option>`).join('')}</select></div>
        </div>
        <div style="margin-top:10px"><label class="lbl">العنوان بالتفصيل *</label><textarea name="address" rows="2" placeholder="الشارع، رقم العمارة، الدور، علامة مميزة" required>${h(ME.address || '')}</textarea></div>
        <div style="margin-top:10px"><label class="lbl">ملاحظات للمطعم</label><textarea name="notes" rows="2" placeholder="من غير شطة، كاتشب زيادة…"></textarea></div>
      </div>
      <div class="box">
        <strong>طريقة الدفع</strong>
        <div style="margin-top:8px">
          ${(S.payments || []).map((p, i) => `
            <label class="opt ${i === 0 ? 'on' : ''}" data-pay="${h(p.id)}">
              <span>
                <span>${h(p.label)}${p.kind === 'online' ? ' <span class="mini-chip">أونلاين</span>' : ''}</span>
                ${p.note ? `<span class="small muted" style="display:block">${h(p.note)}</span>` : ''}
              </span>
              <input type="radio" name="payment" value="${h(p.id)}" ${i === 0 ? 'checked' : ''}>
            </label>`).join('')}
        </div>
        ${(S.onlinePayment && S.onlinePayment.enabled) ? `<p class="small muted" style="margin:8px 0 0">${S.onlinePayment.isDemo
          ? '💳 الدفع الأونلاين في وضع المحاكاة (تجربة) — الطلب بيتأكد بعد نجاح الدفع.'
          : '💳 هتتوجّه لصفحة دفع آمنة، والطلب بيتأكد بعد نجاح العملية.'}</p>` : ''}
      </div>

      ${(S.whatsappNotify && S.whatsappNotify.enabled) ? `
      <div class="box">
        <label class="opt" style="margin:0;cursor:pointer">
          <span>
            <span>💬 ابعتلي تحديثات الطلب على واتساب</span>
            <span class="small muted" style="display:block">رسالة عند كل تغيير في حالة طلبك (تأكيد، تجهيز، خرج للتوصيل، تم التوصيل)</span>
          </span>
          <input type="checkbox" name="notifyWhatsapp" ${ME.notifyWhatsapp !== false ? 'checked' : ''}>
        </label>
      </div>` : ''}
      <div class="box">
        <div class="line"><span>المجموع</span><span>${money(t.subtotal)}</span></div>
        <div class="line"><span>التوصيل</span><span>${t.delivery ? money(t.delivery) : 'مجاني 🎉'}</span></div>
        ${t.discount ? `<div class="line" style="color:var(--green)"><span>خصم</span><span>− ${money(t.discount)}</span></div>` : ''}
        <div class="line total"><span>الإجمالي</span><span class="price">${money(t.total)}</span></div>
      </div>
      <button class="btn btn-primary btn-block" type="submit">تأكيد الطلب 🍖</button>
      <p class="small muted center">بعد التأكيد هتلاقي الطلب في «طلباتي» وتقدر تتابع حالته لحظة بلحظة.</p>
    </form>
  </div>${footerHTML()}</main>`;
}

/* ============================== ١١) طلباتي والتتبع ============================== */
const MY = { orders: [], loaded: false, error: '' };

async function loadMyOrders(force) {
  if (!ME) { MY.orders = []; MY.loaded = true; return; }
  if (MY.loaded && !force) return;
  const userId = ME.id;
  try {
    const data = await api.req('/api/orders/mine');
    if (ME?.id !== userId) return;
    MY.orders = data.orders; MY.loaded = true; MY.error = '';
  } catch (err) { if (ME?.id === userId) MY.error = err.message; }
}

function viewsOrders() {
  if (!ME) {
    return `${headerHTML('my-orders')}<main class="app"><div class="wrap">
      <div class="empty" style="padding-top:60px"><div class="big">🔐</div><h3>سجّل الدخول</h3>
      <p>عشان تشوف طلباتك السابقة وتتابعها</p>
      <div class="btn-row" style="justify-content:center;margin-top:14px">
        <a class="btn btn-primary" href="#/login?return=my-orders">تسجيل الدخول</a>
        <a class="btn btn-ghost" href="#/signup?return=my-orders">إنشاء حساب</a>
      </div></div></div></main>`;
  }
  const list = MY.orders;
  return `
  ${headerHTML('my-orders')}<main class="app"><div class="wrap">
    <div class="page-head"><h1>طلباتي</h1><p>${list.length} طلب مرتبط بحسابك (${h(ME.email)})</p></div>
    ${MY.error ? `<div class="box" role="alert"><p>${h(MY.error)}</p><button class="btn btn-sm btn-ghost" data-act="refresh-orders">إعادة المحاولة</button></div>` : ''}
    ${!list.length && !MY.error ? `<div class="empty"><div class="big">🧾</div><h3>مفيش طلبات لسه</h3>
      <a class="btn btn-primary" style="margin-top:14px" href="#/orders">ابدأ طلبك</a></div>` : `
    <div class="list" style="margin-top:14px">
      ${list.map((o) => `
        <button class="card" style="text-align:start" data-act="nav" data-to="order/${h(o.id)}">
          <div class="box" style="border:0;background:none;padding:14px;width:100%">
            <div class="row" style="justify-content:space-between">
              <strong>طلب ${h(o.id)}</strong>${statusChip(o.status)}
            </div>
            <div class="small muted" style="margin-top:6px">${h(fmtDT(o.createdAt))} · ${o.items.length} صنف</div>
            <div class="small" style="margin-top:8px">${h(o.items.map((i) => `${i.name} ×${i.qty}`).join('، '))}</div>
            <div class="row" style="justify-content:space-between;margin-top:10px">
              <span class="price">${money(o.total)}</span><span style="color:var(--link);font-weight:700">تتبع الطلب ←</span>
            </div>
          </div>
        </button>`).join('')}
    </div>`}
  </div>${footerHTML()}</main>`;
}

function timelineHTML(o) {
  const flow = FLOW();
  const idx = flow.findIndex((s) => s.id === o.status);
  const cancelled = o.status === 'cancelled';
  const hist = {};
  for (const hh of o.history || []) hist[hh.status] = hh.at;
  return `
  <div class="steps">
    ${flow.map((s, i) => {
      const done = !cancelled && i < idx, now = !cancelled && i === idx;
      return `<div class="step ${done ? 'done' : now ? 'now' : 'off'}">
        <span class="bubble">${done ? '✓' : s.emoji}</span>
        <h4>${h(s.label)} ${hist[s.id] && (done || now) ? `<span class="small muted">· ${fmtT(hist[s.id])}</span>` : ''}</h4>
        <p>${h(s.note)}</p></div>`;
    }).join('')}
    ${cancelled ? `<div class="step now"><span class="bubble">✖️</span><h4>ملغي</h4><p>الطلب اتلغى${hist.cancelled ? ' · ' + fmtT(hist.cancelled) : ''}</p></div>` : ''}
  </div>`;
}

function viewOrderPage(id) {
  const o = MY.orders.find((x) => x.id === id);
  if (!o) {
    return `${headerHTML('my-orders')}<main class="app"><div class="wrap">
      <div class="empty" style="padding-top:50px"><div class="big">⏳</div><h3>هنجيب الطلب…</h3></div>
      <div class="center"><a class="btn btn-ghost" href="#/my-orders">كل الطلبات</a></div></div></main>`;
  }
  const flow = FLOW();
  const idx = flow.findIndex((s) => s.id === o.status);
  const pct = o.status === 'cancelled' ? 100 : Math.round(((idx + 1) / flow.length) * 100);
  return `
  ${headerHTML('my-orders')}<main class="app"><div class="wrap">
    <div class="page-head">
      <a class="small muted" href="#/my-orders">→ كل الطلبات</a>
      <h1>طلب ${h(o.id)}</h1><p>${h(fmtDT(o.createdAt))}</p>
    </div>
    <div class="box" style="margin-top:14px">
      <div class="row" style="justify-content:space-between">${statusChip(o.status)}
        <span class="small muted">آخر تحديث ${h(timeAgo(o.updatedAt || o.createdAt))}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <p class="small muted" style="margin:8px 0 0">دي حالة الطلب (مش تتبع GPS) — بتتحدّث مباشرة من المطعم.</p>
    </div>
    <div class="box" style="margin-top:12px">
      <div class="row" style="justify-content:space-between">
        <strong>💳 الدفع</strong>${payChip(o)}
      </div>
      <div class="line"><span class="muted">الطريقة</span><span>${h(((S.payments || []).find((p) => p.id === o.payment) || {}).label || o.payment)}</span></div>
      ${o.paidAt ? `<div class="line"><span class="muted">تم الدفع</span><span class="small">${h(fmtDT(o.paidAt))}</span></div>` : ''}
      ${(o.payment_status === 'pending' || o.payment_status === 'failed') ? `
        <div class="btn-row" style="margin-top:10px">
          <button class="btn btn-primary btn-sm" data-act="pay-now" data-id="${h(o.id)}">ادفع الآن ${money(o.total)} 💳</button>
          <a class="btn btn-ghost btn-sm" href="#/orders">الدفع عند الاستلام؟ كلمنا</a>
        </div>` : ''}
      ${o.refundedAt ? `<div class="small muted" style="margin-top:8px">تم إرجاع المبلغ بتاريخ ${h(fmtDT(o.refundedAt))}</div>` : ''}
    </div>

    <div class="box" style="margin-top:12px">${timelineHTML(o)}</div>
    <div class="box" style="margin-top:12px">
      <strong>تفاصيل الطلب (Order Items)</strong>
      ${o.items.map((i) => `
        <div class="line"><span>${h(i.name)} ×${i.qty}
          ${i.addons && i.addons.length ? `<div class="small muted">${h(i.addons.map((a) => a.name).join('، '))}</div>` : ''}
          ${i.note ? `<div class="small muted">📝 ${h(i.note)}</div>` : ''}</span>
          <span>${money(i.line_total || (i.price + (i.addons || []).reduce((a, x) => a + x.price, 0)) * i.qty)}</span></div>`).join('')}
      <div class="line"><span>المجموع</span><span>${money(o.subtotal)}</span></div>
      <div class="line"><span>التوصيل</span><span>${o.delivery ? money(o.delivery) : 'مجاني'}</span></div>
      ${o.discount ? `<div class="line" style="color:var(--green)"><span>خصم${o.promo ? ' (' + h(o.promo) + ')' : ''}</span><span>− ${money(o.discount)}</span></div>` : ''}
      <div class="line total"><span>الإجمالي</span><span class="price">${money(o.total)}</span></div>
      <div class="line"><span class="muted">طريقة الدفع</span><span>${h(((S.payments || []).find((p) => p.id === o.payment) || {}).label || o.payment)}</span></div>
    </div>
    <div class="box" style="margin-top:12px">
      <strong>بيانات التوصيل</strong>
      <div class="line"><span class="muted">الاسم</span><span>${h(o.customer.name)}</span></div>
      <div class="line"><span class="muted">الهاتف</span><span>${h(o.customer.phone)}</span></div>
      <div class="line"><span class="muted">العنوان</span><span class="small">${h(o.customer.area ? o.customer.area + ' — ' : '')}${h(o.customer.address)}</span></div>
      <div class="line"><span class="muted">وقت التوصيل</span><span>${h(o.customer.time || 'في أقرب وقت')}</span></div>
      ${o.customer.notes ? `<div class="line"><span class="muted">ملاحظات</span><span class="small">${h(o.customer.notes)}</span></div>` : ''}
    </div>
    <div class="btn-row" style="margin-top:14px">
      <a class="btn btn-ghost" href="tel:${h(S.phone)}">📞 اتصل بالمطعم</a>
      ${['new', 'received'].includes(o.status) ? `<button class="btn btn-danger" data-act="cancelOrder" data-id="${h(o.id)}">إلغاء الطلب</button>` : ''}
    </div>
  </div>${footerHTML()}</main>`;
}

/* ============================== ١٢) الحساب ============================== */
function authPageHTML(kind, q) {
  const ret = q.get('return') || '';
  const back = ret ? `<input type="hidden" name="return" value="${h(ret)}">` : '';
  const isLogin = kind === 'login';
  const isReset = kind === 'reset';
  const token = q.get('token') || '';
  return `
  ${headerHTML('account')}<main class="app"><div class="wrap" style="max-width:460px">
    <div class="page-head"><h1>${isLogin ? 'تسجيل الدخول' : isReset ? 'كلمة سر جديدة' : 'إنشاء حساب'}</h1>
      <p>${isLogin ? 'ادخل على حسابك عشان تتابع طلباتك' : isReset ? 'اكتب كلمة السر الجديدة' : 'حسابك وطلباتك محفوظين عند المطعم، وتقدر تدخل من أي جهاز'}</p></div>
    <form id="${isLogin ? 'loginForm' : isReset ? 'resetForm' : 'signupForm'}" class="box" style="margin-top:14px">
      ${back}${isReset ? `<input type="hidden" name="token" value="${h(token)}">` : ''}
      ${isLogin || isReset ? '' : `
        <div style="margin-bottom:10px"><label class="lbl" for="signupName">الاسم</label><input id="signupName" name="name" autocomplete="name" required minlength="2" maxlength="120" placeholder="اسمك"></div>
        <div style="margin-bottom:10px"><label class="lbl" for="signupPhone">رقم الهاتف</label><input id="signupPhone" name="phone" autocomplete="tel" inputmode="tel" maxlength="30" placeholder="01xxxxxxxxx"></div>`}
      ${isReset ? '' : `<div style="margin-bottom:10px"><label class="lbl" for="authEmail">الإيميل</label><input id="authEmail" name="email" type="email" autocomplete="email" dir="ltr" required maxlength="254" placeholder="you@example.com"></div>`}
      <div style="margin-bottom:14px"><label class="lbl" for="authPassword">كلمة السر${isLogin ? '' : ' (٦ أحرف على الأقل)'}</label>
        <input id="authPassword" name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required minlength="6" maxlength="128" placeholder="••••••"></div>
      <p class="form-error small" data-form-error role="alert" hidden></p>
      <button class="btn btn-primary btn-block" type="submit">${isLogin ? 'دخول' : isReset ? 'حفظ كلمة السر' : 'إنشاء الحساب'}</button>
      <div class="center small muted" style="margin-top:12px">
        ${isLogin
          ? `مش عندك حساب؟ <a href="#/signup${ret ? '?return=' + h(ret) : ''}" style="color:var(--link)">أنشئ حساب</a>
             · <a href="#/forgot" style="color:var(--link)">نسيت كلمة السر؟</a>`
          : isReset ? `<a href="#/login" style="color:var(--link)">رجوع لتسجيل الدخول</a>`
          : `عندك حساب؟ <a href="#/login${ret ? '?return=' + h(ret) : ''}" style="color:var(--link)">سجّل الدخول</a>`}
      </div>
      ${isLogin && S.demoLogin === true ? `<div class="center" style="margin-top:14px">
        <button type="button" class="btn btn-sm btn-ghost" data-act="demo">دخول سريع بحساب تجريبي (عميل)</button>
      </div>` : ''}
    </form>
  </div>${footerHTML()}</main>`;
}

function viewsAccount() {
  if (!ME) return authPageHTML('login', new URLSearchParams(''));
  const staff = isStaff();
  return `
  ${headerHTML('account')}<main class="app"><div class="wrap">
    <div class="page-head"><h1>حسابي</h1><p>${h(ME.email)} · <span class="role-chip role-${h(ME.role)}">${ME.role === 'admin' ? 'أدمن' : ME.role === 'supervisor' ? 'مشرف' : 'عميل'}</span></p></div>
    <div class="kpis" style="margin-top:14px;grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><b>${MY.orders.length}</b><span>طلبي</span></div>
      <div class="kpi"><b>${money(MY.orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0))}</b><span>إجمالي مشترياتي</span></div>
      <div class="kpi"><b>${cartCount()}</b><span>في السلة</span></div>
    </div>
    ${staff ? `<div class="box" style="margin-top:12px;border-color:color-mix(in srgb, var(--gold) 45%, transparent)">
      <strong>أنت مسجّل كـ${ME.role === 'admin' ? 'أدمن' : 'مشرف'}</strong>
      <p class="small muted" style="margin:6px 0 10px">عندك وصول للوحة الإدارة: الطلبات، العملاء، الحالات، والإشعارات.</p>
      <a class="btn btn-primary btn-sm" href="#/admin">افتح لوحة الإدارة</a>
    </div>` : ''}
    <form id="profileForm" class="box" style="margin-top:12px">
      <strong>بياناتي</strong>
      <div class="grid2" style="margin-top:10px">
        <div><label class="lbl">الاسم</label><input name="name" value="${h(ME.name || '')}"></div>
        <div><label class="lbl">الهاتف</label><input name="phone" value="${h(ME.phone || '')}" inputmode="tel" placeholder="01xxxxxxxxx"></div>
        <div><label class="lbl">المنطقة</label><input name="area" value="${h(ME.area || '')}"></div>
        <div><label class="lbl">العنوان</label><input name="address" value="${h(ME.address || '')}"></div>
      </div>
      ${(S.whatsappNotify && S.whatsappNotify.enabled) ? `
      <label class="opt" style="margin:12px 0 0;cursor:pointer">
        <span>
          <span>💬 تحديثات الطلب على واتساب</span>
          <span class="small muted" style="display:block">هنبعتلك حالة طلبك على الرقم اللي فوق</span>
        </span>
        <input type="checkbox" name="notifyWhatsapp" ${ME.notifyWhatsapp !== false ? 'checked' : ''}>
      </label>` : ''}
      <button class="btn btn-primary btn-block" style="margin-top:10px" type="submit">حفظ البيانات</button>
    </form>
    <form id="passwordForm" class="box" style="margin-top:12px">
      <strong>تغيير كلمة السر</strong>
      <p class="small muted">بعد الحفظ، الجلسات المفتوحة على الأجهزة التانية هتتقفل.</p>
      <div><label class="lbl" for="currentPassword">كلمة السر الحالية</label><input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" required maxlength="128"></div>
      <div style="margin-top:10px"><label class="lbl" for="newPassword">كلمة السر الجديدة</label><input id="newPassword" name="password" type="password" autocomplete="new-password" required minlength="6" maxlength="128"></div>
      <div style="margin-top:10px"><label class="lbl" for="confirmPassword">تأكيد كلمة السر</label><input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" required minlength="6" maxlength="128"></div>
      <p class="form-error small" data-form-error role="alert" hidden></p>
      <button class="btn btn-primary btn-block" style="margin-top:10px" type="submit">حفظ كلمة السر</button>
    </form>
    <div class="btn-row" style="margin-top:12px">
      <a class="btn btn-ghost" href="#/my-orders">🧾 طلباتي</a>
      ${staff ? `<a class="btn btn-ghost" href="#/admin">🧑‍🍳 لوحة الإدارة</a>` : ''}
      <button class="btn btn-ghost" data-act="theme">${getTheme() === 'night' ? '🌙 الليل — فاتح' : '☀️ النهار — داكن'}</button>
      <button class="btn btn-danger" data-act="logout">تسجيل الخروج</button>
    </div>
  </div>${footerHTML()}</main>`;
}

/* ============================== ١٣) لوحة الإدارة ============================== */
const AD = { tab: 'dash', orders: [], stats: null, users: [], customers: [], q: '', status: 'all', payment: 'all', range: 'all', editing: null,
             payCfg: null, waCfg: null, waTemplates: null, waLog: [], system: null };

function adminTabsHTML(active) {
  const tabs = [
    ['dash', '📊 لوحة المتابعة'],
    ['orders', '🧾 الطلبات'],
    ['customers', '👥 العملاء'],
    ...(isAdmin() ? [['menu', '🍔 المنيو'], ['users', '🔑 المستخدمون'],
                     ['payments', '💳 الدفع'], ['whatsapp', '💬 واتساب'], ['settings', '⚙️ الإعدادات'],
                     ['system', '🛠️ النظام']] : []),
  ];
  return `<div class="admin-tabs">${tabs.map(([id, label]) =>
    `<button class="admin-tab ${active === id ? 'on' : ''}" data-act="admin-tab" data-id="${id}">${label}</button>`).join('')}</div>`;
}

async function loadAdminOrders() {
  const p = new URLSearchParams();
  if (AD.status && AD.status !== 'all') p.set('status', AD.status);
  if (AD.payment && AD.payment !== 'all') p.set('payment', AD.payment);
  if (AD.q) p.set('q', AD.q);
  if (AD.range === 'today') p.set('from', new Date().toDateString());
  const userId = ME?.id;
  const data = await api.req('/api/admin/orders?' + p.toString());
  if (ME?.id === userId && isStaff()) AD.orders = data.orders;
}
async function loadAdminStats() {
  const userId = ME?.id;
  const data = await api.req('/api/admin/stats');
  if (ME?.id === userId && isStaff()) AD.stats = data;
}

function viewsAdmin(q) {
  if (!ME) {
    return `${headerHTML('admin')}<main class="app"><div class="wrap"><div class="empty" style="padding-top:60px">
      <div class="big">🔐</div><h3>سجّل الدخول</h3><p>لوحة الإدارة للمشرفين والأدمن فقط</p>
      <a class="btn btn-primary" style="margin-top:14px" href="#/login?return=admin">تسجيل الدخول</a></div></div></main>`;
  }
  if (!isStaff()) {
    /* الحماية الحقيقية على السيرفر — دي مجرد رسالة للمستخدم */
    return `${headerHTML('admin')}<main class="app"><div class="wrap"><div class="empty" style="padding-top:60px">
      <div class="big">🚫</div><h3>الصفحة دي للمشرفين والأدمن بس</h3>
      <p>حسابك مسجّل كعميل (${h(ME.email)}) — الصلاحيات بتتفحص على السيرفر مش بس إخفاء الأزرار.</p>
      <a class="btn btn-primary" style="margin-top:14px" href="#/">الرئيسية</a></div></div></main>`;
  }
  const tab = q.get('tab') || AD.tab;
  AD.tab = tab;
  let body = '';
  if (tab === 'dash') body = adminDashHTML();
  else if (tab === 'orders') body = adminOrdersHTML();
  else if (tab === 'customers') body = adminCustomersHTML();
  else if (tab === 'menu') body = isAdmin() ? adminMenuHTML() : deniedHTML();
  else if (tab === 'users') body = isAdmin() ? adminUsersHTML() : deniedHTML();
  else if (tab === 'payments') body = isAdmin() ? adminPaymentsHTML() : deniedHTML();
  else if (tab === 'whatsapp') body = isAdmin() ? adminWhatsappHTML() : deniedHTML();
  else if (tab === 'settings') body = isAdmin() ? adminSettingsHTML() : deniedHTML();
  else if (tab === 'system') body = isAdmin() ? adminSystemHTML() : deniedHTML();

  return `
  ${headerHTML('admin')}<main class="app"><div class="wrap">
    <div class="page-head"><h1>لوحة الإدارة</h1>
      <p>${h(ME.name || ME.email)} · <span class="role-chip role-${h(ME.role)}">${ME.role === 'admin' ? 'أدمن' : 'مشرف'}</span>${AD.stats ? ` · ${AD.stats.today.orders} طلب النهارده` : ''}</p></div>
    ${adminTabsHTML(tab)}
    <div id="adminBody" style="margin-top:14px">${body}</div>
  </div>${footerHTML()}</main>`;
}

const deniedHTML = () => `<div class="empty"><div class="big">🔒</div><h3>للأدمن فقط</h3></div>`;

function adminDashHTML() {
  const s = AD.stats;
  if (!s) return `<div class="empty"><div class="big">⏳</div><h3>بيحمّل…</h3></div>`;
  const c = s.today.counts || {};
  const order = ['new', 'received', 'preparing', 'on_way', 'delivered', 'cancelled'];
  return `
  <div class="kpis">
    <div class="kpi hl"><b>${s.today.orders}</b><span>طلبات اليوم</span></div>
    <div class="kpi"><b>${c.new || 0}</b><span>طلبات جديدة</span></div>
    <div class="kpi"><b>${c.received || 0}</b><span>تم استلامها</span></div>
    <div class="kpi"><b>${c.preparing || 0}</b><span>جاري التجهيز</span></div>
    <div class="kpi"><b>${c.on_way || 0}</b><span>خرجت للتوصيل</span></div>
    <div class="kpi"><b>${c.delivered || 0}</b><span>تم التوصيل</span></div>
    <div class="kpi"><b>${c.cancelled || 0}</b><span>ملغية</span></div>
    <div class="kpi hl"><b>${money(s.today.sales)}</b><span>إجمالي مبيعات اليوم</span></div>
    <div class="kpi"><b>${s.today.paidOrders || 0}</b><span>طلبات مدفوعة</span></div>
    <div class="kpi hl"><b>${money(s.today.paidSales || 0)}</b><span>مبيعات محصّلة اليوم</span></div>
  </div>
  <div class="box" style="margin-top:12px">
    <div class="row" style="justify-content:space-between">
      <strong>حالة المطعم: ${isOpenNow() ? '🟢 مفتوح' : '🔴 مقفول'}${S.forceState ? ' (يدوي)' : ''}</strong>
      <span class="small muted">الإجمالي الكلي: ${s.all.orders} طلب · ${money(s.all.sales)}</span>
    </div>
    ${isAdmin() ? `<div class="btn-row" style="margin-top:10px">
      <button class="btn btn-sm ${S.forceState === 'open' ? 'btn-primary' : 'btn-ghost'}" data-act="force" data-v="open">فتح يدوي</button>
      <button class="btn btn-sm ${S.forceState === 'closed' ? 'btn-primary' : 'btn-ghost'}" data-act="force" data-v="closed">قفل يدوي</button>
      <button class="btn btn-sm ${!S.forceState ? 'btn-primary' : 'btn-ghost'}" data-act="force" data-v="">تلقائي حسب المواعيد</button>
    </div>` : ''}
  </div>
  <div class="section-head"><h2>آخر الطلبات</h2><button class="link" data-act="admin-tab" data-id="orders">إدارة الطلبات ←</button></div>
  ${AD.orders.length ? `<div class="list">${AD.orders.slice(0, 6).map(orderRowHTML).join('')}</div>`
    : `<div class="empty"><div class="big">🍽️</div><h3>مفيش طلبات لسه</h3></div>`}`;
}

function orderRowHTML(o) {
  const flow = FLOW();
  const i = flow.findIndex((s) => s.id === o.status);
  const next = flow[i + 1];
  return `
  <div class="row-line" style="flex-wrap:wrap">
    <div class="grow">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap">
        <strong>${h(o.id)} · ${h(o.customer.name)}</strong>
        <span class="row" style="gap:6px">${payChip(o)}${statusChip(o.status)}</span>
      </div>
      <div class="small muted" style="margin-top:3px">${h(fmtDT(o.createdAt))} · ${h(o.customer.phone)}${o.customer.area ? ' · ' + h(o.customer.area) : ''}</div>
      <div class="small" style="margin-top:5px">${h(o.items.map((x) => `${x.name} ×${x.qty}`).join('، '))}</div>
    </div>
    <div class="row" style="gap:6px">
      <span class="price">${money(o.total)}</span>
      <button class="btn btn-sm btn-ghost" data-act="order-detail" data-id="${h(o.id)}">تفاصيل</button>
      ${next ? `<button class="btn btn-sm btn-primary" data-act="set-status" data-id="${h(o.id)}" data-v="${h(next.id)}">➜ ${h(next.label)}</button>` : ''}
    </div>
  </div>`;
}

function adminOrdersHTML() {
  const counts = (AD.stats && AD.stats.today.counts) || {};
  const pc = (AD.stats && AD.stats.today.payCounts) || null;
  const statuses = [{ id: 'all', label: 'الكل', emoji: '📦' }, ...(S.statuses || [])];
  return `
  <div class="box">
    <div class="row" style="gap:8px">
      <input id="adminSearch" placeholder="ابحث: رقم الطلب، اسم، هاتف، عنوان، إيميل…" value="${h(AD.q)}">
      <button class="btn btn-sm ${AD.range === 'today' ? 'btn-primary' : 'btn-ghost'}" data-act="admin-range" data-v="${AD.range === 'today' ? 'all' : 'today'}">${AD.range === 'today' ? 'كل الأيام' : 'النهارده بس'}</button>
    </div>
    <div class="chips" style="margin-top:10px">
      ${statuses.map((s) => `<button class="chip ${AD.status === s.id ? 'active' : ''}" data-act="admin-filter" data-id="${s.id}">
        ${s.emoji || ''} ${h(s.label)}${s.id !== 'all' ? `<span class="n">${counts[s.id] || 0}</span>` : ''}</button>`).join('')}
    </div>
    <div class="chips" style="margin-top:8px">
      ${[['all', '💳 كل المدفوعات'], ['paid', '✅ مدفوع'], ['pending', '⏳ بانتظار الدفع'], ['unpaid', '💵 عند الاستلام'], ['failed', '⚠️ فشل'], ['refunded', '↩️ مرتجع']]
        .map(([id, label]) => `<button class="chip ${AD.payment === id ? 'active' : ''}" data-act="admin-pay-filter" data-id="${id}">${label}${id !== 'all' && pc ? `<span class="n">${pc[id] || 0}</span>` : ''}</button>`).join('')}
    </div>
  </div>
  <p class="small muted" style="margin:12px 2px">${AD.orders.length} طلب معروض</p>
  ${AD.orders.length ? `<div class="list">${AD.orders.map(orderRowHTML).join('')}</div>`
    : `<div class="empty"><div class="big">🔍</div><h3>مفيش طلبات بالفلتر ده</h3></div>`}`;
}

function adminCustomersHTML() {
  if (!AD.customers.length) return `<div class="empty"><div class="big">👥</div><h3>مفيش عملاء مسجلين لسه</h3></div>`;
  return `
  <div class="box" style="margin-bottom:12px"><input id="custSearch" placeholder="ابحث بالإيميل أو الاسم…" value="${h(AD.q)}"></div>
  <div class="list">
    ${AD.customers.filter((c) => !AD.q || (c.name + c.email + (c.phone || '')).toLowerCase().includes(AD.q.toLowerCase())).map((c) => `
      <div class="row-line">
        <div class="grow">
          <strong>${h(c.name || 'بدون اسم')}</strong> <span class="role-chip role-${h(c.role)}">${h(c.email)}</span>
          <div class="small muted" style="margin-top:3px">📱 ${h(c.phone || '—')} · 🧾 ${c.orders} طلب · ${money(c.total)}${c.lastOrder ? ` · آخر طلب ${h(timeAgo(c.lastOrder))}` : ''}</div>
        </div>
        <button class="btn btn-sm btn-ghost" data-act="admin-filter-cust" data-id="${h(c.id)}" data-q="${h(c.email)}">طلباته</button>
      </div>`).join('')}
  </div>`;
}

function adminMenuHTML() {
  const e = AD.editing;
  const lib = S.imageLibrary || [];
  return `
  <div class="box" style="margin-bottom:12px">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
      <strong>${MENU.length} صنف · ${missingImages().length} صنف بصور مكتبة (مش صورة مخصصة)</strong>
      <div class="btn-row">
        <button class="btn btn-sm btn-ghost" data-act="gen-missing">✨ ولّد صور للأصناف بدون صورة</button>
        <button class="btn btn-sm btn-ghost" data-act="gen-all">🔁 ولّد صور لكل الأصناف المستوردة</button>
        <button class="btn btn-sm btn-primary" data-act="menu-new">＋ صنف جديد</button>
      </div>
    </div>
    <p class="small muted" style="margin:8px 0 0">الصور بتتولّد تلقائيًا حسب اسم الصنف وتصنيفه (مزوّد AI لو فيه مفتاح GEMINI_API_KEY أو OPENAI_API_KEY، وإلا من المكتبة المدمجة). تقدر تغيّر أي صورة يدويًا برفع صورة أو اختيار واحدة من المكتبة.</p>
  </div>

  ${e ? `
  <div class="box" style="margin-bottom:12px;border-color:color-mix(in srgb, var(--gold) 45%, transparent)">
    <strong>${e.__new ? 'إضافة صنف جديد' : 'تعديل: ' + h(e.name)}</strong>
    <form id="menuForm" style="margin-top:10px">
      <input type="hidden" name="id" value="${h(e.id || '')}">
      <div class="grid2">
        <div><label class="lbl">الاسم *</label><input name="name" value="${h(e.name || '')}" required></div>
        <div><label class="lbl">التصنيف</label><select name="cat">${CATS.map((c) => `<option value="${h(c.id)}" ${e.cat === c.id ? 'selected' : ''}>${h(c.name)}</option>`).join('')}</select></div>
        <div><label class="lbl">السعر (فاضي = عرض بدون سعر)</label><input name="price" type="number" step="1" min="0" value="${e.price == null ? '' : e.price}"></div>
        <div><label class="lbl">السعر القديم (اختياري)</label><input name="oldPrice" type="number" step="1" min="0" value="${e.oldPrice || ''}"></div>
        <div><label class="lbl">وصف مختصر</label><input name="desc" value="${h(e.desc || '')}"></div>
        <div><label class="lbl">نص مكان السعر (اختياري)</label><input name="priceLabel" value="${h(e.priceLabel || '')}" placeholder="إضافة"></div>
      </div>
      <div class="btn-row" style="margin-top:10px">
        <label class="opt" style="width:auto;margin:0"><span><input type="checkbox" name="featured" ${e.featured ? 'checked' : ''}> الأكثر طلبًا</span><span></span></label>
        <label class="opt" style="width:auto;margin:0"><span><input type="checkbox" name="spicy" ${e.spicy ? 'checked' : ''}> 🌶️ حار</span><span></span></label>
        <label class="opt" style="width:auto;margin:0"><span><input type="checkbox" name="available" ${e.available !== false ? 'checked' : ''}> متوفر للطلب</span><span></span></label>
        <label class="opt" style="width:auto;margin:0"><span><input type="checkbox" name="active" ${e.active !== false ? 'checked' : ''}> ظاهر في المنيو</span><span></span></label>
        <label class="opt" style="width:auto;margin:0"><span><input type="checkbox" name="noPrice" ${e.noPrice ? 'checked' : ''}> عرض (زرار واتساب)</span><span></span></label>
      </div>
      <div class="row" style="margin-top:12px;gap:8px">
        <div class="tbl-thumb" style="width:84px;height:72px">${e.image ? `<img src="${h(e.image)}" alt="" id="editThumb">` : ''}</div>
        <div class="btn-row">
          <label class="btn btn-sm btn-ghost" style="cursor:pointer">📤 ارفع صورة
            <input type="file" id="imgUpload" accept="image/*" class="hidden"></label>
          <button type="button" class="btn btn-sm btn-ghost" data-act="gen-one" data-id="${h(e.id || '')}">✨ ولّد بالذكاء الاصطناعي</button>
        </div>
      </div>
      ${lib.length ? `<div style="margin-top:10px"><label class="lbl">أو اختر من مكتبة الصور</label>
        <div class="img-picker">${lib.map((x) => `<button type="button" class="img-pick ${e.image === x.url ? 'on' : ''}" data-act="pick-img" data-url="${h(x.url)}" title="${h(x.label)}"><img src="${h(x.url)}" alt="${h(x.label)}" loading="lazy"></button>`).join('')}</div></div>` : ''}
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-primary btn-sm" type="submit">حفظ الصنف</button>
        <button class="btn btn-ghost btn-sm" type="button" data-act="menu-cancel">إلغاء</button>
      </div>
    </form>
  </div>` : ''}

  <div class="list">
    ${MENU.map((m) => `
      <div class="row-line">
        <div class="tbl-thumb">${m.image ? `<img src="${h(m.image)}" alt="">` : ''}</div>
        <div class="grow">
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <strong>${h(m.name)}</strong>
            ${m.featured ? `<span class="role-chip role-admin">★ الأكثر طلبًا</span>` : ''}
            ${m.active === false ? `<span class="role-chip off-chip">موقوف</span>` : ''}
            ${m.imageSource && m.imageSource !== 'upload' ? `<span class="role-chip">صورة: ${h({ ai: 'AI', pool: 'مكتبة', placeholder: 'بديلة' }[m.imageSource] || m.imageSource)}</span>` : ''}
          </div>
          <div class="small muted" style="margin-top:3px">${h(catName(m.cat))} · ${m.noPrice ? 'عرض خاص' : money(m.price)}${m.oldPrice ? ` (قبل ${money(m.oldPrice)})` : ''}</div>
        </div>
        <div class="btn-row" style="justify-content:flex-end">
          <button class="btn btn-sm btn-ghost" data-act="menu-edit" data-id="${h(m.id)}">تعديل</button>
          <button class="btn btn-sm btn-ghost" data-act="menu-toggle" data-id="${h(m.id)}">${m.active === false ? 'تفعيل' : 'إيقاف'}</button>
          <button class="btn btn-sm btn-danger" data-act="menu-del" data-id="${h(m.id)}">حذف</button>
        </div>
      </div>`).join('')}
  </div>`;
}

function adminUsersHTML() {
  return `
  <div class="box" style="margin-bottom:12px">
    <strong>المستخدمون (${AD.users.length})</strong>
    <p class="small muted" style="margin:6px 0 0">أي مستخدم جديد يسجل بيبقى Customer تلقائيًا. من هنا تقدر تغيّر أي حد لـ Supervisor أو Admin، وتفعّل/تعطّل المشرفين.</p>
    <div class="row" style="margin-top:10px"><input id="userSearch" placeholder="ابحث بالإيميل أو الاسم…"></div>
  </div>
  <div class="list">
    ${AD.users.filter((x) => !AD.q || (x.name + x.email).toLowerCase().includes(AD.q.toLowerCase())).map((x) => `
      <div class="row-line" style="flex-wrap:wrap">
        <div class="grow">
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <strong>${h(x.name || 'بدون اسم')}</strong>
            <span class="role-chip role-${h(x.role)}">${x.role === 'admin' ? 'أدمن' : x.role === 'supervisor' ? 'مشرف' : 'عميل'}</span>
            ${x.active === false ? `<span class="role-chip off-chip">معطّل</span>` : ''}
            ${x.isOwner ? `<span class="role-chip">صاحب المطعم</span>` : ''}
            ${x.id === ME.id ? `<span class="role-chip">إنت</span>` : ''}
          </div>
          <div class="small muted" style="margin-top:3px">${h(x.email)} · 🧾 ${x.orders} طلب${x.phone ? ' · 📱 ' + h(x.phone) : ''}</div>
        </div>
        <div class="btn-row" style="justify-content:flex-end">
          <select data-act="user-role" data-id="${h(x.id)}" style="width:auto;padding:8px 10px;font-size:12.5px" ${x.id === ME.id || x.isOwner ? 'disabled' : ''}>
            <option value="customer" ${x.role === 'customer' ? 'selected' : ''}>عميل</option>
            <option value="supervisor" ${x.role === 'supervisor' ? 'selected' : ''}>مشرف</option>
            <option value="admin" ${x.role === 'admin' ? 'selected' : ''}>أدمن</option>
          </select>
          <button class="btn btn-sm ${x.active === false ? 'btn-ok' : 'btn-danger'}" data-act="user-active" data-id="${h(x.id)}" data-v="${x.active === false ? '1' : '0'}" ${x.id === ME.id || x.isOwner ? 'disabled' : ''}>
            ${x.active === false ? 'تفعيل' : 'تعطيل'}</button>
        </div>
      </div>`).join('')}
  </div>`;
}

function adminPaymentsHTML() {
  const c = AD.payCfg || { provider: 'demo', currency: 'EGP', stripe: {}, paymob: {} };
  const methods = AD.methods || (S.payments || []);
  const proto = location.origin;
  const list = AD.paidList || [];
  return `
  <form id="payCfgForm" class="box">
    <strong>💳 إعدادات الدفع أونلاين</strong>
    <p class="small muted" style="margin:6px 0 12px">اختار المزوّد وحط المفاتيح. مفيش أي مفتاح بيظهر للعميل — بيتخزن على السيرفر بس وبيتعرض مقنّع هنا.</p>
    <div class="grid3">
      <div><label class="lbl">المزوّد</label>
        <select name="provider" id="payProvider">
          <option value="demo" ${c.provider === 'demo' ? 'selected' : ''}>🧪 محاكاة (تجربة فورية — بدون حساب)</option>
          <option value="stripe" ${c.provider === 'stripe' ? 'selected' : ''}>Stripe (بطاقات دولية)</option>
          <option value="paymob" ${c.provider === 'paymob' ? 'selected' : ''}>Paymob (مصر: بطاقات + محافظ)</option>
        </select></div>
      <div><label class="lbl">العملة</label><input name="currency" value="${h(c.currency || 'EGP')}" maxlength="4"></div>
      <div style="display:flex;align-items:flex-end"><button class="btn btn-sm btn-ghost btn-block" type="button" data-act="pay-test">🔌 اختبار الاتصال</button></div>
    </div>

    <div id="payStripe" class="box" style="margin-top:12px;background:var(--surface-2)">
      <strong>إعدادات Stripe</strong>
      <div class="grid2" style="margin-top:10px">
        <div><label class="lbl">Secret Key (sk_…)</label><input name="stripe_secretKey" value="${h(c.stripe?.secretKey || '')}" placeholder="sk_test_…"></div>
        <div><label class="lbl">Webhook Secret (whsec_…)</label><input name="stripe_webhookSecret" value="${h(c.stripe?.webhookSecret || '')}" placeholder="whsec_…"></div>
        <div><label class="lbl">Publishable Key (اختياري)</label><input name="stripe_publicKey" value="${h(c.stripe?.publicKey || '')}" placeholder="pk_…"></div>
      </div>
      <div class="small muted" style="margin-top:8px">حط رابط الـWebhook ده في لوحة Stripe (Developers → Webhooks) على حدث <b>checkout.session.completed</b>:<br>
        <code class="code">${h(proto)}/api/webhooks/stripe</code>
        <button class="btn btn-sm btn-ghost" type="button" data-act="copy-url" data-url="${h(proto)}/api/webhooks/stripe">نسخ</button></div>
    </div>

    <div id="payPaymob" class="box" style="margin-top:12px;background:var(--surface-2)">
      <strong>إعدادات Paymob (Accept)</strong>
      <div class="grid2" style="margin-top:10px">
        <div><label class="lbl">API Key</label><input name="paymob_apiKey" value="${h(c.paymob?.apiKey || '')}" placeholder="من لوحة Paymob"></div>
        <div><label class="lbl">Integration ID</label><input name="paymob_integrationId" value="${h(c.paymob?.integrationId || '')}" placeholder="مثال: 123456"></div>
        <div><label class="lbl">Iframe ID</label><input name="paymob_iframeId" value="${h(c.paymob?.iframeId || '')}" placeholder="مثال: 98765"></div>
        <div><label class="lbl">HMAC Secret</label><input name="paymob_hmacSecret" value="${h(c.paymob?.hmacSecret || '')}"></div>
        <div><label class="lbl">Base URL</label><input name="paymob_baseUrl" value="${h(c.paymob?.baseUrl || 'https://accept.paymob.com')}"></div>
      </div>
      <div class="small muted" style="margin-top:8px">حط رابط الـCallback ده في لوحة Paymob (Transaction → Processed callback):<br>
        <code class="code">${h(proto)}/api/webhooks/paymob</code>
        <button class="btn btn-sm btn-ghost" type="button" data-act="copy-url" data-url="${h(proto)}/api/webhooks/paymob">نسخ</button></div>
    </div>

    <div style="margin-top:14px">
      <strong>طرق الدفع اللي تظهر للعميل</strong>
      ${methods.map((m, i) => `
        <div class="row-line" style="margin-top:8px">
          <input type="checkbox" name="m${i}_enabled" ${m.enabled !== false ? 'checked' : ''}>
          <input name="m${i}_label" value="${h(m.label)}" style="flex:2">
          <select name="m${i}_kind" style="width:auto">
            <option value="cod" ${(m.kind || 'cod') === 'cod' ? 'selected' : ''}>عند الاستلام</option>
            <option value="online" ${m.kind === 'online' ? 'selected' : ''}>أونلاين</option>
          </select>
          <input type="hidden" name="m${i}_id" value="${h(m.id)}">
          <input type="hidden" name="m${i}_note" value="${h(m.note || '')}">
        </div>`).join('')}
    </div>

    <div class="btn-row" style="margin-top:14px"><button class="btn btn-primary btn-sm" type="submit">حفظ إعدادات الدفع</button></div>
  </form>

  <div class="box" style="margin-top:12px">
    <strong>آخر العمليات (${list.length})</strong>
    ${!list.length ? `<p class="small muted">مفيش عمليات دفع لسه.</p>` : list.map((x) => `
      <div class="line">
        <span class="small">${h(x.orderId)} · ${h(x.provider)} · ${money(x.amount)}</span>
        <span class="small">${x.status === 'paid' ? '✅ مدفوع' : x.status === 'refunded' ? '↩️ مرتجع' : x.status === 'failed' ? '⚠️ فشل' : '⏳ معلّق'}
          <span class="muted"> · ${h(timeAgo(x.updatedAt || x.createdAt))}</span></span>
      </div>`).join('')}
  </div>`;
}

function adminWhatsappHTML() {
  const c = AD.waCfg || { provider: 'console', notifyOn: {}, staffNumbers: [] };
  const tpl = AD.waTemplates || {};
  const log = AD.waLog || [];
  const statuses = S.statuses || [];
  const providers = [
    ['console', '🖨️ Console (تجربة — الرسالة في الـconsole)'],
    ['link', '🔗 رابط wa.me (من غير API — بضغطة يد)'],
    ['meta', 'WhatsApp Cloud API (Meta)'],
    ['twilio', 'Twilio'],
    ['greenapi', 'Green API'],
    ['ultramsg', 'UltraMsg'],
    ['callmebot', 'CallMeBot'],
  ];
  const tplFields = [
    ['new', 'تأكيد استلام الطلب'], ['received', 'تم استلام الطلب'], ['preparing', 'جاري التجهيز'],
    ['on_way', 'خرج للتوصيل'], ['delivered', 'تم التوصيل'], ['cancelled', 'إلغاء الطلب'],
    ['paid', 'تأكيد الدفع'], ['payment_link', 'رابط الدفع'], ['staff_new', 'إشعار المطعم بطلب جديد'],
  ];
  return `
  <form id="waCfgForm">
    <div class="box">
      <div class="row" style="justify-content:space-between">
        <strong>💬 إشعارات واتساب</strong>
        <label class="row" style="gap:8px;cursor:pointer"><span class="small muted">مفعّلة</span>
          <input type="checkbox" name="enabled" ${c.enabled ? 'checked' : ''}></label>
      </div>
      <div class="grid3" style="margin-top:12px">
        <div><label class="lbl">المزوّد</label>
          <select name="provider" id="waProvider">${providers.map(([v, l]) => `<option value="${v}" ${c.provider === v ? 'selected' : ''}>${h(l)}</option>`).join('')}</select></div>
        <div><label class="lbl">كود الدولة الافتراضي</label><input name="defaultCountryCode" value="${h(c.defaultCountryCode || '20')}" maxlength="4"></div>
        <div style="display:flex;align-items:flex-end"><button class="btn btn-sm btn-ghost btn-block" type="button" data-act="wa-test">📤 ابعت رسالة تجربة</button></div>
      </div>
      <div id="waProviderWarn" class="small" style="margin-top:8px" role="note"></div>
      <label class="opt" style="margin-top:12px;align-items:flex-start">
        <span style="flex:1">
          <span>وضع الموافقة الصريحة: نبلّغ بس العميل اللي موافق بنفسه</span>
          <span class="small muted" style="display:block;margin-top:2px">لو مقفولة: كل العملاء بيستلموا التحديثات ما عدا اللي وقّف الإشعارات هو بنفسه (الأنسب عادة)</span>
        </span>
        <input type="checkbox" name="requireOptIn" ${c.requireOptIn !== false ? 'checked' : ''}></label>
      <label class="opt"><span>ابعتلي كمان للرقم ده عند وصول طلب جديد</span>
        <input type="checkbox" name="staffEnabled" ${c.staffEnabled ? 'checked' : ''}></label>
      <div style="margin-top:8px"><label class="lbl">أرقام المطعم (بفاصلة)</label>
        <input name="staffNumbers" value="${h((c.staffNumbers || []).join(', '))}" placeholder="201000000000, 201111111111"></div>

      <div style="margin-top:12px"><label class="lbl">على أي حالات نبعت للعميل</label>
        <div class="row" style="flex-wrap:wrap;gap:8px">
          ${statuses.map((st) => `<label class="chip" style="display:flex;gap:6px;align-items:center;cursor:pointer">
            <input type="checkbox" name="on_${h(st.id)}" ${(!c.notifyOn || c.notifyOn[st.id] !== false) ? 'checked' : ''}> ${st.emoji} ${h(st.label)}</label>`).join('')}
        </div>
      </div>
    </div>

    <div class="box" style="margin-top:12px">
      <strong>مفاتيح المزوّد</strong>
      <p class="small muted" style="margin:6px 0 10px">المفاتيح بتتخزن على السيرفر وبس، ومش بتظهر لأي عميل. اللي بيظهر هنا مقنّع (آخر ٤ حروف).</p>

      <div class="wa-grp" data-grp="meta" style="display:none">
        <div class="grid2">
          <div><label class="lbl">Access Token</label><input name="meta_token" value="${h(c.meta?.token || '')}"></div>
          <div><label class="lbl">Phone Number ID</label><input name="meta_phoneId" value="${h(c.meta?.phoneId || '')}"></div>
          <div><label class="lbl">Template Name (اختياري — للرسائل خارج نافذة 24 ساعة)</label><input name="meta_templateName" value="${h(c.meta?.templateName || '')}"></div>
          <div><label class="lbl">Template Language</label><input name="meta_templateLang" value="${h(c.meta?.templateLang || 'ar')}"></div>
        </div>
      </div>

      <div class="wa-grp" data-grp="twilio" style="display:none">
        <div class="grid3">
          <div><label class="lbl">Account SID</label><input name="twilio_accountSid" value="${h(c.twilio?.accountSid || '')}"></div>
          <div><label class="lbl">Auth Token</label><input name="twilio_authToken" value="${h(c.twilio?.authToken || '')}"></div>
          <div><label class="lbl">من رقم</label><input name="twilio_from" value="${h(c.twilio?.from || 'whatsapp:+14155238886')}"></div>
        </div>
      </div>

      <div class="wa-grp" data-grp="greenapi" style="display:none">
        <div class="grid3">
          <div><label class="lbl">Base URL</label><input name="greenapi_baseUrl" value="${h(c.greenapi?.baseUrl || 'https://7103.api.greenapi.com')}"></div>
          <div><label class="lbl">Instance ID</label><input name="greenapi_instanceId" value="${h(c.greenapi?.instanceId || '')}"></div>
          <div><label class="lbl">API Token</label><input name="greenapi_token" value="${h(c.greenapi?.token || '')}"></div>
        </div>
      </div>

      <div class="wa-grp" data-grp="ultramsg" style="display:none">
        <div class="grid2">
          <div><label class="lbl">Instance ID</label><input name="ultramsg_instanceId" value="${h(c.ultramsg?.instanceId || '')}"></div>
          <div><label class="lbl">Token</label><input name="ultramsg_token" value="${h(c.ultramsg?.token || '')}"></div>
        </div>
      </div>

      <div class="wa-grp" data-grp="callmebot" style="display:none">
        <div><label class="lbl">API Key</label><input name="callmebot_apiKey" value="${h(c.callmebot?.apiKey || '')}"></div>
      </div>

      <div class="wa-grp" data-grp="console" style="display:none">
        <p class="small muted">المزوّد ده للتجربة: الرسالة بتتطبع في نافذة السيرفر بدل ما تتبعت. مناسبة تتأكد إن كل حاجة ماشية قبل ما توصل لمزوّد حقيقي.</p>
      </div>
      <div class="wa-grp" data-grp="link" style="display:none">
        <p class="small muted">من غير أي API: التطبيق بيجهّزلك نص الرسالة وبيتفتح واتساب بضغطة على رقم العميل (من صفحة الطلب). وكل رسالة بتتسجل في السجل تحت.</p>
      </div>
    </div>

    <div class="box" style="margin-top:12px">
      <strong>نصوص الرسائل</strong>
      <p class="small muted" style="margin:6px 0 10px">المتغيرات المتاحة: <code class="code">{name}</code> <code class="code">{order}</code> <code class="code">{total}</code> <code class="code">{phone}</code> <code class="code">{eta}</code> <code class="code">{address}</code> <code class="code">{link}</code> <code class="code">{paylink}</code></p>
      ${tplFields.map(([k, label]) => `
        <div style="margin-bottom:8px"><label class="lbl">${h(label)}</label>
        <textarea name="tpl_${k}" rows="2">${h(tpl[k] || '')}</textarea></div>`).join('')}
    </div>

    <div class="btn-row" style="margin-top:12px"><button class="btn btn-primary btn-sm" type="submit">حفظ إعدادات الواتساب</button></div>
  </form>

  <div class="box" style="margin-top:12px">
    <strong>سجل الرسائل (${log.length})</strong>
    ${!log.length ? `<p class="small muted">مفيش رسائل لسه.</p>` : log.map((x) => `
      <div class="line" style="align-items:flex-start">
        <span class="small" style="flex:1">
          <b>${h(x.orderId || '—')}</b> · ${h(x.type)} → ${h(x.to)}
          <div class="muted" style="white-space:pre-wrap;max-height:64px;overflow:hidden">${h(String(x.message).slice(0, 140))}</div>
          <div class="muted">${h(timeAgo(x.at))} · ${x.result === 'sent' ? '✅ اتبعتت' : x.result === 'console' ? '🖨️ console' : x.result === 'link' ? '🔗 رابط جاهز' : x.result === 'skipped' ? '⏭️ اتجاهلت' : '⚠️ فشلت'}${x.error ? ' — ' + h(x.error) : ''}</div>
        </span>
        <span class="row" style="gap:6px">
          ${x.link ? `<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="${h(x.link)}">💬 افتح</a>` : ''}
          <button class="btn btn-sm btn-ghost" data-act="wa-resend" data-phone="${h(x.to)}" data-text="${h(x.message)}">🔁 أعد</button>
        </span>
      </div>`).join('')}
  </div>`;
}

function adminSettingsHTML() {
  return `
  <form id="settingsForm" class="box">
    <strong>إعدادات المطعم</strong>
    <div class="grid2" style="margin-top:10px">
      <div><label class="lbl">اسم المطعم</label><input name="name" value="${h(S.name || '')}"></div>
      <div><label class="lbl">الوصف المختصر</label><input name="tagline" value="${h(S.tagline || '')}"></div>
      <div><label class="lbl">التليفون</label><input name="phone" value="${h(S.phone || '')}"></div>
      <div><label class="lbl">واتساب (بكود الدولة)</label><input name="whatsapp" value="${h(S.whatsapp || '')}"></div>
      <div><label class="lbl">العنوان</label><input name="address" value="${h(S.address || '')}"></div>
      <div><label class="lbl">مواعيد العمل (نص)</label><input name="hoursText" value="${h(S.hoursText || '')}"></div>
      <div><label class="lbl">يفتح الساعة</label><input name="openHour" type="number" min="0" max="23" value="${h(S.openHour ?? 12)}"></div>
      <div><label class="lbl">يقفل الساعة (26 = ٢ بعد منتصف الليل)</label><input name="closeHour" type="number" min="1" max="30" value="${h(S.closeHour ?? 26)}"></div>
      <div><label class="lbl">رسوم التوصيل</label><input name="deliveryFee" type="number" min="0" value="${h(S.deliveryFee ?? 20)}"></div>
      <div><label class="lbl">توصيل مجاني فوق (0 = مقفول)</label><input name="freeDeliveryOver" type="number" min="0" value="${h(S.freeDeliveryOver ?? 0)}"></div>
      <div><label class="lbl">أقل مبلغ للطلب</label><input name="minOrder" type="number" min="0" value="${h(S.minOrder ?? 0)}"></div>
      <div><label class="lbl">مدة التوصيل (نص)</label><input name="deliveryEta" value="${h(S.deliveryEta || '')}"></div>
    </div>
    <label class="opt" style="margin-top:12px"><span><input type="checkbox" name="aiAutoImages" ${S.aiAutoImages ? 'checked' : ''}> توليد صور تلقائيًا لأي صنف جديد بدون صورة</span><span></span></label>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn btn-primary btn-sm" type="submit">حفظ الإعدادات</button>
      <button class="btn btn-ghost btn-sm" type="button" data-act="backup">⬇️ نسخة احتياطية (JSON)</button>
    </div>
  </form>
  <div class="box" style="margin-top:12px">
    <strong>التسجيل واستقبال الطلبات</strong>
    <p class="small muted" style="margin:6px 0 0">الحسابات والطلبات محفوظة على ${S.storage === 'postgres' ? 'قاعدة Supabase PostgreSQL الدائمة' : S.storage === 'redis' ? 'قاعدة Upstash Redis المشتركة (بديل قديم)' : 'قرص السيرفر (يلزم قرص دائم على الاستضافة)'}. أي عميل جديد يسجل كعميل فقط. الطلب يظهر هنا بإشعار بعد حفظه، وكلمة السر لا تُعرض لأي مستخدم.</p>
    <p class="small muted" style="margin:6px 0 0">${S.realtime === false ? 'تحديث تلقائي كل ٥ ثوانٍ أثناء فتح التطبيق.' : 'إشعارات لحظية مع تحديث دوري احتياطي.'} الدفع الحقيقي متاح عند التوصيل، أو بعد إعداد Stripe / Paymob.</p>
  </div>`;
}


/* --- تبويب 🛠️ النظام: جاهزية النشر (Upstash + APP_URL + ADMIN_PASSWORD) --- */
function adminSystemHTML() {
  const r = AD.system;
  if (!r) return `<div class="empty"><div class="big">⏳</div><h3>بيحمّل تقرير النظام…</h3></div>`;

  const ICON = { ok: '✅', missing: '❌', invalid: '⚠️', optional: '⚪' };
  const persistent = r.storage === 'postgres' || r.storage === 'redis' || !r.serverless;
  const ping = r.database || r.redis || {};
  const dbLabel = r.storage === 'postgres' ? 'Supabase' : 'Upstash';
  const note = (t, cls) => `<div class="box" style="margin-top:10px;border-color:${cls === 'danger' ? 'var(--red)' : 'var(--gold)'};border-width:1.5px">
      <div class="row" style="align-items:flex-start;gap:8px"><span style="font-size:18px">${cls === 'danger' ? '🚨' : '⚠️'}</span><span class="small" style="flex:1">${h(t)}</span></div></div>`;

  return `
  <div class="kpis">
    <div class="kpi ${persistent ? 'hl' : ''}"><b>${persistent ? '✔' : '✖'}</b><span>تخزين ${r.storage === 'postgres' ? 'Supabase (دائم)' : r.storage === 'redis' ? 'Upstash (دائم)' : 'مؤقت'}</span></div>
    <div class="kpi"><b>${r.serverless ? 'سيرفرلس' : 'سيرفر'}</b><span>طريقة التشغيل${r.serverless ? ' (Vercel)' : ''}</span></div>
    <div class="kpi ${ping.ok ? 'hl' : ''}"><b>${ping.ok ? ping.ms + 'ms' : ping.skipped ? '—' : '✖'}</b><span>زمن الرد من ${dbLabel}</span></div>
    <div class="kpi ${r.credentials.ownerFromEnv && r.credentials.ownerConfigured ? 'hl' : ''}"><b>${r.credentials.ownerFromEnv && r.credentials.ownerConfigured ? '✔' : '⚠'}</b><span>حساب صاحب المطعم من البيئة</span></div>
  </div>

  ${(r.warnings || []).map((w) => note(w.message, w.level)).join('')}

  <div class="box" style="margin-top:12px">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
      <strong>متغيرات البيئة</strong>
      <button class="btn btn-sm btn-ghost" data-act="system-refresh">🔄 تحديث</button>
    </div>
    <p class="small muted" style="margin:6px 0 10px">
      دي بتتظبط في لوحة الاستضافة (Vercel → Settings → Environment Variables) — مش من هنا، وبعدها لازم <b>Redeploy</b> علشان تتطبّق.
      القيم السرية مش بتظهر، بس بنأكدلك إنها متسجّلة.
    </p>
    <div class="list">
      ${(r.vars || []).map((v) => `
        <div class="row-line" style="flex-wrap:wrap">
          <div class="grow">
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <span>${ICON[v.status] || '⚪'}</span>
              <strong style="font-family:var(--font-mono,monospace);font-size:13px">${h(v.key)}</strong>
              ${v.level === 'required' && v.active ? '<span class="chip" style="padding:2px 7px;font-size:11px">إجباري</span>' : '<span class="chip" style="padding:2px 7px;font-size:11px">اختياري</span>'}
            </div>
            <div class="small muted" style="margin-top:3px">${h(v.label)}</div>
            ${v.status === 'missing' ? `<div class="small" style="margin-top:4px;color:var(--gold)">↳ ${h(v.hint)}</div>` : ''}
            ${v.status === 'invalid' ? `<div class="small" style="margin-top:4px;color:var(--red)">↳ ${h(v.error)}</div>` : ''}
          </div>
          <span class="small" style="font-family:var(--font-mono,monospace);direction:ltr">${v.status === 'missing' ? '—' : h(v.value)}</span>
        </div>`).join('')}
    </div>
  </div>

  <div class="box" style="margin-top:12px">
    <strong>بيانات الدخول</strong>
    <div class="line" style="border-top:1px solid var(--border);margin-top:8px">
      <span>حساب صاحب المطعم</span><span class="small">${h(r.credentials.ownerEmail)}</span>
    </div>
    <div class="line" style="border-top:1px solid var(--border)">
      <span>كلمة السر</span><span class="small">${r.credentials.ownerFromEnv ? 'من ADMIN_PASSWORD (البيئة)' : '⚠ مش متظبطة في البيئة'}</span>
    </div>
    <div class="line" style="border-top:1px solid var(--border)">
      <span>الحساب متجهّز؟</span><span class="small">${r.credentials.ownerConfigured ? '✔ نعم' : '✖ لسه'}</span>
    </div>
    <p class="small muted" style="margin:8px 0 0">${h(r.credentials.note)}</p>
  </div>

  <div class="box" style="margin-top:12px">
    <strong>إزاي تظبطهم على الاستضافة؟</strong>
    <ol class="small" style="margin:8px 0 0;padding-inline-start:20px;line-height:1.9">
      <li>supabase.com → New Project → من <b>SQL Editor</b> شغّل <code>supabase/migrations/0001_init.sql</code>.</li>
      <li>Settings → API → انسخ <b>SUPABASE_URL</b> و <b>SUPABASE_SERVICE_ROLE_KEY</b> (السرّي — للسيرفر بس).</li>
      <li>Vercel → المشروع → <b>Settings → Environment Variables</b> → ضيف: المتغيرين دول + <b>APP_URL</b> + <b>ADMIN_PASSWORD</b> (+ <code>ADMIN_EMAIL</code> لو عايز إيميل تاني).</li>
      <li><b>Deployments → ⋯ → Redeploy</b> — من غير redeploy المتغيرات مش بتتطبّق.</li>
      <li>رجّع هنا واضغط «تحديث» — لازم تشوف ✔ جنب كل متغير إجباري.</li>
    </ol>
    <p class="small muted" style="margin:8px 0 0">الشرح الكامل خطوة بخطوة: <code>docs/SUPABASE.md</code> في الريبو (وياريت تراجع <code>docs/VERCEL-UPSTASH.md</code> لو لسه بتستخدم Upstash كـ Legacy).</p>
  </div>`;
}

/* ============================== ١٤) نافذة تفاصيل الطلب (للإدارة) ============================== */
let drawerReturnFocus = null;
function openOrderDrawer(id) {
  const o = AD.orders.find((x) => x.id === id) || MY.orders.find((x) => x.id === id);
  if (!o) return;
  drawerReturnFocus = document.activeElement;
  let bd = $('#drawer');
  if (!bd) { bd = document.createElement('div'); bd.id = 'drawer'; bd.className = 'drawer-backdrop'; document.body.appendChild(bd); }
  const flow = FLOW();
  bd.innerHTML = `
  <div class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
    <div class="dhead">
      <strong id="drawerTitle" style="flex:1">طلب ${h(o.id)}</strong>
      <button class="icon-btn" data-act="drawer-close" aria-label="إغلاق تفاصيل الطلب">✕</button>
    </div>
    <div class="dbody">
      <div class="row" style="justify-content:space-between">${statusChip(o.status)}<span class="small muted">${h(fmtDT(o.createdAt))}</span></div>
      <div class="box" style="margin-top:12px">
        <strong>بيانات العميل</strong>
        <div class="line"><span class="muted">الاسم</span><span>${h(o.customer.name)}</span></div>
        <div class="line"><span class="muted">الهاتف</span><span><a href="tel:${h(o.customer.phone)}" style="color:var(--link)">${h(o.customer.phone)}</a>
          <a class="btn btn-sm btn-ghost" style="margin-inline-start:6px" target="_blank" rel="noopener" href="https://wa.me/${h(String(o.customer.phone || '').replace(/\D/g, '').replace(/^0/, '20'))}">💬</a></span></div>
        <div class="line"><span class="muted">الإيميل</span><span class="small">${h(o.customer.email || '—')}</span></div>
        <div class="line"><span class="muted">العنوان</span><span class="small">${h(o.customer.area ? o.customer.area + ' — ' : '')}${h(o.customer.address)}</span></div>
        <div class="line"><span class="muted">وقت التوصيل</span><span>${h(o.customer.time || '—')}</span></div>
        <div class="line"><span class="muted">الملاحظات</span><span class="small">${h(o.customer.notes || '—')}</span></div>
        <div class="line"><span class="muted">طريقة الدفع</span><span>${h(((S.payments || []).find((p) => p.id === o.payment) || {}).label || o.payment)}</span></div>
      </div>
      <div class="box" style="margin-top:12px">
        <strong>المنتجات (Order Items)</strong>
        ${o.items.map((i) => `<div class="line"><span>${h(i.name)} ×${i.qty}
          ${i.addons && i.addons.length ? `<div class="small muted">${h(i.addons.map((a) => a.name).join('، '))}</div>` : ''}
          ${i.note ? `<div class="small muted">📝 ${h(i.note)}</div>` : ''}</span>
          <span>${money(i.line_total || i.price * i.qty)}</span></div>`).join('')}
        <div class="line"><span>المجموع</span><span>${money(o.subtotal)}</span></div>
        <div class="line"><span>التوصيل</span><span>${o.delivery ? money(o.delivery) : 'مجاني'}</span></div>
        ${o.discount ? `<div class="line" style="color:var(--green)"><span>خصم</span><span>− ${money(o.discount)}</span></div>` : ''}
        <div class="line total"><span>الإجمالي</span><span class="price">${money(o.total)}</span></div>
      </div>
      <div class="box" style="margin-top:12px">
        <div class="row" style="justify-content:space-between"><strong>💳 الدفع</strong>${payChip(o)}</div>
        <div class="line"><span class="muted">الطريقة</span><span>${h(((S.payments || []).find((p) => p.id === o.payment) || {}).label || o.payment)}</span></div>
        ${o.paymentProvider ? `<div class="line"><span class="muted">المزوّد</span><span class="small">${h(o.paymentProvider)}${o.paymentRef ? ` · ${h(String(o.paymentRef).slice(0, 18))}` : ''}</span></div>` : ''}
        ${o.paidAt ? `<div class="line"><span class="muted">اتدفع في</span><span class="small">${h(fmtDT(o.paidAt))}</span></div>` : ''}
        <div class="btn-row" style="margin-top:10px">
          ${o.payment_status !== 'paid' ? `<button class="btn btn-sm btn-ok" data-act="pay-mark" data-id="${h(o.id)}" data-v="paid">✅ علّم كمدفوع</button>` : ''}
          ${o.payment_status === 'paid' ? `<button class="btn btn-sm btn-ghost" data-act="pay-mark" data-id="${h(o.id)}" data-v="refunded">↩️ تسجيل مرتجع</button>` : ''}
          ${['paid', 'refunded'].includes(o.payment_status) ? `<button class="btn btn-sm btn-ghost" data-act="pay-mark" data-id="${h(o.id)}" data-v="unpaid">رجّعه "غير مدفوع"</button>` : ''}
          ${(isOnline(o) || (S.onlinePayment && S.onlinePayment.enabled)) ? `<button class="btn btn-sm btn-ghost" data-act="wa-paylink" data-id="${h(o.id)}">💳 ابعت رابط الدفع</button>` : ''}
        </div>
      </div>

      <div class="box" style="margin-top:12px">
        <strong>💬 واتساب العميل</strong>
        <div class="small muted" style="margin-top:4px">${h(o.customer.phone)}${o.customer.notifyWhatsapp === false ? ' · العميل موقف التحديثات' : ''}</div>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn btn-sm btn-ghost" data-act="wa-send" data-id="${h(o.id)}">ابعت تحديث الحالة الحالية</button>
          <a class="btn btn-sm btn-ghost" target="_blank" rel="noopener"
             href="https://wa.me/${h(String(o.customer.phone || '').replace(/\D/g, '').replace(/^0/, '20'))}">💬 افتح المحادثة</a>
        </div>
      </div>

      <div class="box" style="margin-top:12px">
        <strong>تغيير الحالة</strong>
        <div class="btn-row" style="margin-top:10px">
          ${(S.statuses || []).map((s) => `<button class="btn btn-sm ${o.status === s.id ? 'btn-primary' : 'btn-ghost'}" data-act="set-status" data-id="${h(o.id)}" data-v="${h(s.id)}">${s.emoji} ${h(s.label)}</button>`).join('')}
        </div>
      </div>
      <div class="box" style="margin-top:12px">
        <strong>سجل الحالة</strong>
        ${(o.history || []).slice().reverse().map((x) => `<div class="line"><span class="small">${h((S.statuses.find((s) => s.id === x.status) || {}).label || x.status)}</span><span class="small muted">${h(fmtDT(x.at))}</span></div>`).join('')}
      </div>
    </div>
  </div>`;
  bd.classList.add('show'); bd.inert = false; bd.setAttribute('aria-hidden', 'false');
  $('[data-act="drawer-close"]', bd)?.focus();
  bd.onclick = (e) => { if (e.target === bd || e.target.closest('[data-act="drawer-close"]')) closeDrawer(); };
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  const bd = $('#drawer');
  const wasOpen = bd?.classList.contains('show');
  if (bd) { bd.classList.remove('show'); bd.inert = true; bd.setAttribute('aria-hidden', 'true'); }
  document.body.style.overflow = '';
  if (wasOpen && drawerReturnFocus?.isConnected) drawerReturnFocus.focus({ preventScroll: true });
}

/* ============================== ١٥) الإشعارات ============================== */
function renderNotifPanel() {
  let panel = $('#notifPanel');
  if (!panel) { panel = document.createElement('div'); panel.id = 'notifPanel'; panel.className = 'notif-panel hidden'; document.body.appendChild(panel); }
  const unread = NOTIFS.filter((n) => !n.read).length;
  panel.innerHTML = `
    <div class="head"><strong style="flex:1">الإشعارات${unread ? ` (${unread})` : ''}</strong>
      <button class="btn btn-sm btn-ghost" data-act="notif-read-all">تعليم الكل كمقروء</button>
      <button class="icon-btn" data-act="notif-close">✕</button></div>
    ${!NOTIFS.length ? `<div class="empty" style="padding:24px"><div class="big">🔔</div><p>مفيش إشعارات لسه</p></div>`
      : NOTIFS.map((n) => `
        <button class="notif ${n.read ? '' : 'unread'}" data-act="notif-open" data-id="${h(n.id)}" data-order="${h(n.orderId || '')}">
          <div class="t">${h(n.title)}</div>
          <div class="b">${h(n.body)}</div>
          <div class="at">${h(timeAgo(n.createdAt))}</div>
        </button>`).join('')}
    <div style="padding:10px 14px" class="small muted">الإشعارات بتوصل للمشرفين والأدمن بس عند أي طلب جديد.</div>`;
}
async function loadNotifs({ announce = false } = {}) {
  if (!isStaff()) return;
  const userId = ME.id;
  try {
    const d = await api.req('/api/notifications');
    if (!ME || ME.id !== userId) return;
    const known = new Set(NOTIFS.map((n) => n.id));
    const fresh = d.notifications.filter((n) => !known.has(n.id) && !n.read && !n.silent);
    NOTIFS = d.notifications;
    if (announce && fresh.length) toast(`🔔 ${fresh[0].title} — ${fresh[0].body}`, 5000);
    const btn = $('#notifBtn');
    if (btn) { const unread = NOTIFS.filter((n) => !n.read).length; btn.innerHTML = `${icon('bell')}${unread ? `<span class="badge-n red">${formatAmount(unread)}</span>` : ''}`; }
    if ($('#notifPanel') && !$('#notifPanel').classList.contains('hidden')) renderNotifPanel();
  } catch { /* ignore */ }
}
function toggleNotifPanel() {
  let panel = $('#notifPanel');
  if (!panel) renderNotifPanel();
  panel = $('#notifPanel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) loadNotifs();
}

/* ============================== ١٦) تحديث الطلبات والإشعارات ============================== */
let es = null;
let pollTimer = null;
let pollInterval = 0;
let refreshingLive = false;
let sseFailures = 0;

async function refreshLiveState() {
  if (!ME || refreshingLive) return;
  refreshingLive = true;
  const userId = ME.id;
  try {
    const r = parseHash();
    if (isStaff()) await loadNotifs({ announce: true });
    if (['my-orders', 'order'].includes(r.name)) {
      const before = JSON.stringify(MY.orders);
      const oldError = MY.error;
      await loadMyOrders(true);
      if (ME?.id === userId && (before !== JSON.stringify(MY.orders) || oldError !== MY.error)) softRender();
    }
    if (r.name === 'admin' && isStaff()) {
      await Promise.all([loadAdminStats(), loadAdminOrders()]);
      if (AD.tab === 'customers') AD.customers = (await api.req('/api/admin/customers')).customers;
      if (AD.tab === 'users' && isAdmin()) AD.users = (await api.req('/api/admin/users')).users;
      /* Never discard an unsaved settings/payment/menu form or an active search. */
      const typing = document.activeElement?.closest?.('#adminBody input, #adminBody textarea, #adminBody select');
      if (ME?.id === userId && ['dash', 'orders', 'customers', 'users'].includes(AD.tab) && !typing) softRefreshAdmin();
    }
  } catch { /* Leave the last known data visible and retry; never invent a successful update. */ }
  finally { refreshingLive = false; }
}

function connectSSE() {
  if (es) { es.close(); es = null; }
  if (!ME || !api.token || S.realtime === false) return;
  try {
    es = new EventSource(`/api/events?token=${encodeURIComponent(api.token)}`);
    es.onmessage = async (ev) => {
      let d; try { d = JSON.parse(ev.data); } catch { return; }
      if (!ME || d.kind === 'hello') return;
      if (d.kind === 'notification' && isStaff()) {
        const fresh = (d.items || []).filter((n) => n.userId === ME.id && !NOTIFS.some((known) => known.id === n.id));
        NOTIFS = [...fresh, ...NOTIFS];
        const loud = fresh.find((n) => !n.silent);
        if (loud) toast(`🔔 ${loud.title} — ${loud.body}`, 5000);
      }
      if (d.kind === 'order:mine') MY.loaded = false;
      await refreshLiveState();
    };
    es.onerror = () => {
      sseFailures += 1;
      if (sseFailures >= 3) { es?.close(); es = null; startPolling(5000); }
    };
    es.onopen = () => { sseFailures = 0; refreshLiveState(); };
  } catch { startPolling(5000); }
}

/* Poll shared storage on Vercel; also catch SSE disconnects/multi-worker updates. */
function startPolling(ms = 5000) {
  if (pollTimer && pollInterval === ms) return;
  if (pollTimer) clearInterval(pollTimer);
  pollInterval = ms;
  pollTimer = setInterval(refreshLiveState, ms);
}
function startRealtime() {
  startPolling(S.realtime === false ? 5000 : 15000);
  connectSSE();
}
window.addEventListener('online', refreshLiveState);
window.addEventListener('focus', refreshLiveState);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLiveState(); });

/* ============================== ١٧) الرسم والأحداث ============================== */
function softRender() { render({ soft: true }); }
function softRefreshAdmin() {
  const b = $('#adminBody');
  const route = parseHash();
  if (b && route.name === 'admin') {
    b.innerHTML = adminBodyFor(AD.tab);
    // Replaced forms need fresh listeners; delegated buttons alone do not handle submission.
    bindPage(route);
  }
}
function adminBodyFor(tab) {
  if (tab === 'dash') return adminDashHTML();
  if (tab === 'orders') return adminOrdersHTML();
  if (tab === 'customers') return adminCustomersHTML();
  if (tab === 'menu') return isAdmin() ? adminMenuHTML() : deniedHTML();
  if (tab === 'users') return isAdmin() ? adminUsersHTML() : deniedHTML();
  if (tab === 'payments') return isAdmin() ? adminPaymentsHTML() : deniedHTML();
  if (tab === 'whatsapp') return isAdmin() ? adminWhatsappHTML() : deniedHTML();
  if (tab === 'settings') return isAdmin() ? adminSettingsHTML() : deniedHTML();
  if (tab === 'system') return isAdmin() ? adminSystemHTML() : deniedHTML();
  return '';
}

async function render(opts = {}) {
  const r = parseHash();
  const view = $('#view');

  /* تحميل البيانات المطلوبة للصفحة */
  if (r.name === 'my-orders' || r.name === 'order' || r.name === 'account') await loadMyOrders();

  /* رجعنا من صفحة الدفع؟ نتأكد من المزوّد نفسه (مش بنعتمد على الرابط لوحده) */
  if (r.name === 'order' && r.q.get('pay') && ME) {
    try {
      const d = await api.req('/api/orders/' + encodeURIComponent(r.param) + '/verify', { method: 'POST' });
      if (r.q.get('pay') === 'success') toast(d.status === 'paid' ? 'تم تأكيد الدفع ✅' : 'الدفع لسه بيتأكد… (' + d.status + ')', 4500);
      else toast('تم إلغاء الدفع — الطلب محفوظ وتقدر تدفع في أي وقت', 4500);
      await loadMyOrders(true);
      history.replaceState(null, '', '#/order/' + r.param);
    } catch { /* مش مشكلة — الحالة هتتحدّث من الـwebhook */ }
  }
  if (r.name === 'admin' && isStaff()) {
    if (!AD.stats) await loadAdminStats();
    if (r.q.get('tab') && r.q.get('tab') !== AD.tab) AD.tab = r.q.get('tab');
    if (['dash', 'orders'].includes(AD.tab) && (!AD.orders.length || opts.force)) await loadAdminOrders();
    if (AD.tab === 'customers' && !AD.customers.length) AD.customers = (await api.req('/api/admin/customers')).customers;
    if (AD.tab === 'users' && isAdmin() && !AD.users.length) AD.users = (await api.req('/api/admin/users')).users;
    if (AD.tab === 'payments' && isAdmin() && !AD.payCfg) { const d = await api.req('/api/admin/payments'); AD.payCfg = d.config; AD.methods = d.methods || []; AD.paidList = d.paid || []; }
    if (AD.tab === 'whatsapp' && isAdmin() && !AD.waCfg) { const d = await api.req('/api/admin/whatsapp'); AD.waCfg = d.config; AD.waTemplates = d.templates; AD.waLog = d.log || []; }
    if (AD.tab === 'system' && isAdmin() && !AD.system) AD.system = await api.req('/api/admin/system');
  }

  let html = '';
  if (r.name === 'home') html = viewsHome();
  else if (r.name === 'menu' || r.name === 'orders') html = viewsMenu(r.q);
  else if (r.name === 'cart') html = viewsCart();
  else if (r.name === 'checkout') html = viewsCheckout();
  else if (r.name === 'my-orders') html = viewsOrders();
  else if (r.name === 'order') html = viewOrderPage(r.param);
  else if (r.name === 'account') html = viewsAccount();
  else if (r.name === 'login') html = authPageHTML('login', r.q);
  else if (r.name === 'signup') html = authPageHTML('signup', r.q);
  else if (r.name === 'forgot') html = `
    ${headerHTML('account')}<main class="app"><div class="wrap" style="max-width:460px">
      <div class="page-head"><h1>نسيت كلمة السر؟</h1><p>هنبعتلك رابط لإعادة التعيين</p></div>
      <form id="forgotForm" class="box" style="margin-top:14px">
        <label class="lbl">الإيميل</label><input name="email" type="email" required placeholder="you@example.com">
        <button class="btn btn-primary btn-block" style="margin-top:12px" type="submit">ابعت الرابط</button>
        <div class="center small muted" style="margin-top:10px"><a href="#/login" style="color:var(--link)">رجوع لتسجيل الدخول</a></div>
      </form></div>${footerHTML()}</main>`;
  else if (r.name === 'reset') html = authPageHTML('reset', r.q);
  else if (r.name === 'setup') html = setupPageHTML();
  else if (r.name === 'admin') html = viewsAdmin(r.q);
  else html = `<main class="app"><div class="wrap"><div class="empty" style="padding-top:60px">
    <div class="big">🧭</div><h3>الصفحة غير موجودة</h3><a class="btn btn-primary" style="margin-top:14px" href="#/">الرئيسية</a></div></div></main>`;

  view.innerHTML = html + navHTML(r.name === 'order' ? 'my-orders' : r.name === 'menu' ? 'orders' : r.name);
  if (!opts.soft || opts.scroll) window.scrollTo({ top: 0 });
  renderCartBar(); updateBadges(); bindPage(r); updateThemeControls();
}

/* ============================== ١٨) ربط عناصر الصفحة ============================== */
function bindPage(r) {
  // Associate the existing form labels without changing their names or submission contracts.
  $$('label.lbl').forEach((label, index) => {
    const input = label.nextElementSibling;
    if (input?.matches('input, select, textarea') && !label.htmlFor) {
      if (!input.id) input.id = `field-${index}`;
      label.htmlFor = input.id;
    }
  });

  /* الرئيسية: البحث الشريط + تشغيل الـcarousel */
  if (r.name === 'home') {
    const hsf = $('#homeSearchForm');
    if (hsf) hsf.addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = hsf.querySelector('input[name="q"]');
      const q = String(inp?.value || '').trim();
      go('orders' + (q ? '?q=' + encodeURIComponent(q) : ''));
    });
    bindHero();
  }
  const si = $('#searchInput');
  if (si) {
    let t;
    si.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { const q = new URLSearchParams(location.hash.split('?')[1] || ''); q.set('q', si.value); go('orders?' + q); }, 350);
    });
  }
  const ss = $('#sortSel');
  if (ss) ss.addEventListener('change', () => { const q = new URLSearchParams(location.hash.split('?')[1] || ''); q.set('sort', ss.value); go('orders?' + q); });

  $$('input[data-note]').forEach((inp) => inp.addEventListener('change', () => {
    const c = cart.find((x) => x.key === inp.getAttribute('data-note'));
    if (c) { c.note = inp.value; saveCart(); }
  }));

  const cf = $('#checkoutForm');
  if (cf) {
    $$('.opt[data-pay]', cf).forEach((l) => l.addEventListener('click', () => {
      $$('.opt[data-pay]', cf).forEach((x) => x.classList.remove('on')); l.classList.add('on');
    }));
    cf.addEventListener('submit', submitOrder);
  }

  const pf = $('#profileForm');
  if (pf) pf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(pf);
    const body = { name: fd.get('name'), phone: fd.get('phone'), area: fd.get('area'), address: fd.get('address') };
    /* بنسجّل تفضيل الواتساب بس لو المربع ظاهر (الميزة مفعّلة) —
       وإلّا أي حفظ بيانات هيُسجّل العميل كـ«موقوف» من غير وعيه. */
    if (pf.querySelector('input[name="notifyWhatsapp"]')) body.notifyWhatsapp = fd.get('notifyWhatsapp') != null;
    try {
      const d = await api.req('/api/me', { method: 'PATCH', body });
      ME = d.user; toast('تم حفظ البيانات ✅');
    } catch (err) { toast(err.message); }
  });

  const lf = $('#loginForm');
  if (lf) lf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(lf);
    await submitAccountForm(lf, async () => {
      const d = await api.req('/api/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      acceptLogin(d);
      toast(`أهلًا ${ME.name || ME.email} 👋`);
      await loadNotifs(); startRealtime();
      go(fd.get('return') || (isStaff() ? 'admin' : 'account'));
    });
  });

  const sf = $('#signupForm');
  if (sf) sf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(sf);
    await submitAccountForm(sf, async () => {
      const d = await api.req('/api/auth/signup', { method: 'POST', body: { name: fd.get('name'), email: fd.get('email'), password: fd.get('password'), phone: fd.get('phone') } });
      acceptLogin(d); toast('تم إنشاء حسابك وحفظه عند المطعم 🎉');
      startRealtime(); go(fd.get('return') || 'account');
    });
  });

  const pwf = $('#passwordForm');
  if (pwf) pwf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(pwf);
    await submitAccountForm(pwf, async () => {
      if (fd.get('password') !== fd.get('confirmPassword')) throw new Error('تأكيد كلمة السر مش مطابق');
      const d = await api.req('/api/auth/password', { method: 'POST', body: { currentPassword: fd.get('currentPassword'), password: fd.get('password') } });
      api.setToken(d.token); ME = d.user; pwf.reset();
      startRealtime(); toast('تم تغيير كلمة السر وإغلاق الجلسات القديمة ✅');
    });
  });

  const ff = $('#forgotForm');
  if (ff) ff.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(ff);
    try {
      const d = await api.req('/api/auth/forgot', { method: 'POST', body: { email: fd.get('email') } });
      toast(d.message, 5000);
      go('login');
    } catch (err) { toast(err.message); }
  });

  const rf = $('#resetForm');
  if (rf) rf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(rf);
    try {
      const d = await api.req('/api/auth/reset', { method: 'POST', body: { token: fd.get('token'), password: fd.get('password') } });
      toast(d.message, 4000); go('login');
    } catch (err) { toast(err.message, 3500); }
  });

  /* ---- الإدارة ---- */
  const as = $('#adminSearch');
  if (as) {
    let t;
    as.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => { AD.q = as.value; await loadAdminOrders(); softRefreshAdmin(); }, 350);
    });
  }
  const cs = $('#custSearch');
  if (cs) cs.addEventListener('input', () => { AD.q = cs.value; softRefreshAdmin(); });
  const us = $('#userSearch');
  if (us) us.addEventListener('input', () => { AD.q = us.value; softRefreshAdmin(); });

  const mf = $('#menuForm');
  if (mf) {
    mf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(mf);
      const body = {
        name: fd.get('name'), cat: fd.get('cat'), desc: fd.get('desc'),
        price: fd.get('price') === '' ? null : Number(fd.get('price')),
        oldPrice: fd.get('oldPrice') === '' ? null : Number(fd.get('oldPrice')),
        priceLabel: fd.get('priceLabel'),
        featured: fd.get('featured') != null, spicy: fd.get('spicy') != null, available: fd.get('available') != null,
        active: fd.get('active') != null, noPrice: fd.get('noPrice') != null,
      };
      try {
        const id = fd.get('id');
        if (id) await api.req('/api/admin/menu/' + encodeURIComponent(id), { method: 'PATCH', body });
        else await api.req('/api/admin/menu', { method: 'POST', body });
        toast('تم الحفظ ✅');
        AD.editing = null;
        MENU = (await api.req('/api/bootstrap')).menu;
        softRefreshAdmin();
      } catch (err) { toast(err.message, 3500); }
    });
    const up = $('#imgUpload');
    if (up) up.addEventListener('change', async () => {
      const f = up.files && up.files[0];
      if (!f) return;
      const id = AD.editing && AD.editing.id;
      if (!id) { toast('احفظ الصنف الأول وبعدين ارفعله صورة'); return; }
      const fd = new FormData(); fd.append('image', f);
      try {
        const d = await api.req('/api/admin/menu/' + encodeURIComponent(id) + '/image', { method: 'POST', raw: fd });
        AD.editing.image = d.item.image;
        MENU = (await api.req('/api/bootstrap')).menu;
        toast('تم رفع الصورة ✅'); softRefreshAdmin();
      } catch (err) { toast(err.message, 3500); }
    });
  }

  const pcf = $('#payCfgForm');
  if (pcf) {
    const show = () => {
      const v = $('#payProvider').value;
      $$('.wa-grp, #payStripe, #payPaymob').forEach(() => {});
      const st = $('#payStripe'), pm = $('#payPaymob');
      if (st) st.style.display = v === 'stripe' ? '' : 'none';
      if (pm) pm.style.display = v === 'paymob' ? '' : 'none';
    };
    $('#payProvider')?.addEventListener('change', show);
    show();
    pcf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(pcf);
      const methods = [];
      for (let i = 0; fd.get(`m${i}_id`) != null; i++) {
        methods.push({
          id: fd.get(`m${i}_id`), label: fd.get(`m${i}_label`), kind: fd.get(`m${i}_kind`),
          note: fd.get(`m${i}_note`), enabled: fd.get(`m${i}_enabled`) != null,
        });
      }
      const body = {
        provider: fd.get('provider'), currency: fd.get('currency'), methods,
        stripe: { secretKey: fd.get('stripe_secretKey'), webhookSecret: fd.get('stripe_webhookSecret'), publicKey: fd.get('stripe_publicKey') },
        paymob: {
          apiKey: fd.get('paymob_apiKey'), integrationId: fd.get('paymob_integrationId'), iframeId: fd.get('paymob_iframeId'),
          hmacSecret: fd.get('paymob_hmacSecret'), baseUrl: fd.get('paymob_baseUrl'),
        },
      };
      try {
        await api.req('/api/admin/payments', { method: 'PATCH', body });
        const d = await api.req('/api/admin/payments');
        AD.payCfg = d.config; AD.methods = d.methods || []; AD.paidList = d.paid || [];
        S = (await api.req('/api/bootstrap')).settings;
        toast('تم حفظ إعدادات الدفع ✅');
        softRefreshAdmin();
      } catch (err) { toast(err.message, 4000); }
    });
  }

  const waf = $('#waCfgForm');
  if (waf) {
    const providerWarning = {
      console: '⚠️ وضع التجربة: الرسالة بتتسجل في السجل هنا بس ومش بيوصلها لأي موبايل. عشان توصل للعميل فعليًا اختار مزوّد حقيقي (Meta / Twilio / Green API / CallMeBot…) واضبط مفاتيحه، وبعدين اضغط «📤 ابعت رسالة تجربة» على رقمك.',
      link: '⚠️ وضع الرابط: السيرفر بيجهّز wa.me جاهز بيتسجل في السجل — حد المطعم هو اللي بيفتحه ويبعت يدويًا (مش إرسال تلقائي).',
    };
    const show = () => {
      const v = $('#waProvider').value;
      $$('.wa-grp', waf).forEach((g) => { g.style.display = g.getAttribute('data-grp') === v ? '' : 'none'; });
      const w = $('#waProviderWarn');
      if (w) w.textContent = providerWarning[v] || '';
    };
    $('#waProvider')?.addEventListener('change', show);
    show();
    waf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(waf);
      const notifyOn = {};
      for (const st of S.statuses || []) notifyOn[st.id] = fd.get('on_' + st.id) != null;
      const templates = {};
      for (const k of ['new', 'received', 'preparing', 'on_way', 'delivered', 'cancelled', 'paid', 'payment_link', 'staff_new']) {
        const v = fd.get('tpl_' + k);
        if (v != null) templates[k] = v;
      }
      const body = {
        enabled: fd.get('enabled') != null,
        provider: fd.get('provider'),
        defaultCountryCode: fd.get('defaultCountryCode'),
        requireOptIn: fd.get('requireOptIn') != null,
        staffEnabled: fd.get('staffEnabled') != null,
        staffNumbers: String(fd.get('staffNumbers') || '').split(',').map((x) => x.trim()).filter(Boolean),
        notifyOn, templates,
        meta: { token: fd.get('meta_token'), phoneId: fd.get('meta_phoneId'), templateName: fd.get('meta_templateName'), templateLang: fd.get('meta_templateLang') },
        twilio: { accountSid: fd.get('twilio_accountSid'), authToken: fd.get('twilio_authToken'), from: fd.get('twilio_from') },
        greenapi: { baseUrl: fd.get('greenapi_baseUrl'), instanceId: fd.get('greenapi_instanceId'), token: fd.get('greenapi_token') },
        ultramsg: { instanceId: fd.get('ultramsg_instanceId'), token: fd.get('ultramsg_token') },
        callmebot: { apiKey: fd.get('callmebot_apiKey') },
      };
      try {
        await api.req('/api/admin/whatsapp', { method: 'PATCH', body });
        const d = await api.req('/api/admin/whatsapp');
        AD.waCfg = d.config; AD.waTemplates = d.templates; AD.waLog = d.log || [];
        S = (await api.req('/api/bootstrap')).settings;
        toast('تم حفظ إعدادات الواتساب ✅');
        softRefreshAdmin();
      } catch (err) { toast(err.message, 4000); }
    });
  }

  const setf = $('#settingsForm');
  if (setf) setf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(setf);
    const body = {};
    for (const k of ['name', 'tagline', 'phone', 'whatsapp', 'address', 'hoursText', 'deliveryEta']) body[k] = fd.get(k);
    for (const k of ['openHour', 'closeHour', 'deliveryFee', 'freeDeliveryOver', 'minOrder']) body[k] = Number(fd.get(k) || 0);
    body.aiAutoImages = fd.get('aiAutoImages') != null;
    try {
      const d = await api.req('/api/admin/settings', { method: 'PATCH', body });
      S = d.settings; toast('تم حفظ الإعدادات ✅'); softRender();
    } catch (err) { toast(err.message, 3500); }
  });
}

function acceptLogin(data) {
  api.setToken(data.token); ME = data.user; NOTIFS = [];
  MY.loaded = false; MY.orders = []; MY.error = '';
  AD.orders = []; AD.stats = null; AD.users = []; AD.customers = [];
  AD.payCfg = null; AD.waCfg = null; AD.editing = null;
}
async function submitAccountForm(form, work) {
  if (form.dataset.busy === '1') return;
  const btn = $('button[type=submit]', form);
  const label = btn?.textContent;
  const error = $('[data-form-error]', form);
  form.dataset.busy = '1'; form.setAttribute('aria-busy', 'true');
  if (error) { error.hidden = true; error.textContent = ''; }
  if (btn) { btn.disabled = true; btn.textContent = 'جاري الحفظ…'; }
  try { await work(); }
  catch (err) {
    if (error) {
      if (isSetupError(err)) {
        /* قفل إعدادات الاستضافة: نفس الرسالة + رابط مباشر لصفحة خطوات الإصلاح. */
        lastSetupError = err;
        error.innerHTML = `${h(err.message)} <a href="#/setup" style="color:var(--link)">— شاهد خطوات الإصلاح</a>`;
      } else { error.textContent = err.message; }
      error.hidden = false;
    }
    toast(err.message, 4000);
  }
  finally {
    form.dataset.busy = ''; form.removeAttribute('aria-busy');
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

/* Keep an anonymous retry key, not the delivery address, across network failures/reloads. */
let pendingOrderRequest;
try { pendingOrderRequest = JSON.parse(readStorage('bbq_order_request')); } catch {}
async function orderRequestKey(body) {
  const text = JSON.stringify({ user: ME.id, body });
  let fingerprint;
  if (window.crypto?.subtle) {
    const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    fingerprint = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } else {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    fingerprint = String(hash >>> 0);
  }
  let request = pendingOrderRequest;
  if (!request || request.fingerprint !== fingerprint) {
    request = { fingerprint, key: window.crypto?.randomUUID?.() || 'order_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) };
    pendingOrderRequest = request;
    try { localStorage.setItem('bbq_order_request', JSON.stringify(request)); } catch {}
  }
  return request.key;
}

/* ============================== ١٩) تأكيد الطلب ============================== */
async function submitOrder(e) {
  e.preventDefault();
  const form = e.target;
  if (form.dataset.busy === '1') return;
  form.dataset.busy = '1';
  const fd = new FormData(form);
  const customer = {
    name: fd.get('name'), phone: fd.get('phone'), area: fd.get('area'),
    address: fd.get('address'), time: fd.get('time'), notes: fd.get('notes'),
  };
  /* مربع الواتساب بيظهر بس لما الميزة مفعّلة — لو مش ظاهر، بنسجّل تفضيل الحساب
     (مفعّل افتراضيًا) بدل ما نرسل «موقوف» من غير ما العميل اختار حاجة. */
  const waBox = form.querySelector('input[name="notifyWhatsapp"]');
  const body = {
    items: cart.map((c) => ({ id: c.id, qty: c.qty, addons: c.addons, note: c.note })),
    customer, payment: fd.get('payment'), promoCode: promoCode || undefined,
    notifyWhatsapp: waBox ? fd.get('notifyWhatsapp') != null : (ME.notifyWhatsapp !== false),
  };
  const btn = $('button[type=submit]', form);
  if (btn) { btn.disabled = true; btn.textContent = 'بنسجّل طلبك…'; }
  try {
    const idempotencyKey = await orderRequestKey(body);
    const d = await api.req('/api/orders', { method: 'POST', body, idempotencyKey });
    pendingOrderRequest = null;
    try { localStorage.removeItem('bbq_order_request'); } catch {}
    cart = []; promoCode = ''; saveCart();
    MY.orders = [d.order, ...MY.orders.filter((o) => o.id !== d.order.id)];
    MY.loaded = false;
    await loadMyOrders();
    /* لو الدفع أونلاين: نودّيه على صفحة الدفع فورًا (رابط جاي من السيرفر) */
    if (d.payment && d.payment.url) {
      toast(`تم إرسال طلبك للإدارة ${d.order.id} — هتتوجّه للدفع 💳`, 3000);
      setTimeout(() => { location.href = d.payment.url; }, 600);
      return;
    }
    toast(`تم إرسال طلبك للإدارة ${d.order.id} 🔥`, 4000);
    go('order/' + d.order.id);
  } catch (err) {
    toast(err.message, 4000);
    if (btn) { btn.disabled = false; btn.textContent = 'تأكيد الطلب 🍖'; }
  } finally { form.dataset.busy = ''; }
}

/* ============================== ٢٠) كل الضغطات ============================== */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  const notifBtn = e.target.closest('#notifBtn');
  if (notifBtn) { toggleNotifPanel(); return; }
  if (!el) {
    const np = $('#notifPanel');
    if (np && !np.classList.contains('hidden') && !e.target.closest('#notifPanel')) np.classList.add('hidden');
    return;
  }
  const act = el.getAttribute('data-act');
  const id = el.getAttribute('data-id');

  switch (act) {
    case 'theme': toggleTheme(); break;
    case 'nav': go(el.getAttribute('data-to')); break;
    case 'cat': { const c = CATS.find((x) => x.id === id); go('orders?cat=' + encodeURIComponent(c ? c.name : '')); break; }
    case 'hero-dot': { heroGo(Number(el.getAttribute('data-i')) || 0); bindHero(); break; }
    case 'clear-menu': go('orders'); break;
    case 'filter': {
      const c = CATS.find((x) => x.id === id);
      const q = new URLSearchParams(location.hash.split('?')[1] || '');
      c ? q.set('cat', c.name) : q.delete('cat');
      go('orders?' + q);
      break;
    }
    case 'item': openSheet(id); break;
    case 'sheet-close': closeSheet(); break;
    case 'addon': {
      const list = (S.addons && (S.addons[sheet.item.cat] || S.addons.default)) || [];
      const a = list[Number(el.getAttribute('data-i'))];
      const i = sheet.addons.indexOf(a);
      i >= 0 ? sheet.addons.splice(i, 1) : sheet.addons.push(a);
      refreshSheet();
      break;
    }
    case 'sheet-plus': sheet.qty++; refreshSheet(); break;
    case 'sheet-minus': sheet.qty = Math.max(1, sheet.qty - 1); refreshSheet(); break;
    case 'sheet-add': {
      const n = $('#sheetNote');
      addToCart(sheet.item, sheet.qty, sheet.addons.slice(), n ? n.value : '');
      closeSheet();
      break;
    }
    case 'plus': case 'minus': {
      const c = cart.find((x) => x.key === el.getAttribute('data-key'));
      if (!c) break;
      if (act === 'plus') c.qty++;
      else { c.qty--; if (c.qty <= 0) cart = cart.filter((x) => x !== c); }
      saveCart(); softRender();
      break;
    }
    case 'rm': cart = cart.filter((x) => x.key !== el.getAttribute('data-key')); saveCart(); toast('تم الحذف'); softRender(); break;
    case 'promo': {
      const v = ($('#promoInput') ? $('#promoInput').value : '').trim().toUpperCase();
      const p = (S.promos || []).find((x) => x.code.toUpperCase() === v);
      if (!v) { promoCode = ''; softRender(); break; }
      if (!p) { toast('الكود مش صحيح'); break; }
      promoCode = p.code; toast('تم تطبيق ' + p.code); softRender();
      break;
    }
    case 'logout':
      try { await api.req('/api/auth/logout', { method: 'POST' }); } catch {}
      api.setToken(''); ME = null; NOTIFS = []; MY.orders = []; MY.loaded = false; MY.error = '';
      AD.orders = []; AD.users = []; AD.customers = []; AD.stats = null; AD.payCfg = null; AD.waCfg = null;
      if (es) { es.close(); es = null; }
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      toast('تم تسجيل الخروج'); go('home');
      break;
    case 'demo':
      try {
        const d = await api.req('/api/auth/demo', { method: 'POST' });
        acceptLogin(d); startRealtime();
        await loadNotifs();
        toast(`أهلًا ${ME.name} 👋`); go('account');
      } catch (err) { toast(err.message); }
      break;
    case 'pay-now': {
      toast('بنجهّزلك صفحة الدفع… ⏳', 2500);
      try {
        const d = await api.req('/api/orders/' + encodeURIComponent(id) + '/pay', { method: 'POST' });
        if (d.url) { location.href = d.url; break; }
        toast(d.alreadyPaid ? 'الطلب ده مدفوع بالفعل ✅' : 'مقدرناش نجهّز رابط دفع');
      } catch (err) { toast(err.message, 4000); }
      break;
    }

    case 'refresh-orders': await loadMyOrders(true); softRender(); break;
    case 'cancelOrder':
      if (confirm('متأكد إنك عايز تلغي الطلب؟')) {
        try { await api.req('/api/orders/' + encodeURIComponent(id) + '/cancel', { method: 'POST' }); await loadMyOrders(true); toast('تم إلغاء الطلب'); softRender(); }
        catch (err) { toast(err.message, 3500); }
      }
      break;

    /* ---- الإشعارات ---- */
    case 'notif-open': {
      const n = NOTIFS.find((x) => String(x.id) === String(id));
      if (n && !n.read) { try { await api.req('/api/notifications/read', { method: 'POST', body: { id: n.id } }); n.read = true; } catch {} }
      const panel = $('#notifPanel'); if (panel) panel.classList.add('hidden');
      const orderId = el.getAttribute('data-order');
      if (orderId) {
        if (!AD.orders.some((o) => o.id === orderId)) { await loadAdminOrders(); }
        openOrderDrawer(orderId);
      }
      break;
    }
    case 'notif-read-all': try { await api.req('/api/notifications/read', { method: 'POST', body: { all: true } }); await loadNotifs(); renderNotifPanel(); } catch {} break;
    case 'notif-close': { const p = $('#notifPanel'); if (p) p.classList.add('hidden'); break; }

    /* ---- الإدارة ---- */
    case 'admin-tab': go('admin?tab=' + id); break;
    case 'system-refresh': {
      AD.system = null;
      try { AD.system = await api.req('/api/admin/system'); toast('تم تحديث التقرير ✅'); }
      catch (err) { toast(err.message, 3500); }
      softRefreshAdmin();
      break;
    }
    case 'admin-filter': AD.status = id; await loadAdminOrders(); softRefreshAdmin(); break;
    case 'admin-pay-filter': AD.payment = id; await loadAdminOrders(); softRefreshAdmin(); break;
    case 'admin-range': AD.range = el.getAttribute('data-v'); await loadAdminOrders(); softRefreshAdmin(); break;
    case 'admin-filter-cust': AD.tab = 'orders'; AD.q = el.getAttribute('data-q') || ''; go('admin?tab=orders'); await loadAdminOrders(); softRefreshAdmin(); break;
    case 'order-detail': openOrderDrawer(id); break;
    case 'drawer-close': closeDrawer(); break;
    case 'set-status': {
      try {
        await api.req('/api/admin/orders/' + encodeURIComponent(id) + '/status', { method: 'PATCH', body: { status: el.getAttribute('data-v') } });
        await loadAdminStats(); await loadAdminOrders();
        toast('تم تحديث حالة الطلب ✅');
        softRefreshAdmin();
        if ($('#drawer') && $('#drawer').classList.contains('show')) openOrderDrawer(id);
      } catch (err) { toast(err.message, 3500); }
      break;
    }
    case 'force': {
      try {
        await api.req('/api/admin/settings', { method: 'PATCH', body: { forceState: el.getAttribute('data-v') || null } });
        S = (await api.req('/api/bootstrap')).settings;
        toast('تم التحديث'); softRender();
      } catch (err) { toast(err.message); }
      break;
    }
    /* ---- المنيو ---- */
    case 'menu-new': AD.editing = { __new: true, cat: CATS[0] && CATS[0].id, active: true }; softRefreshAdmin(); break;
    case 'menu-edit': AD.editing = { ...byId(id) }; softRefreshAdmin(); break;
    case 'menu-cancel': AD.editing = null; softRefreshAdmin(); break;
    case 'menu-toggle': {
      const m = byId(id);
      try {
        await api.req('/api/admin/menu/' + encodeURIComponent(id), { method: 'PATCH', body: { active: m.active === false } });
        MENU = (await api.req('/api/bootstrap')).menu; softRefreshAdmin();
      } catch (err) { toast(err.message); }
      break;
    }
    case 'menu-del':
      if (confirm('حذف الصنف نهائيًا؟')) {
        try { await api.req('/api/admin/menu/' + encodeURIComponent(id), { method: 'DELETE' }); MENU = (await api.req('/api/bootstrap')).menu; toast('تم الحذف'); softRefreshAdmin(); }
        catch (err) { toast(err.message); }
      }
      break;
    case 'pick-img': {
      if (!AD.editing) break;
      AD.editing.image = el.getAttribute('data-url');
      if (AD.editing.id) {
        try { await api.req('/api/admin/menu/' + encodeURIComponent(AD.editing.id), { method: 'PATCH', body: { image: AD.editing.image } }); MENU = (await api.req('/api/bootstrap')).menu; toast('تم تغيير الصورة ✅'); }
        catch (err) { toast(err.message); }
      }
      softRefreshAdmin();
      break;
    }
    case 'gen-one': {
      if (!AD.editing || !AD.editing.id) { toast('احفظ الصنف الأول'); break; }
      toast('بنولّد صورة… ⏳', 4000);
      try {
        const d = await api.req('/api/admin/menu/' + encodeURIComponent(AD.editing.id) + '/generate-image', { method: 'POST' });
        AD.editing.image = d.item.image;
        MENU = (await api.req('/api/bootstrap')).menu;
        toast(`تم توليد صورة (${d.provider}) ✅`);
        softRefreshAdmin();
      } catch (err) { toast(err.message, 3500); }
      break;
    }
    case 'gen-one': break;
    case 'gen-missing': case 'gen-all': {
      toast('بنولّد الصور… ممكن تاخد لحظة ⏳', 5000);
      try {
        const d = await api.req('/api/admin/menu/generate-images', { method: 'POST', body: { only: act === 'gen-missing' ? 'missing' : 'all' } });
        MENU = (await api.req('/api/bootstrap')).menu;
        toast(`تم توليد/تحديث ${d.generated} صورة ✅`, 4000);
        softRefreshAdmin();
      } catch (err) { toast(err.message, 3500); }
      break;
    }
    /* ---- المستخدمون ---- */
    case 'user-active': {
      try {
        await api.req('/api/admin/users/' + encodeURIComponent(id), { method: 'PATCH', body: { active: el.getAttribute('data-v') === '1' } });
        AD.users = (await api.req('/api/admin/users')).users;
        toast('تم التحديث ✅'); softRefreshAdmin();
      } catch (err) { toast(err.message, 3500); }
      break;
    }
    /* ---- الدفع والواتساب (إجراءات) ---- */
    case 'pay-mark': {
      try {
        await api.req('/api/admin/orders/' + encodeURIComponent(id) + '/payment', { method: 'PATCH', body: { status: el.getAttribute('data-v') } });
        await loadAdminStats(); await loadAdminOrders();
        toast('تم تحديث حالة الدفع ✅');
        softRefreshAdmin();
        if ($('#drawer') && $('#drawer').classList.contains('show')) openOrderDrawer(id);
      } catch (err) { toast(err.message, 3500); }
      break;
    }
    case 'wa-send': {
      try {
        const d = await api.req('/api/admin/orders/' + encodeURIComponent(id) + '/whatsapp', { method: 'POST', body: {} });
        const r = d.row || {};
        toast(r.result === 'sent' ? 'اتبعتت على واتساب ✅' : r.result === 'console' ? 'اتبعتت (وضع console — شوف السيرفر)' : r.result === 'link' ? 'الرسالة جاهزة — افتح الرابط' : 'اتجاهلت: ' + (r.error || ''), 4000);
        if (AD.waCfg) { const x = await api.req('/api/admin/whatsapp'); AD.waCfg = x.config; AD.waTemplates = x.templates; AD.waLog = x.log || []; softRefreshAdmin(); }
      } catch (err) { toast(err.message, 4000); }
      break;
    }
    case 'wa-paylink': {
      try {
        const d = await api.req('/api/admin/orders/' + encodeURIComponent(id) + '/whatsapp', { method: 'POST', body: { kind: 'payment_link' } });
        const r = d.row || {};
        toast(r.result === 'sent' ? 'اتبعت رابط الدفع ✅' : r.result === 'link' ? 'رابط الدفع جاهز — افتحه من السجل' : 'تم تجهيز رابط الدفع', 4000);
        await loadAdminOrders(); softRefreshAdmin();
        if ($('#drawer') && $('#drawer').classList.contains('show')) openOrderDrawer(id);
      } catch (err) { toast(err.message, 4000); }
      break;
    }
    case 'pay-test': {
      toast('بنجرّب الاتصال… ⏳', 4000);
      try {
        const d = await api.req('/api/admin/payments/test', { method: 'POST' });
        toast((d.ok ? '✅ ' : '❌ ') + d.message, 5000);
      } catch (err) { toast(err.message, 4000); }
      break;
    }
    case 'wa-test': {
      const phone = prompt('اكتب رقم للاختبار (بكود الدولة أو 01…):', S.whatsapp || '');
      if (!phone) break;
      toast('بنبعت رسالة تجربة… ⏳', 4000);
      try {
        const d = await api.req('/api/admin/whatsapp/test', { method: 'POST', body: { phone } });
        const r = d.row || {};
        toast(r.result === 'sent' ? 'وصلت الرسالة ✅' : r.result === 'console' ? 'اتبعتت (console)' : r.result === 'link' ? 'رابط جاهز في السجل' : 'فشلت: ' + (r.error || ''), 5000);
        const x = await api.req('/api/admin/whatsapp'); AD.waCfg = x.config; AD.waTemplates = x.templates; AD.waLog = x.log || []; softRefreshAdmin();
      } catch (err) { toast(err.message, 4000); }
      break;
    }
    case 'wa-resend': {
      try {
        await api.req('/api/admin/whatsapp/test', { method: 'POST', body: { phone: el.getAttribute('data-phone'), text: el.getAttribute('data-text') } });
        toast('تمت إعادة الإرسال ✅');
        const x = await api.req('/api/admin/whatsapp'); AD.waCfg = x.config; AD.waTemplates = x.templates; AD.waLog = x.log || []; softRefreshAdmin();
      } catch (err) { toast(err.message, 4000); }
      break;
    }
    case 'copy-url': {
      try { await navigator.clipboard.writeText(el.getAttribute('data-url')); toast('تم النسخ ✅'); }
      catch { toast('انسخ الرابط يدويًا: ' + el.getAttribute('data-url'), 6000); }
      break;
    }

    case 'backup': {
      try {
        const d = await api.req('/api/admin/backup');
        const blob = new Blob([JSON.stringify(d.backup, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `bbq-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        toast('تم تنزيل النسخة الاحتياطية ✅');
      } catch (err) { toast(err.message); }
      break;
    }
  }
});

/* تغيير الدور من القائمة المنسدلة */
document.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-act="user-role"]');
  if (!sel) return;
  try {
    await api.req('/api/admin/users/' + encodeURIComponent(sel.getAttribute('data-id')), { method: 'PATCH', body: { role: sel.value } });
    AD.users = (await api.req('/api/admin/users')).users;
    toast('تم تغيير الصلاحية ✅'); softRefreshAdmin();
  } catch (err) { toast(err.message, 3500); AD.users = (await api.req('/api/admin/users')).users; softRefreshAdmin(); }
});

window.addEventListener('hashchange', async (event) => {
  const menuRoute = (url) => /^#\/(orders|menu)(?:\?|$)/.test(new URL(url).hash);
  const filtering = menuRoute(event.oldURL) && menuRoute(event.newURL);
  const search = document.activeElement && document.activeElement.id === 'searchInput' ? document.activeElement : null;
  const caret = search ? search.selectionStart : null;
  closeSheet(); closeDrawer();
  await render({ soft: filtering, scroll: !filtering });
  if (search) {
    const input = $('#searchInput');
    if (input) { input.focus({ preventScroll: true }); if (caret !== null) input.setSelectionRange(caret, caret); }
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { closeSheet(); closeDrawer(); $('#notifPanel')?.classList.add('hidden'); }
  if (event.key === 'Tab') {
    const dialog = $('#sheet.show .sheet') || $('#drawer.show .drawer');
    if (!dialog) return;
    const elements = $$('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]', dialog)
      .filter((el) => el.getClientRects().length);
    const first = elements[0], last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});

$('#skipLink')?.addEventListener('click', () => {
  const main = $('#view main');
  if (main) { main.tabIndex = -1; main.focus(); }
});

/* ============================== ٢١) التشغيل ============================== */
function finishSplash() {
  const splash = $('#splash');
  if (!splash) return;
  splash.classList.add('is-ready');
  setTimeout(() => splash.remove(), 220);
}

(async function boot() {
  try {
    await loadBootstrap();
    await render({ force: true, scroll: true });
  } catch (e) {
    if (isSetupError(e)) {
      /* الإعداد الناقص مش «انترنت واقع» — بنعرض صفحة الإصلاح المخصصة. */
      lastSetupError = e;
      $('#view').innerHTML = setupPageHTML();
      return;
    }
    $('#view').innerHTML = `${headerHTML('home')}<main class="app"><div class="wrap empty" style="padding-top:60px">
      <div class="big">🔌</div><h1>مش قادرين نوصل للمطعم</h1>
      <p>${h(e.message || 'تأكد من اتصالك بالإنترنت ومن تشغيل السيرفر، وجرّب تاني.')}</p>
      <button class="btn btn-primary" onclick="location.reload()">إعادة المحاولة</button>
    </div></main>`;
    return;
  } finally {
    finishSplash();
  }
  if (ME) {
    await loadNotifs();
    startRealtime();
  }
})();
