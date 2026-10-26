/* UI regression tests, with Node's built-in runner: npm run test:ui.
   Rendering/route/theme logic is executed in a small DOM harness; no runtime dependencies.
   This complements the API suite and the real-browser/mobile checks, not a browser replacement. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PUBLIC = path.join(__dirname, '..', 'public');
const source = (file) => fs.readFileSync(path.join(PUBLIC, file), 'utf8');
const appSource = source('app.js').split('(async function boot()')[0];
const themeSource = source('theme.js');

const fixture = {
  settings: { name: 'The Original BBQ', tagline: 'مشاوي على الفحم', currency: 'ج.م', deliveryFee: 20,
    freeDeliveryOver: 300, minOrder: 60, deliveryEta: '٤٥ دقيقة', forceState: 'open',
    promos: [{ code: 'BBQ10', type: 'percent', value: 10, min: 150 }], addons: {}, statuses: [], payments: [] },
  categories: [{ id: 'meals', name: 'وجبات' }, { id: 'rolls', name: 'رول ساندويتش' }, { id: 'offers', name: 'عروض' }],
  menu: [
    { id: 'm1', cat: 'meals', name: 'ميكس جريل', desc: 'على الفحم البلدي', price: 240, featured: true, image: '/img/ai-meals.jpg' },
    { id: 'm2', cat: 'meals', name: 'شيش طاووق', desc: 'فراخ متبّلة', price: 190, spicy: true },
    { id: 'r1', cat: 'rolls', name: 'أوريجينال رول', price: 80 },
    { id: 'o1', cat: 'offers', name: 'عرض رول', noPrice: true, price: null },
  ],
};

function harness({ preference, deniedStorage = false, hash = '#/orders' } = {}) {
  const saved = new Map(preference === undefined ? [] : [['bbq_theme', preference]]);
  const elements = new Map();
  const events = new Map();
  class Element {
    constructor() {
      this.attributes = new Map(); this.style = {}; this.innerHTML = ''; this.textContent = '';
      this.classes = new Set(); this.isConnected = true;
      this.classList = {
        add: (v) => this.classes.add(v), remove: (v) => this.classes.delete(v), contains: (v) => this.classes.has(v),
        toggle: (v, on) => { const yes = on === undefined ? !this.classes.has(v) : on; yes ? this.classes.add(v) : this.classes.delete(v); return yes; },
      };
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.get(k) ?? null; }
    appendChild(el) { elements.set('#' + el.id, el); }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    addEventListener() {}
    remove() { elements.delete('#' + this.id); }
    focus() {}
  }
  const root = new Element(), meta = new Element(), view = new Element(), body = new Element();
  elements.set('#view', view);
  const document = {
    documentElement: root, body, activeElement: null,
    querySelector: (s) => s === 'meta[name="theme-color"]' ? meta : elements.get(s) || null,
    querySelectorAll: () => [], createElement: () => new Element(), addEventListener() {},
  };
  const window = {
    addEventListener: (name, fn) => { if (!events.has(name)) events.set(name, []); events.get(name).push(fn); },
    dispatchEvent: (event) => { for (const fn of events.get(event.type) || []) fn(event); },
    scrollTo() {}, matchMedia: () => ({ matches: true }), // A light OS must not replace the design's day default.
  };
  const localStorage = {
    getItem: (k) => { if (deniedStorage) throw new Error('storage blocked'); return saved.get(k) ?? null; },
    setItem: (k, v) => { if (deniedStorage) throw new Error('storage blocked'); saved.set(k, String(v)); },
    removeItem: (k) => { if (deniedStorage) throw new Error('storage blocked'); saved.delete(k); },
  };
  class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
  const context = vm.createContext({ window, document, localStorage, location: { hash }, URL, URLSearchParams,
    CustomEvent, AbortController, navigator: {}, console, setTimeout: () => 1, clearTimeout() {},
    setInterval: () => 1, clearInterval() {}, fetch: async () => { throw new Error('Unexpected network call in UI harness'); } });
  vm.runInContext(themeSource, context, { filename: 'theme.js' });
  vm.runInContext(appSource, context, { filename: 'app.js' });
  vm.runInContext(`S = ${JSON.stringify(fixture.settings)}; CATS = ${JSON.stringify(fixture.categories)}; MENU = ${JSON.stringify(fixture.menu)};`, context);
  const evaluate = (code) => vm.runInContext(code, context);
  return { evaluate, context, saved, root, meta, view, elements, window, document };
}

const cardIDs = (html) => [...html.matchAll(/data-menu-id="([^"]+)"/g)].map((m) => m[1]);

test('day is the dark default even with a light OS preference', () => {
  const ui = harness();
  assert.equal(ui.evaluate('getTheme()'), 'day');
  assert.equal(ui.root.getAttribute('data-theme'), 'day');
  assert.equal(ui.meta.getAttribute('content'), '#0D0A08');
  assert.equal(ui.saved.has('bbq_theme'), false);
});

test('legacy dark/light preferences are recognized without overwriting storage on boot', () => {
  for (const [legacy, canonical] of [['dark', 'day'], ['light', 'night']]) {
    const ui = harness({ preference: legacy });
    assert.equal(ui.evaluate('getTheme()'), canonical);
    assert.equal(ui.saved.get('bbq_theme'), legacy);
  }
});

test('invalid preferences fall back to day', () => {
  assert.equal(harness({ preference: 'unknown' }).evaluate('getTheme()'), 'day');
});

test('theme toggling persists canonical names and updates the browser theme colour', () => {
  const ui = harness();
  ui.evaluate('toggleTheme()');
  assert.equal(ui.saved.get('bbq_theme'), 'night');
  assert.equal(ui.root.getAttribute('data-theme'), 'night');
  assert.equal(ui.meta.getAttribute('content'), '#FDF9F3');
  assert.equal(harness({ preference: ui.saved.get('bbq_theme') }).evaluate('getTheme()'), 'night');
  ui.evaluate('toggleTheme()');
  assert.equal(ui.saved.get('bbq_theme'), 'day');
});

test('blocked localStorage does not break the app or in-memory theme toggles', () => {
  const ui = harness({ deniedStorage: true });
  ui.evaluate('toggleTheme()');
  assert.equal(ui.evaluate('getTheme()'), 'night');
  assert.equal(ui.evaluate('api.token'), '');
  ui.evaluate('toggleTheme()');
  assert.equal(ui.evaluate('getTheme()'), 'day');
});

test('another tab changing or clearing the preference updates this tab', () => {
  const ui = harness();
  ui.saved.set('bbq_theme', 'night');
  ui.window.dispatchEvent({ type: 'storage', key: 'bbq_theme' });
  assert.equal(ui.evaluate('getTheme()'), 'night');
  ui.saved.clear();
  ui.window.dispatchEvent({ type: 'storage', key: null });
  assert.equal(ui.evaluate('getTheme()'), 'day');
});

test('the full logo keeps its original wide artboard and all flame colours', () => {
  const logo = source('img/logo.svg');
  assert.match(logo, /viewBox="0 0 841\.9 595\.3"/);
  assert.ok((logo.match(/<path\b/g) || []).length > 30);
  for (const colour of ['#B70000', '#EF4136', '#E82823', '#F68C1D', '#FFF200', '#9D0F14']) assert.ok(logo.includes(colour));
  const header = harness().evaluate("headerHTML('orders')");
  assert.match(header, /class="app-logo" src="\/img\/logo.svg(?:\?[^\"]*)?"[^>]*width="56" height="40"/);
  assert.doesNotMatch(header, /logo-mark\.svg/);
  assert.match(source('index.html'), /class="splash-logo" src="\/img\/logo.svg(?:\?[^\"]*)?"/);
});

test('Cairo and Tajawal are self-hosted WOFF2 fonts with their licences', () => {
  const css = source('fonts.css');
  assert.match(css, /font-family: 'Cairo'/);
  assert.match(css, /font-family: 'Tajawal'/);
  for (const match of css.matchAll(/url\('\/(fonts\/[^']+)'\)/g)) {
    assert.equal(fs.readFileSync(path.join(PUBLIC, match[1])).subarray(0, 4).toString(), 'wOF2');
  }
  assert.ok(source('fonts/CAIRO-LICENSE.txt').includes('SIL OPEN FONT LICENSE'));
  assert.ok(source('fonts/TAJAWAL-LICENSE.txt').includes('SIL OPEN FONT LICENSE'));
  for (const file of ['index.html', 'pay.html']) {
    assert.match(source(file), /href="\/fonts.css(?:\?[^\"]*)?"/);
    assert.doesNotMatch(source(file), /fonts\.googleapis|fonts\.gstatic/);
  }
});

test('payment and app use the same theme implementation and palette', () => {
  for (const file of ['index.html', 'pay.html']) {
    assert.match(source(file), /src="\/theme.js(?:\?[^\"]*)?"/);
    assert.match(source(file), /href="\/styles.css(?:\?[^\"]*)?"/);
  }
  const css = source('styles.css');
  for (const colour of ['#0D0A08', '#1A1410', '#221A14', '#F5EDE0', '#A89880', '#FDF9F3', '#6B5E50', '#E8E0D4']) assert.ok(css.includes(colour));
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /env\(safe-area-inset-bottom/);
});

const CUSTOMER = "ME = {id:'customer', name:'عميل', email:'customer@example.com', role:'customer'}";

test('ordering works at #/orders and the legacy #/menu alias', async () => {
  for (const hash of ['#/orders', '#/menu']) {
    const ui = harness({ hash });
    ui.evaluate(CUSTOMER);
    await ui.evaluate('render()');
    assert.match(ui.view.innerHTML, /ordering-page/);
    assert.deepEqual(cardIDs(ui.view.innerHTML), ['m1', 'm2', 'r1', 'o1']);
    assert.match(ui.view.innerHTML, /data-to="orders" class="nav-item active on" aria-current="page"/);
  }
});

test('order history is a separate guest-protected route, with correct login return links', async () => {
  const ui = harness({ hash: '#/my-orders' });
  await ui.evaluate('render()');
  assert.match(ui.view.innerHTML, /href="#\/login\?return=my-orders"/);
  assert.match(ui.view.innerHTML, /href="#\/signup\?return=my-orders"/);
  assert.doesNotMatch(ui.view.innerHTML, /ordering-page/);
  ui.evaluate(CUSTOMER + '; api.req = async () => ({ orders: [] })');
  await ui.evaluate('render()');
  assert.match(ui.view.innerHTML, /data-to="my-orders" class="nav-item active on"/);
  assert.doesNotMatch(ui.view.innerHTML, /ordering-page|welcome-gate/);
  assert.match(source('pay.html'), /href="\/#\/my-orders"/);
});

test('guests get the welcome screen before any page — the mock-up art, LOGIN and Register!, and no app chrome', async () => {
  for (const [hash, ret] of [['#/', ''], ['#/home', ''], ['#/orders?cat=rolls', '?return=orders%3Fcat%3Drolls'], ['#/checkout', '?return=checkout']]) {
    const ui = harness({ hash });
    ui.evaluate("addToCart(MENU[0], 1, [], '')");
    await ui.evaluate('render()');
    const html = ui.view.innerHTML;
    assert.match(html, /<main class="welcome-gate is-intro" id="welcomeGate"/);
    assert.match(html, /<img class="welcome-art" src="\/img\/welcome-art\.svg\?v=[0-9a-f]{12}"[^>]*alt="Welcome to The Original BBQ/);
    assert.match(html, /<div class="welcome-planet" aria-hidden="true"><\/div>/);   // the arch extender; the doodles are inside the art
    assert.ok(html.includes(`<a class="welcome-login" href="#/login${ret}" data-gate-open>`), hash);
    assert.ok(html.includes(`<a class="welcome-register" href="#/signup${ret}" data-gate-open>`), hash);
    assert.match(html, />LOGIN<\/span><span class="sr-only"> — تسجيل الدخول</);
    assert.match(html, />Register!<\/span><span class="sr-only"> — إنشاء حساب جديد</);   // the art draws the glyphs; the link is a transparent overlay
    assert.match(html, /<h1 class="sr-only">/);
    assert.doesNotMatch(html, /class="nav-item|app-header|ordering-page|role="dialog"/);
    assert.equal(ui.document.body.classList.contains('is-gated'), true);
    assert.equal(ui.meta.getAttribute('content'), '#000000');
    assert.equal(ui.elements.get('#cartBar').classList.contains('show'), false);
  }
});

test('the welcome art files exist, are cache-busted by content, and keep the mock-up palette', () => {
  const crypto = require('node:crypto');
  const app = source('app.js');
  for (const file of ['welcome-art.svg']) {
    const svg = source('img/' + file);
    const hash = crypto.createHash('sha256').update(svg).digest('hex').slice(0, 12);
    assert.ok(app.includes(`/img/${file}?v=${hash}`), file + ' cache-busting hash');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.doesNotMatch(svg, /<script|NaN|href="(?!#)/);
  }
  assert.ok(!app.includes('welcome-pattern'), 'the stand-in doodle pattern is gone now that the original art carries its own');
  assert.ok(!require('node:fs').existsSync(require('node:path').join(__dirname, '..', 'public', 'img', 'welcome-pattern.svg')));
  const art = source('img/welcome-art.svg');
  assert.match(art, /viewBox="-438\.2 -174 228 498"/);
  for (const colour of ['#9B0F14', '#9D0E12', '#E62823', '#FFFFFF']) assert.ok(art.includes(colour), colour);
  const css = source('styles.css');
  for (const colour of ['#C3C3C3', '#010101', '#F60205', '#FDFDFD']) assert.ok(css.includes(colour), colour);
  assert.match(css, /--u: min\(calc\(100vw \/ 228\)/);
});

test('login, sign-up, forgot and reset open as a modal sheet over the welcome art', async () => {
  const cases = [
    ['#/login?return=checkout', 'loginForm', '#/checkout'],
    ['#/signup', 'signupForm', '#/'],
    ['#/forgot?return=my-orders', 'forgotForm', '#/my-orders'],
    ['#/reset?token=abc123', 'resetForm', '#/'],
  ];
  for (const [hash, form, close] of cases) {
    const ui = harness({ hash });
    await ui.evaluate('render()');
    const html = ui.view.innerHTML;
    assert.match(html, /class="welcome-gate is-intro has-sheet"/, hash);
    assert.match(html, /<div class="welcome-stage" inert>/, hash);
    assert.match(html, /role="dialog" aria-modal="true" aria-label="[^"]+" aria-describedby="authDesc"/, hash);
    assert.ok(html.includes(`id="${form}"`), hash);
    assert.ok(html.includes(`data-close="${close}"`), hash);
    assert.match(html, /class="auth-close" href="[^"]*" data-act="auth-close" aria-label="إغلاق/, hash);
    assert.match(html, /<span data-label>/, hash);
  }
  const ui = harness({ hash: '#/login?return=checkout' });
  await ui.evaluate('render()');
  const login = ui.view.innerHTML;
  assert.match(login, /name="return" value="checkout"/);
  assert.match(login, /<a href="#\/login\?return=checkout" data-replace class="on" aria-current="page">/);
  assert.match(login, /<a href="#\/signup\?return=checkout" data-replace>/);
  assert.match(login, /<a href="#\/forgot\?return=checkout" data-replace>/);
  assert.match(login, /href="#\/login\?return=checkout" data-gate-open/);   // the art behind keeps its links
  const reset = harness({ hash: '#/reset?token=abc123' });
  await reset.evaluate('render()');
  assert.match(reset.view.innerHTML, /name="token" value="abc123"/);
  assert.doesNotMatch(reset.view.innerHTML, /class="auth-tabs"/);
});

test('return targets stay inside the app and never loop back to an auth page', () => {
  const ui = harness();
  const ret = (v) => ui.evaluate(`safeReturn(${JSON.stringify(v)})`);
  assert.equal(ret('orders?cat=rolls'), 'orders?cat=rolls');
  assert.equal(ret('#/order/BBQ-1?pay=success'), 'order/BBQ-1?pay=success');
  for (const loop of ['', 'home', '#/', 'login', '#/signup?return=x', 'forgot', 'reset?token=1', 'welcome', 'setup',
    'https://evil.example/', '//evil.example', 'javascript:alert(1)', '?x=1']) assert.equal(ret(loop), '', loop);
});

test('a signed-in user opening an auth link goes straight in, and the gate never shows', async () => {
  for (const [hash, target] of [['#/login?return=checkout', '#/checkout'], ['#/signup', '#/'], ['#/welcome', '#/'], ['#/forgot', '#/']]) {
    const ui = harness({ hash });
    ui.evaluate(CUSTOMER);
    await ui.evaluate('render()');
    assert.equal(ui.context.location.hash, target, hash);
    assert.doesNotMatch(ui.view.innerHTML, /welcome-gate/, hash);
  }
});

test('leaving the gate restores the theme colour and the cart bar', async () => {
  const ui = harness({ hash: '#/orders' });
  ui.evaluate("addToCart(MENU[0], 1, [], '')");
  await ui.evaluate('render()');
  assert.equal(ui.meta.getAttribute('content'), '#000000');
  ui.evaluate("toggleTheme()");
  assert.equal(ui.meta.getAttribute('content'), '#000000');   // the welcome art keeps its black top
  ui.evaluate(CUSTOMER);
  await ui.evaluate('render()');
  assert.equal(ui.document.body.classList.contains('is-gated'), false);
  assert.equal(ui.meta.getAttribute('content'), '#FDF9F3');
  assert.equal(ui.elements.get('#cartBar').classList.contains('show'), true);
});

test('busy account buttons change their label but keep the red badge icon', async () => {
  const ui = harness();
  const label = { textContent: 'دخول' };
  const button = { disabled: false, textContent: 'دخول', dataset: { busyLabel: 'جاري الدخول…' }, querySelector: (s) => s === '[data-label]' ? label : null };
  const form = { dataset: {}, querySelector: (s) => s === '[data-form-error]' ? null : button, setAttribute() {}, removeAttribute() {} };
  ui.context.form = form;
  let finish;
  ui.context.work = () => new Promise((resolve) => { finish = resolve; });
  const running = ui.evaluate('submitAccountForm(form, work)');
  assert.equal(label.textContent, 'جاري الدخول…');
  assert.equal(button.textContent, 'دخول');
  finish(); await running;
  assert.equal(label.textContent, 'دخول'); assert.equal(button.disabled, false);
});

test('menu groups come from real categories, not invented demo food', () => {
  const html = harness().evaluate('viewsMenu(new URLSearchParams())');
  assert.deepEqual(cardIDs(html), ['m1', 'm2', 'r1', 'o1']);
  assert.equal((html.match(/class="menu-section"/g) || []).length, 3);
  assert.match(html, /تصنيفات الأصناف/);
});

test('category filters accept both IDs and existing name-based links', () => {
  const ui = harness();
  for (const cat of ['rolls', 'رول ساندويتش']) {
    const html = ui.evaluate(`viewsMenu(new URLSearchParams(${JSON.stringify({ cat })}))`);
    assert.deepEqual(cardIDs(html), ['r1']);
    assert.match(html, /data-id="rolls" aria-pressed="true"/);
  }
});

test('Arabic search handles hamza, case and optional diacritics', () => {
  const ui = harness();
  for (const search of ['اوريجينال', 'أُوريجينال']) {
    const html = ui.evaluate(`viewsMenu(new URLSearchParams(${JSON.stringify({ q: search })}))`);
    assert.deepEqual(cardIDs(html), ['r1']);
  }
  assert.equal(ui.evaluate("normalizeSearch('BBQ')"), 'bbq');
});

test('search and category filters combine; empty results offer a working reset action', () => {
  const ui = harness();
  assert.deepEqual(cardIDs(ui.evaluate("viewsMenu(new URLSearchParams({cat:'meals',q:'شيش'}))")), ['m2']);
  const empty = ui.evaluate("viewsMenu(new URLSearchParams({q:'zzzz'}))");
  assert.deepEqual(cardIDs(empty), []);
  assert.match(empty, /data-act="clear-menu"/);
});

test('sorting is stable and keeps no-price offers last for both price directions', () => {
  const ui = harness();
  assert.deepEqual(cardIDs(ui.evaluate("viewsMenu(new URLSearchParams({sort:'cheap'}))")), ['r1', 'm2', 'm1', 'o1']);
  assert.deepEqual(cardIDs(ui.evaluate("viewsMenu(new URLSearchParams({sort:'pricey'}))")), ['m1', 'm2', 'r1', 'o1']);
  assert.equal(cardIDs(ui.evaluate("viewsMenu(new URLSearchParams({sort:'hot'}))"))[0], 'm1');
});

test('currency uses Arabic digits and the configured unit; ISO SAR/EGP get natural Arabic labels', () => {
  const ui = harness();
  assert.equal(ui.evaluate('money(145)'), '١٤٥ ج.م');
  ui.evaluate("S.currency = 'SAR'");
  assert.equal(ui.evaluate('money(145)'), '١٤٥ ر.س');
  ui.evaluate("S.currency = 'ر.س'");
  assert.equal(ui.evaluate('money(145)'), '١٤٥ ر.س');
  ui.evaluate("S.currency = 'EGP'");
  assert.equal(ui.evaluate('money(145)'), '١٤٥ ج.م');
});

test('menu content and currency labels are escaped before HTML insertion', () => {
  const ui = harness();
  const card = ui.evaluate(`itemCardHTML({id:'x',name:'<img onerror="evil()">',desc:'<script>bad</script>',price:10})`);
  assert.doesNotMatch(card, /<script>|<img onerror=/);
  assert.match(card, /&lt;script&gt;/);
  ui.evaluate("S.currency = '<svg onload=evil()>'");
  assert.doesNotMatch(ui.evaluate('moneyHTML(10)'), /<svg/);
});

test('spicy badges are based on explicit menu data, not popularity', () => {
  const ui = harness();
  assert.match(ui.evaluate('itemCardHTML(MENU[1])'), /class="tag badge-hot">🔥 حار/);
  assert.doesNotMatch(ui.evaluate('itemCardHTML(MENU[0])'), /badge-hot/);
  assert.match(source('styles.css'), /transform: rotate\(-2deg\)/);
});

test('unavailable dishes stay visible but cannot be added from card or sheet', () => {
  const ui = harness();
  ui.evaluate('MENU[0].available = false; sheet.item = MENU[0]');
  assert.match(ui.evaluate('itemCardHTML(MENU[0])'), /نفد اليوم/);
  assert.match(ui.evaluate('itemCardHTML(MENU[0])'), /class="btn-add"[^>]*disabled/);
  assert.match(ui.evaluate('sheetHTML()'), /data-act="sheet-add" disabled/);
  ui.evaluate("addToCart(MENU[0], 1, [], '')");
  assert.equal(ui.evaluate('cartCount()'), 0);
});

test('product dialogs have names, modal semantics and labelled quantity controls', () => {
  const ui = harness();
  ui.evaluate('sheet.item = MENU[0]');
  const html = ui.evaluate('sheetHTML()');
  assert.match(html, /aria-modal="true" aria-labelledby="sheetTitle"/);
  assert.match(html, /id="sheetTitle"/);
  assert.match(html, /aria-label="زيادة الكمية"/);
  assert.match(html, /aria-label="إغلاق تفاصيل الصنف"/);
});

test('add-to-cart retains addons, quantities, notes and saved state', () => {
  const ui = harness();
  ui.evaluate("addToCart(MENU[0], 2, [{name:'صوص إضافي',price:10}], 'من غير شطة')");
  assert.equal(ui.evaluate('cartCount()'), 2);
  const saved = JSON.parse(ui.saved.get('bbq_cart'));
  assert.equal(saved[0].qty, 2);
  assert.equal(saved[0].note, 'من غير شطة');
  assert.equal(saved[0].addons[0].price, 10);
  assert.equal(ui.evaluate('cartTotals().subtotal'), 500);
  assert.equal(ui.evaluate('cartTotals().delivery'), 0);
  assert.equal(ui.evaluate('cartTotals().total'), 500);
});

test('the menu shows two items per row on mobile, like the home picks grid', () => {
  const css = source('styles.css');
  assert.match(css, /\.menu-grid \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); gap: 10px; \}/);
  /* الكارت نفسه رأسي على الموبايل (صورة فوق) وبيرجع أفقي على الشاشات الكبيرة */
  assert.match(css, /\.menu-card \{\n  display: flex; flex-direction: column;/);
  assert.match(css, /\.card-img \{ display: block; width: 100%; aspect-ratio: 1 \/ 0\.82;/);
  const ui = harness();
  const html = ui.evaluate("viewsMenu(new URLSearchParams())");
  assert.match(html, /class="menu-grid"/);
});

