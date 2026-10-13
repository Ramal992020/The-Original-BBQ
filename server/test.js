/* ============================================================================
   test.js — اختبار شامل للـAPI والصلاحيات
   التشغيل:  npm test
   بيشتغل على بيانات مؤقتة (مش بيلمس بياناتك الحقيقية)
   ========================================================================== */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

/* بيانات مؤقتة للاختبار */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bbq-test-'));
process.env.BBQ_DATA_DIR = path.join(TMP, 'data');
process.env.BBQ_UPLOAD_DIR = path.join(TMP, 'uploads');

const { server } = require('./index');

let BASE = '';
let pass = 0, fail = 0;
const results = [];

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
  results.push({ name, ok: !!cond });
}

async function req(method, url, { token, body, raw, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.authorization = 'Bearer ' + token;
  let payload;
  if (raw) payload = raw;
  else if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + url, { method, headers: h, body: payload });
  let data = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;

  console.log('\n🔎 اختبار الباك إند والصلاحيات — ' + BASE + '\n');

  /* ---------------------------- 1) الأساسيات ---------------------------- */
  console.log('【 الأساسيات 】');
  let r = await req('GET', '/api/health');
  check('السيرفر شغال', r.status === 200 && r.data.ok);

  r = await req('GET', '/api/bootstrap');
  check('البيانات الأولية بتوصل', r.status === 200 && r.data.menu.length === 50, 'منيو=' + (r.data.menu || []).length);
  check('التصنيفات ٨', r.data.categories.length === 8);
  check('الحالات ٦ (طلب جديد → ملغي)', r.data.settings.statuses.length === 6);
  check('كل صنف مستورد له صورة', r.data.menu.every((m) => !!m.image));
  check('الصور مولّدة/من المكتبة للأصناف المستوردة', r.data.menu.every((m) => ['ai', 'pool', 'placeholder'].includes(m.imageSource)), [...new Set(r.data.menu.map((m) => m.imageSource))].join(','));

  /* ---------------------------- 2) الحسابات ---------------------------- */
  console.log('\n【 الحسابات والأدوار 】');
  const admin = (await req('POST', '/api/auth/login', { body: { email: 'admin@bbq.app', password: 'admin123' } })).data;
  const sup = (await req('POST', '/api/auth/login', { body: { email: 'supervisor@bbq.app', password: 'super123' } })).data;
  const cust = (await req('POST', '/api/auth/login', { body: { email: 'demo@bbq.app', password: 'demo123' } })).data;
  check('دخول الأدمن', !!admin.token && admin.user.role === 'admin');
  check('دخول المشرف', !!sup.token && sup.user.role === 'supervisor');
  check('دخول العميل', !!cust.token && cust.user.role === 'customer');

  const badLogin = await req('POST', '/api/auth/login', { body: { email: 'admin@bbq.app', password: 'wrong' } });
  check('كلمة سر غلط مرفوضة (401)', badLogin.status === 401);

  const newUser = await req('POST', '/api/auth/signup', { body: { name: 'مستخدم جديد', email: 'new@bbq.app', password: 'secret123', phone: '01099998888' } });
  check('تسجيل حساب جديد ينجح', newUser.status === 201);
  check('أي مستخدم جديد = Customer تلقائيًا', newUser.data.user.role === 'customer');
  const newTok = newUser.data.token;

  const dup = await req('POST', '/api/auth/signup', { body: { name: 'x', email: 'new@bbq.app', password: 'secret123' } });
  check('إيميل مكرر مرفوض (409)', dup.status === 409);

  /* ---------------------------- 3) صلاحيات الإدارة ---------------------------- */
  console.log('\n【 حماية الصلاحيات على السيرفر 】');
  let g = await req('GET', '/api/admin/orders', { token: cust.token });
  check('عميل لا يفتح طلبات الإدارة (403)', g.status === 403, 'status=' + g.status);
  g = await req('GET', '/api/admin/stats', { token: cust.token });
  check('عميل لا يفتح الإحصائيات (403)', g.status === 403);
  g = await req('GET', '/api/admin/users', { token: cust.token });
  check('عميل لا يفتح المستخدمين (403)', g.status === 403);
  g = await req('POST', '/api/admin/menu', { token: cust.token, body: { name: 'hack', price: 1 } });
  check('عميل لا يضيف أصناف (403)', g.status === 403);
  g = await req('PATCH', '/api/admin/orders/BBQ-1001/status', { token: cust.token, body: { status: 'delivered' } });
  check('عميل لا يغيّر حالة طلب (403)', g.status === 403);
  g = await req('GET', '/api/admin/orders');
  check('بدون تسجيل دخول = 401', g.status === 401);

  g = await req('GET', '/api/admin/orders', { token: sup.token });
  check('المشرف يشوف كل الطلبات', g.status === 200);
  g = await req('GET', '/api/admin/users', { token: sup.token });
  check('المشرف لا يدير المستخدمين (403)', g.status === 403);
  g = await req('POST', '/api/admin/menu', { token: sup.token, body: { name: 'x', price: 1 } });
  check('المشرف لا يدير المنيو (403)', g.status === 403);
  g = await req('PATCH', '/api/admin/settings', { token: sup.token, body: { name: 'x' } });
  check('المشرف لا يعدّل الإعدادات (403)', g.status === 403);
  g = await req('GET', '/api/admin/users', { token: admin.token });
  check('الأدمن يدير المستخدمين', g.status === 200 && g.data.users.length >= 4);

  /* ---------------------------- 4) إنشاء طلب ---------------------------- */
  console.log('\n【 الطلبات و Order Items 】');
  const menu = (await req('GET', '/api/bootstrap')).data.menu;
  const item = menu.find((m) => m.id === 'm1');       // ميكس جريل 240
  const fries = menu.find((m) => m.id === 'f6');      // لوديد فرايز 120

  const orderRes = await req('POST', '/api/orders', {
    token: cust.token,
    body: {
      items: [{ id: item.id, qty: 2, addons: [{ name: 'زيادة أرز', price: 20 }], note: 'حار شوية' }, { id: fries.id, qty: 1 }],
      customer: { name: 'عميل تجريبي', phone: '01012345678', area: 'المعادي', address: 'شارع 9 عمارة 5', notes: 'من غير شطة', time: 'في أقرب وقت' },
      payment: 'cash',
    },
  });
  check('العميل يقدر يعمل طلب', orderRes.status === 201, JSON.stringify(orderRes.data).slice(0, 120));
  const order = orderRes.data.order;
  check('رقم الطلب بصيغة BBQ-xxxx', /^BBQ-\d+$/.test(order.id));
  check('الحالة الأولى = طلب جديد (new)', order.status === 'new');
  check('الطلب مربوط بالمستخدم المسجل', order.user_id === cust.user.id);
  const expected = (240 + 20) * 2 + 120;    // 640 — وتوصيل مجاني لأن المبلغ فوق 300
  check('السيرفر حسب الإجمالي صح (مع الإضافات + توصيل مجاني فوق 300)', order.subtotal === expected && order.delivery === 0 && order.total === expected,
    `subtotal=${order.subtotal} delivery=${order.delivery} total=${order.total}`);
  check('Order Items مسجلة بالكمية والسعر والإجمالي', orderRes.data.items.length === 2 && orderRes.data.items[0].qty === 2 && orderRes.data.items[0].line_total === 520,
    JSON.stringify(orderRes.data.items[0] || {}));
  check('الإضافات محسوبة بسعر السيرفر', order.items[0].addons.length === 1 && order.items[0].addons[0].price === 20, JSON.stringify(order.items[0].addons));

  /* محاولة تلاعب بسعر الإضافة */
  const cheatAddon = await req('POST', '/api/orders', {
    token: cust.token,
    body: { items: [{ id: 'm1', qty: 1, addons: [{ name: 'زيادة أرز', price: -5000 }] }], customer: { name: 'غش إضافات', phone: '01012345678', address: 'عنوان طويل شوية' }, payment: 'cash' },
  });
  check('التلاعب بسعر الإضافة لا يعمل', cheatAddon.status === 201 && cheatAddon.data.order.items[0].addons[0].price === 20, JSON.stringify(cheatAddon.data.order?.items?.[0]?.addons));
  check('سعر الصنف جاي من السيرفر مش من العميل', order.items[0].price === 240);

  /* محاولة تلاعب بالسعر من العميل */
  const cheat = await req('POST', '/api/orders', {
    token: cust.token,
    body: { items: [{ id: 'm1', qty: 1, price: 1 }], customer: { name: 'غش', phone: '01012345678', address: 'عنوان طويل شوية' }, payment: 'cash' },
  });
  check('التلاعب بالسعر لا يعمل (السيرفر بيتجاهله)', cheat.status === 201 && cheat.data.order.total === 260, 'total=' + (cheat.data.order && cheat.data.order.total));

  const emptyOrder = await req('POST', '/api/orders', { token: cust.token, body: { items: [], customer: { name: 'x', phone: '01012345678', address: 'yyyyyy' } } });
  check('سلة فاضية = 400', emptyOrder.status === 400);

  const guestOrder = await req('POST', '/api/orders', { body: { items: [{ id: 'm1', qty: 1 }], customer: { name: 'x', phone: '01012345678', address: 'yyyyyy' } } });
  check('الطلب لازم تسجيل دخول (401)', guestOrder.status === 401);

  /* طلبات المستخدم الحالي فقط */
  const mine = await req('GET', '/api/orders/mine', { token: cust.token });
  check('طلباتي بترجع طلباتي بس', mine.data.orders.length === 3 && mine.data.orders.every((o) => o.user_id === cust.user.id));

  const otherMine = await req('GET', '/api/orders/mine', { token: newTok });
  check('مستخدم تاني عنده طلبات صفر', otherMine.data.orders.length === 0);

  const spy = await req('GET', '/api/orders/' + order.id, { token: newTok });
  check('مستخدم تاني لا يفتح تفاصيل طلبي (403)', spy.status === 403);

  const staffView = await req('GET', '/api/orders/' + order.id, { token: sup.token });
  check('المشرف يقدر يفتح تفاصيل الطلب', staffView.status === 200 && staffView.data.items.length === 2);

  /* ---------------------------- 5) الإشعارات ---------------------------- */
  console.log('\n【 الإشعارات 】');
  const notifAdmin = await req('GET', '/api/notifications', { token: admin.token });
  const notifSup = await req('GET', '/api/notifications', { token: sup.token });
  const notifCust = await req('GET', '/api/notifications', { token: cust.token });
  const n0 = notifAdmin.data.notifications.find((n) => n.orderId === order.id);
  check('وصل إشعار للأدمن عند الطلب الجديد', notifAdmin.data.notifications.length >= 1);
  check('وصل إشعار للمشرف كذلك', notifSup.data.notifications.length >= 1);
  check('العميل مش بياخد إشعار إدارة', notifCust.data.notifications.length === 0);
  check('الإشعار فيه رقم الطلب واسم العميل والإجمالي', !!n0 && n0.orderId === order.id && n0.body.includes('عميل تجريبي') && n0.body.includes('640'),
    n0 ? n0.body : '');
  const readOne = await req('POST', '/api/notifications/read', { token: admin.token, body: { id: n0.id } });
  const afterRead = await req('GET', '/api/notifications', { token: admin.token });
  check('تعليم الإشعار كمقروء', readOne.status === 200 && afterRead.data.notifications.find((x) => x.id === n0.id).read === true);

  /* ---------------------------- 6) تغيير الحالة ---------------------------- */
  console.log('\n【 تغيير حالة الطلب 】');
  const statusFlow = ['received', 'preparing', 'on_way', 'delivered'];
  let flowOK = true, lastStatus = '';
  for (const st of statusFlow) {
    const res = await req('PATCH', '/api/admin/orders/' + order.id + '/status', { token: sup.token, body: { status: st } });
    if (res.status !== 200 || res.data.order.status !== st) flowOK = false;
    lastStatus = res.data.order.status;
  }
  check('المشرف يعدّل الحالة خطوة بخطوة لآخر مرحلة', flowOK && lastStatus === 'delivered');
  const afterStatus = await req('GET', '/api/orders/mine', { token: cust.token });
  check('العميل بيشوف التحديث في طلباته فورًا', afterStatus.data.orders.find((o) => o.id === order.id).status === 'delivered');
  check('سجل الحالة محفوظ (Timeline)', (afterStatus.data.orders.find((o) => o.id === order.id).history || []).length === 5);

  const badStatus = await req('PATCH', '/api/admin/orders/' + order.id + '/status', { token: sup.token, body: { status: 'nonsense' } });
  check('حالة غير معروفة مرفوضة', badStatus.status === 400);

  /* إلغاء طلب من العميل */
  const o2 = (await req('POST', '/api/orders', { token: newTok, body: { items: [{ id: 's2', qty: 1 }], customer: { name: 'عميل ٢', phone: '01111111111', address: 'شارع طوويل شوية' }, payment: 'cash' } })).data.order;
  const cancel = await req('POST', '/api/orders/' + o2.id + '/cancel', { token: newTok });
  check('العميل يقدر يلغي طلبه (وطلبه بس)', cancel.status === 200 && cancel.data.order.status === 'cancelled');
  const cancelOther = await req('POST', '/api/orders/' + o2.id + '/cancel', { token: cust.token });
  check('عميل تاني لا يقدر يلغي طلب غيره', cancelOther.status === 403);

  /* ---------------------------- 7) لوحة الإدارة ---------------------------- */
  console.log('\n【 لوحة الإدارة 】');
  const stats = await req('GET', '/api/admin/stats', { token: sup.token });
  check('إحصائيات اليوم (طلبات + مبيعات + عدّاد لكل حالة)', stats.status === 200 && stats.data.today.orders >= 4 && stats.data.today.sales > 0, 'orders=' + (stats.data.today || {}).orders);
  check('عدّاد الحالات موجود', ['new', 'received', 'preparing', 'on_way', 'delivered', 'cancelled'].every((k) => k in stats.data.today.counts));

  const filtered = await req('GET', '/api/admin/orders?status=delivered', { token: sup.token });
  check('فلترة بالحالة', filtered.data.orders.every((o) => o.status === 'delivered') && filtered.data.orders.length >= 1);

  const search = await req('GET', '/api/admin/orders?q=' + encodeURIComponent('01012345678'), { token: sup.token });
  check('بحث بالهاتف', search.data.orders.length >= 1);

  const searchId = await req('GET', '/api/admin/orders?q=' + order.id, { token: sup.token });
  check('بحث برقم الطلب', searchId.data.orders.length === 1 && searchId.data.orders[0].id === order.id);

  const customers = await req('GET', '/api/admin/customers', { token: sup.token });
  check('صفحة بيانات العملاء', customers.status === 200 && customers.data.customers.length >= 2 && 'total' in customers.data.customers[0]);

  /* ---------------------------- 8) إدارة المنيو والصور ---------------------------- */
  console.log('\n【 إدارة المنيو والصور 】');
  const newItem = await req('POST', '/api/admin/menu', { token: admin.token, body: { name: 'برجر تجريبي جديد', desc: 'برجر لحم مشوي على الفحم بصوص خاص', price: 175, cat: 'charcoal' } });
  check('الأدمن يضيف صنف جديد', newItem.status === 201);
  check('الصنف الجديد اتولّدت له صورة تلقائيًا', !!newItem.data.item.image && ['ai', 'pool', 'placeholder'].includes(newItem.data.item.imageSource), newItem.data.item.image + ' / ' + newItem.data.item.imageSource);
  const newId = newItem.data.item.id;

  const patched = await req('PATCH', '/api/admin/menu/' + newId, { token: admin.token, body: { price: 199, featured: true } });
  check('الأدمن يعدّل صنف', patched.status === 200 && patched.data.item.price === 199 && patched.data.item.featured === true);

  const genOne = await req('POST', '/api/admin/menu/' + newId + '/generate-image', { token: admin.token });
  check('توليد صورة بالذكاء الاصطناعي لصنف', genOne.status === 200 && !!genOne.data.item.image);

  const genAll = await req('POST', '/api/admin/menu/generate-images', { token: admin.token, body: { only: 'all' } });
  check('توليد جماعي للأصناف المستوردة', genAll.status === 200 && genAll.data.generated >= 50, 'generated=' + genAll.data.generated);

  /* رفع صورة يدويًا (multipart) */
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const boundary = '----bbqtest' + Date.now();
  const parts = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`),
    png, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const upload = await req('POST', '/api/admin/menu/' + newId + '/image', {
    token: admin.token, raw: parts, headers: { 'content-type': 'multipart/form-data; boundary=' + boundary },
  });
  check('رفع صورة يدويًا للصنف', upload.status === 200 && upload.data.item.image.startsWith('/uploads/'), JSON.stringify(upload.data).slice(0, 150));
  check('مصدر الصورة بقى "upload"', upload.data.item.imageSource === 'upload');

  const fetchedImg = await fetch(BASE + upload.data.item.image);
  check('الصورة المرفوعة بتتقدم من السيرفر', fetchedImg.status === 200 && (fetchedImg.headers.get('content-type') || '').includes('image'));

  const libPick = await req('PATCH', '/api/admin/menu/' + newId, { token: admin.token, body: { image: '/img/ai-fries.jpg' } });
  check('تغيير الصورة لصورة من المكتبة', libPick.data.item.image === '/img/ai-fries.jpg');

  const badUrl = await req('POST', '/api/admin/menu/' + newId + '/image', { token: admin.token, body: { url: 'javascript:alert(1)' } });
  check('رفض رابط صورة غير آمن', badUrl.status === 400);

  const del = await req('DELETE', '/api/admin/menu/' + newId, { token: admin.token });
  const afterDel = (await req('GET', '/api/bootstrap')).data.menu.length;
  check('الأدمن يحذف صنف', del.status === 200 && afterDel === 50);

  /* ---------------------------- 9) إدارة المستخدمين ---------------------------- */
  console.log('\n【 إدارة المستخدمين 】');
  const users = await req('GET', '/api/admin/users', { token: admin.token });
  const target = users.data.users.find((x) => x.email === 'new@bbq.app');
  const promote = await req('PATCH', '/api/admin/users/' + target.id, { token: admin.token, body: { role: 'supervisor' } });
  check('ترقية عميل إلى Supervisor', promote.status === 200 && promote.data.user.role === 'supervisor');

  const promotedLogin = await req('POST', '/api/auth/login', { body: { email: 'new@bbq.app', password: 'secret123' } });
  const promotedAdmin = await req('GET', '/api/admin/orders', { token: promotedLogin.data.token });
  check('المشرف الجديد يقدر يفتح لوحة الطلبات', promotedAdmin.status === 200);

  const demote = await req('PATCH', '/api/admin/users/' + target.id, { token: admin.token, body: { role: 'customer' } });
  check('إرجاعه Customer', demote.data.user.role === 'customer');

  const deactivate = await req('PATCH', '/api/admin/users/' + target.id, { token: admin.token, body: { active: false } });
  check('تعطيل حساب', deactivate.data.user.active === false);
  const disabledLogin = await req('POST', '/api/auth/login', { body: { email: 'new@bbq.app', password: 'secret123' } });
  check('الحساب المعطّل مايقدرش يسجّل دخول (403)', disabledLogin.status === 403);
  const oldToken = await req('GET', '/api/admin/orders', { token: promotedLogin.data.token });
  check('جلسات الحساب المعطّل اتقفلت', oldToken.status === 401);

  const selfDemote = await req('PATCH', '/api/admin/users/' + admin.user.id, { token: admin.token, body: { role: 'customer' } });
  check('الأدمن مايقدرش يشيل صلاحيته هو', selfDemote.status === 400);

  const badRole = await req('PATCH', '/api/admin/users/' + target.id, { token: admin.token, body: { role: 'superuser' } });
  check('Role غير معروف مرفوض', badRole.status === 400);

  /* ---------------------------- 10) الإعدادات × الإشعارات ---------------------------- */
  console.log('\n【 الإعدادات واستعادة كلمة السر 】');
  const setRes = await req('PATCH', '/api/admin/settings', { token: admin.token, body: { deliveryFee: 25, phone: '01055556666' } });
  check('الأدمن يعدّل الإعدادات', setRes.status === 200 && setRes.data.settings.deliveryFee === 25);
  const boot2 = await req('GET', '/api/bootstrap');
  check('الإعدادات الجديدة ظاهرة للعميل فورًا', boot2.data.settings.deliveryFee === 25 && boot2.data.settings.phone === '01055556666');

  const forgot = await req('POST', '/api/auth/forgot', { body: { email: 'demo@bbq.app' } });
  check('طلب استعادة كلمة السر', forgot.status === 200);
  const { all } = require('./store');
  const rtoken = all('password_reset_tokens').slice(-1)[0];
  const resetRes = await req('POST', '/api/auth/reset', { body: { token: rtoken.token, password: 'newpass123' } });
  check('تعيين كلمة سر جديدة بالتوكن', resetRes.status === 200);
  const newLogin = await req('POST', '/api/auth/login', { body: { email: 'demo@bbq.app', password: 'newpass123' } });
  check('الدخول بكلمة السر الجديدة', newLogin.status === 200);
  const oldLogin = await req('POST', '/api/auth/login', { body: { email: 'demo@bbq.app', password: 'demo123' } });
  check('كلمة السر القديمة بقت مرفوضة', oldLogin.status === 401);

  /* ---------------------------- 11) إشعارات واتساب ---------------------------- */
  console.log('\n【 إشعارات واتساب 】');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wa = require('./whatsapp');
  const pay = require('./payments');

  /* ملحوظة: اختبار استعادة كلمة السر فوق بيقفل جلسات demo@bbq.app وبعده الحساب التجريبي
     اتعطّل — فهنشتغل بحسابات جديدة نظيفة للأقسام الجاية. */
  const waCustRes = await req('POST', '/api/auth/signup', { body: { name: 'عميل واتساب', email: 'wacust@bbq.app', password: 'wacust123', phone: '01055566677' } });
  const payCustRes = await req('POST', '/api/auth/signup', { body: { name: 'عميل دفع', email: 'paycust@bbq.app', password: 'paycust123', phone: '01099988877' } });
  const waCust = waCustRes.data;
  const payCust = payCustRes.data;
  check('حسابات تجريبية جديدة اتcreated', !!waCust.token && !!payCust.token && waCust.user.role === 'customer');

  check('تطبيع الأرقام المصرية (01… → 201…)', wa.normalizePhone('01012345678') === '201012345678', wa.normalizePhone('01012345678'));
  check('تطبيع رقم دولي', wa.normalizePhone('+20 101 234 5678') === '201012345678');
  check('تطبيع رقم يبدأ بـ 00', wa.normalizePhone('00201012345678') === '201012345678');

  const waCfgBefore = await req('GET', '/api/admin/whatsapp', { token: sup.token });
  check('المشرف لا يفتح إعدادات الواتساب (403)', waCfgBefore.status === 403);

  let waCfg = await req('GET', '/api/admin/whatsapp', { token: admin.token });
  check('الأدمن يشوف إعدادات الواتساب والقوالب الافتراضية', waCfg.status === 200 && !!waCfg.data.templates.new && !!waCfg.data.templates.paid);

  await req('PATCH', '/api/admin/whatsapp', {
    token: admin.token,
    body: { enabled: true, provider: 'console', staffEnabled: true, staffNumbers: ['201000000001'], requireOptIn: true,
            notifyOn: { new: true, received: true, preparing: true, on_way: true, delivered: true, cancelled: true, paid: true },
            templates: { preparing: 'يا {name} — طلبك {order} على الفحم دلوقتي 🔥 ({total})' } },
  });
  waCfg = await req('GET', '/api/admin/whatsapp', { token: admin.token });
  check('حفظ إعدادات الواتساب (أرقام المطعم + قالب مخصص)', waCfg.data.config.staffEnabled === true && waCfg.data.config.staffNumbers[0] === '201000000001' && waCfg.data.templates.preparing.includes('على الفحم'));

  /* طلب جديد → رسالة تأكيد للعميل + إشعار للمطعم */
  const waOrder = (await req('POST', '/api/orders', {
    token: waCust.token,
    body: { items: [{ id: 'm3', qty: 1 }], customer: { name: 'أم واتساب', phone: '01555111222', area: 'الدقي', address: 'شارع التحرير 7، الدور 3' }, payment: 'cash' },
  })).data.order;
  await sleep(200);
  let logRes = await req('GET', '/api/admin/whatsapp/log', { token: admin.token });
  const waLog = logRes.data.log;
  check('رسالة تأكيد الطلب اتسجلت للعميل', waLog.some((x) => x.orderId === waOrder.id && x.type === 'status:new' && x.to === '201555111222'),
    JSON.stringify(waLog.slice(0, 3).map((x) => [x.type, x.to, x.result])));
  check('إشعار المطعم بطلب جديد وصل على واتساب', waLog.some((x) => x.orderId === waOrder.id && x.type === 'staff_new' && x.to === '201000000001'));
  check('الرسالة فيها رقم الطلب واسم العميل', waLog.some((x) => x.orderId === waOrder.id && x.message.includes(waOrder.id) && x.message.includes('أم واتساب')));

  /* تغيير الحالة → رسالة بالقالب المخصص */
  await req('PATCH', '/api/admin/orders/' + waOrder.id + '/status', { token: sup.token, body: { status: 'preparing' } });
  await sleep(200);
  logRes = await req('GET', '/api/admin/whatsapp/log', { token: admin.token });
  const prepMsg = logRes.data.log.find((x) => x.orderId === waOrder.id && x.type === 'status:preparing');
  check('رسالة تغيير الحالة بالقالب المخصص + المتغيرات اتملت', !!prepMsg && prepMsg.message.includes('على الفحم دلوقتي') && prepMsg.message.includes(waOrder.id) && !prepMsg.message.includes('{'), prepMsg ? prepMsg.message : '');

  /* العميل اللي موقف الإشعارات */
  const noOpt = (await req('POST', '/api/orders', {
    token: waCust.token,
    body: { items: [{ id: 'f2', qty: 2 }], customer: { name: 'مش موافق', phone: '01222223333', area: 'فيصل', address: 'شارع العشرين 12' }, payment: 'cash', notifyWhatsapp: false },
  })).data.order;
  await sleep(200);
  logRes = await req('GET', '/api/admin/whatsapp/log', { token: admin.token });
  const optRows = logRes.data.log.filter((x) => x.orderId === noOpt.id && x.type === 'status:new');
  check('مفيش رسالة للعميل لما يوقف التحديثات', optRows.length === 1 && optRows[0].result === 'skipped', JSON.stringify(optRows));

  /* مزوّد الرابط (من غير API) */
  await req('PATCH', '/api/admin/whatsapp', { token: admin.token, body: { provider: 'link' } });
  const linkOrder = (await req('POST', '/api/orders', {
    token: waCust.token,
    body: { items: [{ id: 'f4', qty: 1 }], customer: { name: 'عميل رابط', phone: '01099998877', area: 'شبرا', address: 'شارع الترعة البولاقية 3' }, payment: 'cash' },
  })).data.order;
  await sleep(200);
  logRes = await req('GET', '/api/admin/whatsapp/log', { token: admin.token });
  const linkRow = logRes.data.log.find((x) => x.orderId === linkOrder.id && x.type === 'status:new');
  check('وضع الرابط: بيجهّز رابط wa.me جاهز', !!linkRow && linkRow.result === 'link' && linkRow.link.startsWith('https://wa.me/201099998877'),
    linkRow ? linkRow.result + ' ' + String(linkRow.link).slice(0, 40) : '');

  const waTest = await req('POST', '/api/admin/whatsapp/test', { token: admin.token, body: { phone: '01000000000' } });
  check('إرسال رسالة تجربة', waTest.status === 200 && !!waTest.data.row);

  const waBadTest = await req('POST', '/api/admin/whatsapp/test', { token: sup.token, body: { phone: '01000000000' } });
  check('المشرف مايعملش اختبار واتساب (403)', waBadTest.status === 403);
  await req('PATCH', '/api/admin/whatsapp', { token: admin.token, body: { provider: 'console' } });

  /* ---------------------------- 12) الدفع أونلاين ---------------------------- */
  console.log('\n【 الدفع أونلاين 】');
  let payCfg = await req('GET', '/api/admin/payments', { token: admin.token });
  check('إعدادات الدفع الافتراضية = محاكاة (demo)', payCfg.data.config.provider === 'demo' && payCfg.data.config.currency === 'EGP');
  const supPay = await req('GET', '/api/admin/payments', { token: sup.token });
  check('المشرف لا يفتح إعدادات الدفع (403)', supPay.status === 403);

  const savedPay = await req('PATCH', '/api/admin/payments', {
    token: admin.token,
    body: { provider: 'demo', currency: 'EGP',
      methods: [{ id: 'cash', label: 'نقدًا عند التوصيل', kind: 'cod', enabled: true },
                { id: 'online', label: 'دفع أونلاين (بطاقة/محفظة)', kind: 'online', enabled: true, note: 'رابط دفع آمن' }] },
  });
  check('حفظ إعدادات الدفع + طرق الدفع', savedPay.status === 200);
  const bootPay = await req('GET', '/api/bootstrap');
  check('العميل بيشوف طرق الدفع (من غير أي مفاتيح)', bootPay.data.settings.payments.length === 2 && bootPay.data.settings.onlinePayment.enabled === true);
  check('مفيش أي مفاتيح دفع في البيانات العامة', !JSON.stringify(bootPay.data).includes('secretKey') && !JSON.stringify(bootPay.data).includes('apiKey'));

  /* طلب بدفع أونلاين */
  const onlineOrderRes = await req('POST', '/api/orders', {
    token: payCust.token,
    body: { items: [{ id: 'c1', qty: 1 }, { id: 'f6', qty: 1 }], customer: { name: 'عميل دفع', phone: '01144445555', area: 'مصر الجديدة', address: 'شارع الحجاز 22 برج A' }, payment: 'online' },
  });
  check('طلب أونلاين: رجع رابط دفع + required', onlineOrderRes.status === 201 && onlineOrderRes.data.payment.required === true && !!onlineOrderRes.data.payment.url, JSON.stringify(onlineOrderRes.data.payment || {}));
  const oOnline = onlineOrderRes.data.order;
  check('حالة الدفع = pending لحد ما يدفع', oOnline.payment_status === 'pending');
  const demoUrl = new URL('http://x' + onlineOrderRes.data.payment.url);
  const refT = demoUrl.searchParams.get('t');
  check('رابط الدفع جاي من السيرفر (مش من المتصفح)', onlineOrderRes.data.payment.url.startsWith('/pay.html?ref=BBQ-'));

  const infoOK = await req('GET', '/api/payments/demo/info?ref=' + oOnline.id + '&t=' + refT);
  check('صفحة الدفع بتقرا الطلب بتوكن صحيح', infoOK.status === 200 && infoOK.data.order.total === oOnline.total);
  const infoBad = await req('GET', '/api/payments/demo/info?ref=' + oOnline.id + '&t=wrongtoken');
  check('توكن غلط = ممنوع', infoBad.status === 404);

  const donePay = await req('POST', '/api/payments/demo/complete', { body: { ref: oOnline.id, token: refT, ok: true } });
  check('إتمام الدفع (محاكاة نجاح)', donePay.status === 200 && donePay.data.status === 'paid');
  const afterPay = await req('GET', '/api/orders/mine', { token: payCust.token });
  const paidOrder = afterPay.data.orders.find((o) => o.id === oOnline.id);
  check('الطلب بقى مدفوع ومسجّل وقت الدفع', paidOrder.payment_status === 'paid' && !!paidOrder.paidAt);
  await sleep(200);
  logRes = await req('GET', '/api/admin/whatsapp/log', { token: admin.token });
  check('وصل رسالة واتساب تأكيد الدفع للعميل', logRes.data.log.some((x) => x.orderId === oOnline.id && x.type === 'paid'));
  const notifsPay = await req('GET', '/api/notifications', { token: admin.token });
  check('إشعار للإدارة بتم الدفع', notifsPay.data.notifications.some((n) => n.type === 'payment_paid' && n.orderId === oOnline.id));

  const statsPay = await req('GET', '/api/admin/stats', { token: admin.token });
  check('إحصائيات الدفع (مبيعات محصّلة + عدّادات)', statsPay.data.today.paidOrders >= 1 && statsPay.data.today.paidSales > 0 && statsPay.data.today.payCounts.paid >= 1);

  const verifyAfter = await req('POST', '/api/orders/' + oOnline.id + '/verify', { token: payCust.token });
  check('التحقق بعد الدفع بيرجّع paid', verifyAfter.data.status === 'paid' && verifyAfter.data.order.payment_status === 'paid');

  const payFilter = await req('GET', '/api/admin/orders?payment=paid', { token: sup.token });
  check('فلترة الطلبات بحالة الدفع', payFilter.data.orders.length >= 1 && payFilter.data.orders.every((o) => o.payment_status === 'paid'));

  const newLink = await req('POST', '/api/orders/' + waOrder.id + '/pay', { token: waCust.token });
  check('توليد رابط دفع لطلب موجود (من عند العميل)', newLink.status === 200 && String(newLink.data.url).includes('/pay.html'));
  const otherPay = await req('POST', '/api/orders/' + oOnline.id + '/pay', { token: waCust.token });
  check('مستخدم تاني مايعملش رابط دفع لطلب غيره (403)', otherPay.status === 403, 'status=' + otherPay.status);

  /* فشل الدفع */
  const failLink = (await req('POST', '/api/orders/' + waOrder.id + '/pay', { token: waCust.token })).data;
  const failT = new URL('http://x' + failLink.url).searchParams.get('t');
  const failedPay = await req('POST', '/api/payments/demo/complete', { body: { ref: waOrder.id, token: failT, ok: false } });
  check('محاكاة فشل الدفع', failedPay.data.status === 'failed');
  const afterFail = (await req('GET', '/api/orders/mine', { token: waCust.token })).data.orders.find((o) => o.id === waOrder.id);
  check('الطلب مسجّل إن الدفع فشل', afterFail.payment_status === 'failed');

  /* إجراءات الأدمن على الدفع */
  const markPaid = await req('PATCH', '/api/admin/orders/' + waOrder.id + '/payment', { token: sup.token, body: { status: 'paid' } });
  check('المشرف يعلّم الطلب كمدفوع يدويًا (كاش)', markPaid.status === 200 && markPaid.data.order.payment_status === 'paid');
  const markRefund = await req('PATCH', '/api/admin/orders/' + waOrder.id + '/payment', { token: admin.token, body: { status: 'refunded' } });
  check('تسجيل مرتجع', markRefund.data.order.payment_status === 'refunded');

  const sendWa = await req('POST', '/api/admin/orders/' + waOrder.id + '/whatsapp', { token: sup.token, body: {} });
  check('المشرف يبعت تحديث واتساب للعميل من صفحة الطلب', sendWa.status === 200 && !!sendWa.data.row);
  const sendPayLink = await req('POST', '/api/admin/orders/' + waOrder.id + '/whatsapp', { token: sup.token, body: { kind: 'payment_link' } });
  check('إرسال رابط دفع للعميل على واتساب', sendPayLink.status === 200 && sendPayLink.data.row.type === 'payment_link');

  /* توقيع Stripe */
  const stripeSecret = 'whsec_testsecret';
  await req('PATCH', '/api/admin/payments', { token: admin.token, body: { provider: 'stripe', stripe: { secretKey: 'sk_test_abc', webhookSecret: stripeSecret } } });
  const cfgNow = await req('GET', '/api/admin/payments', { token: admin.token });
  check('المفاتيح بتتعرض مقنّعة في اللوحة', String(cfgNow.data.config.stripe.secretKey).startsWith('••••') && String(cfgNow.data.config.stripe.secretKey).endsWith('_abc'), cfgNow.data.config.stripe.secretKey);
  await req('PATCH', '/api/admin/payments', { token: admin.token, body: { provider: 'stripe', stripe: { secretKey: '••••••_abc' } } });
  const cfgKeep = await req('GET', '/api/admin/payments', { token: admin.token });
  check('حفظ الإعدادات مش بيمسح المفتاح المقنّع', String(cfgKeep.data.config.stripe.secretKey).endsWith('_abc'));

  const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', payment_status: 'paid', metadata: { order_id: oOnline.id } } } }), 'utf8');
  const t = Math.floor(Date.now() / 1000);
  const sigGood = 't=' + t + ',v1=' + require('crypto').createHmac('sha256', stripeSecret).update(`${t}.${rawBody.toString('utf8')}`).digest('hex');
  const hookGood = await req('POST', '/api/webhooks/stripe', { raw: rawBody, headers: { 'stripe-signature': sigGood, 'content-type': 'application/json' } });
  check('Webhook Stripe بتوقيع صحيح = مقبول', hookGood.status === 200 && hookGood.data.ok === true);

  const rawBad = Buffer.from(JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_2', payment_status: 'paid', metadata: { order_id: waOrder.id } } } }), 'utf8');
  const hookBad = await req('POST', '/api/webhooks/stripe', { raw: rawBad, headers: { 'stripe-signature': 't=' + t + ',v1=deadbeef', 'content-type': 'application/json' } });
  check('Webhook Stripe بتوقيع غلط = مرفوض', hookBad.status === 400 && hookBad.data.ok === false);

  /* توقيع Paymob */
  const pmSecret = 'paymob_hmac_secret';
  await req('PATCH', '/api/admin/payments', { token: admin.token, body: { provider: 'paymob', paymob: { apiKey: 'key', integrationId: '1', iframeId: '2', hmacSecret: pmSecret } } });
  const pmOrder = (await req('POST', '/api/orders', {
    token: payCust.token,
    body: { items: [{ id: 'k2', qty: 1 }], customer: { name: 'عميل باي موب', phone: '01077778888', area: 'المعادي', address: 'شارع النصر 5 عمارة 9' }, payment: 'online' },
  })).data.order;
  const pmObj = { id: 987654, success: true, pending: false, amount_cents: pmOrder.total * 100, created_at: '2026-10-13T12:00:00', currency: 'EGP',
                  error_occured: false, has_parent_transaction: false, integration_id: 1, is_3d_secure: true, is_auth: false, is_capture: false,
                  is_refunded: false, is_standalone_payment: true, is_voided: false, order: { id: 555, merchant_order_id: pmOrder.id },
                  owner: 1, source_data: { pan: '2345', sub_type: 'MasterCard', type: 'card' } };
  const goodHmac = pay.paymobHmac(pmObj, pmSecret);
  const pmGood = await req('POST', '/api/webhooks/paymob?hmac=' + goodHmac, { body: { type: 'TRANSACTION', obj: pmObj } });
  check('Webhook Paymob بتوقيع صحيح = مقبول ومدفوع', pmGood.status === 200 && pmGood.data.status === 'paid' && pmGood.data.verified === true);
  const pmOrderAfter = (await req('GET', '/api/orders/' + pmOrder.id, { token: payCust.token })).data.order;
  check('طلب Paymob بقى مدفوع', pmOrderAfter.payment_status === 'paid');

  const pmOrder2 = (await req('POST', '/api/orders', {
    token: payCust.token,
    body: { items: [{ id: 'k4', qty: 1 }], customer: { name: 'عميل ٢', phone: '01066667777', area: 'حلوان', address: 'شارع المصانع 3' }, payment: 'online' },
  })).data.order;
  const pmObj2 = { ...pmObj, id: 111, order: { id: 556, merchant_order_id: pmOrder2.id } };
  const pmBad = await req('POST', '/api/webhooks/paymob?hmac=deadbeef', { body: { type: 'TRANSACTION', obj: pmObj2 } });
  check('Webhook Paymob بتوقيع غلط = مرفوض', pmBad.data.verified === false && pmBad.data.ok === false);
  const pmOrder2After = (await req('GET', '/api/orders/' + pmOrder2.id, { token: payCust.token })).data.order;
  check('الطلب ماتغيّرش لما التوقيع غلط', pmOrder2After.payment_status === 'pending');

  await req('PATCH', '/api/admin/payments', { token: admin.token, body: { provider: 'demo' } });

  /* صفحة الدفع نفسها بتتقدم */
  const payPage = await fetch(BASE + '/pay.html');
  check('صفحة الدفع (pay.html) موجودة', payPage.status === 200 && (await payPage.text()).includes('إتمام دفع طلب'));

  /* ---------------------------- 13) الملفات الثابتة ---------------------------- */
  console.log('\n【 الملفات الثابتة والتطبيق 】');
  const idx = await fetch(BASE + '/');
  check('صفحة التطبيق بتتقدم', idx.status === 200 && (await idx.text()).includes('<div id="view">'));
  const spa = await fetch(BASE + '/some/deep/route');
  check('التوجيه بيرجّع التطبيق (SPA)', spa.status === 200);
  const css = await fetch(BASE + '/styles.css');
  check('ملف التنسيقات موجود', css.status === 200);
  const appjs = await fetch(BASE + '/app.js');
  check('ملف الكود موجود', appjs.status === 200);
  const img = await fetch(BASE + '/img/ai-hero.jpg');
  check('صور التطبيق (AI) موجودة', img.status === 200 && (img.headers.get('content-type') || '').includes('jpeg'));
  const trav = await fetch(BASE + '/%2e%2e%2fserver%2findex.js');
  const travBody = await trav.text();
  check('منع الوصول لملفات خارج public (path traversal)', (trav.status === 403 || trav.status === 404) && !travBody.includes('sessionUser'), 'status=' + trav.status);

  /* ---------------------------- النتيجة ---------------------------- */
  console.log('\n' + '─'.repeat(58));
  console.log(fail === 0 ? `🎉 كل الاختبارات نجحت (${pass})` : `❌ فشل ${fail} من ${pass + fail}`);
  console.log('─'.repeat(58) + '\n');

  server.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('💥 خطأ غير متوقع في الاختبار:', e); process.exit(1); });