test('a dish with several sizes stays one card that lists its sizes', () => {
  const ui = harness();
  ui.evaluate(`MENU.push({ id: 'sz', cat: 'meals', name: 'أوريجينال', price: 120,
    sizes: [{ name: 'سنجل', price: 120 }, { name: 'دابل', price: 150 }, { name: 'تربل', price: 180 }] })`);
  const card = ui.evaluate('itemCardHTML(MENU[4])');
  assert.deepEqual(cardIDs(card), ['sz']);                       // كارت واحد، مش كارت لكل حجم
  assert.match(card, /class="size-chips"/);
  assert.match(card, /سنجل/);
  assert.match(card, /تربل/);
  assert.match(card, /<small>من<\/small>/);                       // السعر بيبدأ «من …»
  assert.match(card, /١٢٠/);                                      // أقل سعر بين الأحجام
  /* الأصناف اللي ملهاش أحجام ما بتعرضش شرائح */
  assert.doesNotMatch(ui.evaluate('itemCardHTML(MENU[0])'), /size-chips/);
});

test('the item sheet picks the size and charges its price in the cart', () => {
  const ui = harness();
  ui.evaluate(`MENU.push({ id: 'sz', cat: 'meals', name: 'أوريجينال', price: 120,
    sizes: [{ name: 'سنجل', price: 120 }, { name: 'دابل', price: 150 }] })`);
  ui.evaluate('sheet.item = MENU[4]; sheet.size = 1');
  const html = ui.evaluate('sheetHTML()');
  assert.match(html, /data-act="size"/);
  assert.match(html, /دابل/);
  assert.match(html, /أضف للسلة — ١٥٠/);                          // السعر حسب الحجم المختار
  ui.evaluate("addToCart(MENU[4], 1, [], '', 'دابل')");
  ui.evaluate("addToCart(MENU[4], 1, [], '', 'سنجل')");
  assert.equal(ui.evaluate('cart.length'), 2);                    // نفس الصنف بحجمين = سطرين
  const saved = JSON.parse(ui.saved.get('bbq_cart'));
  assert.equal(saved[0].size, 'دابل');
  assert.equal(saved[0].price, 150);
  assert.equal(saved[1].price, 120);
  assert.equal(ui.evaluate('cartTotals().subtotal'), 270);
});

test('cart discounts and delivery remain consistent after the UI redesign', () => {
  const ui = harness();
  ui.evaluate("addToCart(MENU[0], 1, [{name:'صوص',price:10}], ''); promoCode = 'BBQ10'");
  assert.equal(ui.evaluate('cartTotals().subtotal'), 250);
  assert.equal(ui.evaluate('cartTotals().delivery'), 20);
  assert.equal(ui.evaluate('cartTotals().discount'), 25);
  assert.equal(ui.evaluate('cartTotals().total'), 245);
});

test('floating cart is a keyboard-accessible button and hides on checkout/cart/admin', () => {
  const ui = harness();
  ui.evaluate("addToCart(MENU[0], 1, [], '')");
  const bar = ui.elements.get('#cartBar');
  assert.equal(bar.type, 'button');
  assert.equal(bar.tabIndex, 0);
  assert.equal(bar.classList.contains('show'), true);
  assert.match(bar.getAttribute('aria-label'), /عرض السلة/);
  for (const route of ['cart', 'checkout', 'admin', 'login']) {
    ui.evaluate(`location.hash = '#/${route}'; renderCartBar()`);
    assert.equal(bar.tabIndex, -1);
    assert.equal(bar.getAttribute('aria-hidden'), 'true');
    assert.equal(bar.classList.contains('show'), false);
  }
});

test('staff retain their admin navigation, while customers do not see it', () => {
  const ui = harness();
  assert.doesNotMatch(ui.evaluate("navHTML('orders')"), /data-to="admin"/);
  ui.evaluate("ME = {role:'admin'}");
  assert.match(ui.evaluate("navHTML('orders')"), /data-to="admin"/);
  assert.match(ui.evaluate("headerHTML('orders')"), /id="notifBtn"/);
});


test('admin forms are rebound after soft refresh rather than submitting native GET requests', () => {
  const ui = harness({ hash: '#/admin' });
  ui.elements.set('#adminBody', { innerHTML: '' });
  ui.evaluate("ME = {role:'admin'}; AD.tab = 'menu'; AD.editing = {...MENU[0]}; let binds = 0; bindPage = () => { binds++; }; softRefreshAdmin()");
  assert.equal(ui.evaluate('binds'), 1);
  assert.match(ui.elements.get('#adminBody').innerHTML, /id="menuForm"/);
  assert.match(ui.elements.get('#adminBody').innerHTML, /name="spicy"/);
  assert.match(ui.elements.get('#adminBody').innerHTML, /name="available"/);
});

test('the deployment-readiness tab is admin-only', () => {
  const ui = harness({ hash: '#/admin' });
  ui.evaluate("ME = {role:'customer'}");
  assert.doesNotMatch(ui.evaluate("adminTabsHTML('dash')"), /data-id="system"/);
  assert.match(ui.evaluate("adminBodyFor('system')"), /للأدمن فقط/);
  ui.evaluate("ME = {role:'admin'}");
  assert.match(ui.evaluate("adminTabsHTML('dash')"), /data-id="system"/);
  assert.doesNotMatch(ui.evaluate("adminBodyFor('system')"), /للأدمن فقط/);
});

test('the system report shows masked values and never leaks secrets', () => {
  const ui = harness({ hash: '#/admin' });
  ui.evaluate(`ME = {role:'admin'}; AD.system = {
    serverless: true, storage: 'redis', redis: { ok: true, ms: 12 },
    credentials: { ownerFromEnv: true, ownerEmail: 'owner@bbq.test', ownerConfigured: true, note: 'note' },
    warnings: [{ level: 'danger', message: 'warning text' }],
    vars: [
      { key: 'UPSTASH_REDIS_REST_TOKEN', label: 'توكن', hint: 'hint', level: 'required', active: true, present: true, value: '••••••wxyz', status: 'ok' },
      { key: 'APP_URL', label: 'الرابط', hint: 'hint', level: 'required', active: true, present: true, value: 'https://bbq.vercel.app', status: 'ok' },
      { key: 'ADMIN_PASSWORD', label: 'السر', hint: 'hint', level: 'required', active: true, present: true, value: '••••••2026', status: 'ok' },
      { key: 'DEMO_LOGIN', label: 'تجريبي', hint: 'hint', level: 'recommended', active: true, present: false, value: '', status: 'missing' },
    ] }`);
  const html = ui.evaluate('adminSystemHTML()');
  assert.match(html, /UPSTASH_REDIS_REST_TOKEN/);
  assert.match(html, /ADMIN_PASSWORD/);
  assert.match(html, /••••••2026/);               // masked, not the raw password
  assert.doesNotMatch(html, /my-real-password/);
  assert.match(html, /data-act="system-refresh"/); // refreshable after a redeploy
  assert.match(html, /Redeploy/);                  // tells the owner the next action
  assert.match(html, /warning text/);              // surfaces the danger warning
  assert.match(html, /hint/);                      // and how to fix what is missing
  ui.evaluate('AD.system = null');
  assert.match(ui.evaluate('adminSystemHTML()'), /⏳/);   // loading state, not a crash
});

test('real login/signup never publish demo credentials and quick login is opt-in', () => {
  const ui = harness();
  const login = ui.evaluate("authPageHTML('login', new URLSearchParams())");
  assert.doesNotMatch(login, /data-act="demo"|admin123|super123|demo123|admin@bbq/);
  assert.match(login, /autocomplete="current-password"/);
  assert.match(login, /data-form-error role="alert"/);
  const signup = ui.evaluate("authPageHTML('signup', new URLSearchParams('return=checkout'))");
  assert.match(signup, /name="return" value="checkout"/);
  assert.match(signup, /minlength="2" maxlength="120"/);
  assert.match(signup, /autocomplete="new-password"/);
  ui.evaluate('S.demoLogin = true');
  assert.match(ui.evaluate("authPageHTML('login', new URLSearchParams())"), /data-act="demo"/);
});

test('the owner account is protected in user management and password changes have a real form', () => {
  const ui = harness();
  ui.evaluate("ME = {id:'another-admin', name:'مدير', email:'manager@example.com', role:'admin'}; AD.users = [{id:'owner', name:'صاحب المطعم', email:'aliielramal@gmail.com', role:'admin', isOwner:true}]");
  const users = ui.evaluate('adminUsersHTML()');
  assert.match(users, /select data-act="user-role"[^>]*disabled/);
  assert.match(users, /data-act="user-active"[^>]*disabled/);
  const account = ui.evaluate('viewsAccount()');
  assert.match(account, /id="passwordForm"/);
  assert.match(account, /name="currentPassword"/);
  assert.match(account, /name="confirmPassword"/);
});

test('retry keys persist for a failed order, survive blocked storage, and allow a new identical order after success', async () => {
  for (const deniedStorage of [false, true]) {
    const ui = harness({ deniedStorage });
    ui.evaluate("ME = {id:'customer', role:'customer'}");
    const body = { items: [{ id: 'm1', qty: 1 }], customer: { address: 'private delivery address', phone: '01012345678' } };
    ui.context.body = body;
    const first = await ui.evaluate('orderRequestKey(body)');
    const again = await ui.evaluate('orderRequestKey(body)');
    assert.equal(first, again);
    assert.match(first, /^[a-zA-Z0-9_-]{8,128}$/);
    if (!deniedStorage) {
      assert.ok(!ui.saved.get('bbq_order_request').includes(body.customer.address));
      assert.ok(!ui.saved.get('bbq_order_request').includes(body.customer.phone));
    }
    ui.evaluate("pendingOrderRequest = null; try { localStorage.removeItem('bbq_order_request'); } catch {} ");
    assert.notEqual(await ui.evaluate('orderRequestKey(body)'), first);
  }
});

test('login on the already-open account route re-renders instead of leaving the login form behind', () => {
  const ui = harness({ hash: '#/account' });
  ui.evaluate("let redraws = 0; render = () => { redraws++; }; go('account')");
  assert.equal(ui.evaluate('redraws'), 1);
});

test('storage errors are visible rather than a fake empty order history', () => {
  const ui = harness();
  ui.evaluate("ME = {id:'customer', email:'customer@example.com', role:'customer'}; MY.error = 'قاعدة البيانات غير متاحة'; MY.orders = []");
  const orders = ui.evaluate('viewsOrders()');
  assert.match(orders, /قاعدة البيانات غير متاحة/);
  assert.match(orders, /data-act="refresh-orders"/);
  assert.doesNotMatch(orders, /مفيش طلبات لسه/);
});

test('live polling never discards unsaved admin forms or a focused order search', async () => {
  const ui = harness({ hash: '#/admin' });
  ui.evaluate(`ME = {id:'owner', role:'admin'}; AD.tab = 'settings'; let refreshes = 0;
    loadAdminLive = async () => true;
    api.req = async () => ({notifications:[]}); softRefreshAdmin = () => { refreshes++; };`);
  await ui.evaluate('refreshLiveState(true)');
  assert.equal(ui.evaluate('refreshes'), 0);
  ui.evaluate("AD.tab = 'orders'");
  ui.document.activeElement = { closest: () => ({}) };
  await ui.evaluate('refreshLiveState(true)');
  assert.equal(ui.evaluate('refreshes'), 0);
  ui.document.activeElement = null;
  await ui.evaluate('refreshLiveState(true)');
  assert.equal(ui.evaluate('refreshes'), 1);
});

test('loadAdminLive uses one combined endpoint and updates stats, orders and notifications', async () => {
  const ui = harness({ hash: '#/admin' });
  ui.evaluate(`ME = {id:'owner', role:'admin'}; NOTIFS = []; AD.orders = []; AD.stats = null;
    var liveCalls = [];
    api.req = async (path) => { liveCalls.push(path);
      return { notifications: [{ id: 'n1', read: false, silent: false, title: 'طلب جديد', body: 'x' }],
        stats: { today: { orders: 2 } }, orders: [{ id: 'BBQ-1', status: 'new' }], total: 1 }; }`);
  const changed = await ui.evaluate('loadAdminLive()');
  assert.equal(changed, true);
  assert.equal(ui.evaluate('liveCalls.length'), 1);
  assert.match(ui.evaluate('liveCalls[0]'), /^\/api\/admin\/live\?/);
  assert.equal(ui.evaluate('AD.orders[0].id'), 'BBQ-1');
  assert.equal(ui.evaluate('AD.stats.today.orders'), 2);
  assert.equal(ui.evaluate('NOTIFS[0].id'), 'n1');
  /* جولة بنفس البيانات → مفيش تغيير (التباطؤ التلقائي بيعتمد على ده) */
  assert.equal(await ui.evaluate('loadAdminLive()'), false);
  assert.equal(ui.evaluate('liveCalls.length'), 2);
});

test('rapid auto refreshes are coalesced within the minimum gap window', async () => {
  const ui = harness({ hash: '#/admin' });
  ui.evaluate(`ME = {id:'owner', role:'admin'}; AD.tab = 'dash';
    var liveRuns = 0; loadAdminLive = async () => { liveRuns++; return false; };`);
  await ui.evaluate('refreshLiveState(true)');
  const skipped = await ui.evaluate('refreshLiveState(false)');
  assert.equal(skipped, false);
  assert.equal(ui.evaluate('liveRuns'), 1);   /* النداء المتلاحق اتجاهله الـthrottle */
});

test('active order tracking keeps a steady fast cadence regardless of the idle backoff', () => {
  const ui = harness({ hash: '#/order/BBQ-1' });
  ui.evaluate(`ME = {id:'c1', role:'customer'}; S.realtime = false;
    realtimeStarted = true; es = null; unchangedRounds = 99; pollInterval = 0;
    MY.orders = [{ id: 'BBQ-1', status: 'preparing' }];
    syncPollInterval();`);
  assert.equal(ui.evaluate('activeTracking()'), true);
  assert.equal(ui.evaluate('pollInterval'), 5000);   /* تتبع نشط = ٥ ثوانٍ ثابتة، التباطؤ مُتجاهَل */

  /* نفس الإيقاع السريع من صفحة طلباتي */
  ui.evaluate(`location.hash = '#/my-orders'; syncPollInterval();`);
  assert.equal(ui.evaluate('pollInterval'), 5000);

  /* الطلب وصل لحالة نهائية → التتبع السريع يتوقف ويرجع للإيقاع البطيء */
  ui.evaluate(`MY.orders = [{ id: 'BBQ-1', status: 'delivered' }]; syncPollInterval();`);
  assert.equal(ui.evaluate('activeTracking()'), false);
  assert.equal(ui.evaluate('pollInterval'), 30000);

  /* مغادرة صفحات التتبع تمامًا → نبض بطيء حتى مع طلب نشط */
  ui.evaluate(`location.hash = '#/home'; MY.orders = [{ id: 'BBQ-2', status: 'new' }]; syncPollInterval();`);
  assert.equal(ui.evaluate('activeTracking()'), false);
  assert.equal(ui.evaluate('pollInterval'), 30000);

  /* قناة SSE الحية شغالة → الإيقاع يبقى شبكة الأمان البطيئة مهما كانت الصفحة */
  ui.evaluate(`location.hash = '#/order/BBQ-2'; es = {}; syncPollInterval();`);
  assert.equal(ui.evaluate('pollInterval'), 60000);
  ui.evaluate('es = null; realtimeStarted = false;');
});

test('syncPollInterval is a no-op before realtime starts (login/gate screens)', () => {
  const ui = harness({ hash: '#/order/BBQ-9' });
  ui.evaluate(`ME = {id:'c1', role:'customer'}; realtimeStarted = false; pollInterval = 0;
    MY.orders = [{ id: 'BBQ-9', status: 'new' }]; syncPollInterval();`);
  assert.equal(ui.evaluate('pollInterval'), 0);
});

test('account forms block duplicate submits and show an API failure without accepting a login', async () => {
  const ui = harness();
  const button = { disabled: false, textContent: 'إنشاء الحساب' };
  const error = { hidden: true, textContent: '' };
  const form = {
    dataset: {}, querySelector: (selector) => selector === '[data-form-error]' ? error : button,
    setAttribute() {}, removeAttribute() {},
  };
  ui.context.form = form;
  let finish;
  ui.context.work = () => new Promise((resolve) => { finish = resolve; });
  const running = ui.evaluate('submitAccountForm(form, work)');
  assert.equal(button.disabled, true);
  let duplicate = false;
  ui.context.duplicateWork = () => { duplicate = true; };
  await ui.evaluate('submitAccountForm(form, duplicateWork)');
  assert.equal(duplicate, false);
  finish(); await running;
  assert.equal(button.disabled, false);
  ui.context.failedWork = () => { throw new Error('تعذر حفظ الحساب'); };
  await ui.evaluate('submitAccountForm(form, failedWork)');
  assert.equal(error.hidden, false); assert.equal(error.textContent, 'تعذر حفظ الحساب');
  assert.equal(button.textContent, 'إنشاء الحساب'); assert.equal(ui.evaluate('ME'), null);
});

test('an in-flight history response cannot overwrite the next logged-in customer’s orders', async () => {
  const ui = harness();
  let finish;
  ui.context.delayedRequest = () => new Promise((resolve) => { finish = resolve; });
  ui.evaluate("ME = {id:'old-customer', role:'customer'}; api.req = delayedRequest");
  const loading = ui.evaluate('loadMyOrders(true)');
  ui.evaluate("ME = {id:'new-customer', role:'customer'}; MY.orders = [{id:'new-order'}]");
  finish({ orders: [{ id: 'old-private-order' }] });
  await loading;
  assert.equal(ui.evaluate('MY.orders[0].id'), 'new-order');
});

test('setup lockout renders the hosting-fix guide, not the misleading offline page', async () => {
  const ui = harness({ hash: '#/setup' });
  assert.equal(ui.evaluate("isSetupError({ code: 'STORAGE_UNAVAILABLE' })"), true);
  assert.equal(ui.evaluate("isSetupError({ code: 'OWNER_NOT_CONFIGURED' })"), true);
  assert.equal(ui.evaluate("isSetupError({ status: 500 })"), false);

  ui.evaluate(`lastSetupError = { code: 'STORAGE_UNAVAILABLE',
    detail: 'السبب: قاعدة البيانات الدائمة (Upstash Redis) مش متوصلة',
    setup: { serverless: true, storage: 'redis', missing: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'APP_URL'], invalid: [] } };`);
  await ui.evaluate('render()');
  assert.match(ui.view.innerHTML, /إعدادات الاستضافة ناقصة/);
  assert.match(ui.view.innerHTML, /upstash\.com/);
  assert.match(ui.view.innerHTML, /UPSTASH_REDIS_REST_URL/);
  assert.match(ui.view.innerHTML, /Redeploy/);
  assert.match(ui.view.innerHTML, /لو أنت عميل/);                       // طمأنة العميل
  assert.doesNotMatch(ui.view.innerHTML, /مش قادرين نوصل للمطعم/);        // مش صفحة التضليل

  ui.evaluate(`lastSetupError = { code: 'OWNER_NOT_CONFIGURED', detail: 'السبب: حساب صاحب المطعم مش مجهّز',
    setup: { serverless: true, storage: 'redis', missing: ['ADMIN_PASSWORD'], invalid: ['APP_URL'] } };`);
  const html = ui.evaluate('setupPageHTML()');
  assert.match(html, /ADMIN_PASSWORD/);
  assert.match(html, /Settings → Environment Variables/);
  assert.match(html, /قيم محتاجة تصحيح: <code dir="ltr">APP_URL<\/code>/);

  /* التوصية الحالية Supabase: لو الناقص مفاتيح Supabase الخطوات بتوجّه لـ supabase.com */
  ui.evaluate(`lastSetupError = { code: 'STORAGE_UNAVAILABLE',
    detail: 'السبب: قاعدة البيانات الدائمة (Supabase PostgreSQL) مش متوصلة',
    setup: { serverless: true, storage: 'postgres', missing: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], invalid: [] } };`);
  const html2 = ui.evaluate('setupPageHTML()');
  assert.match(html2, /supabase\.com/);
  assert.match(html2, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(html2, /0001_init\.sql/);
  assert.doesNotMatch(html2, /upstash\.com/);          // خطوات القاعدة الفعلية بس
});
