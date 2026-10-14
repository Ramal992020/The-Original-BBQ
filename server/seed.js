/* ============================================================================
   seed.js — البيانات الأولية (تتعمل مرة واحدة أول تشغيل)
   ----------------------------------------------------------------------------
   - 50 صنف أصلي من منيو The Original BBQ + صور مولّدة تلقائيًا لكل صنف.
   - صاحب المطعم من إعدادات سرّية؛ الحسابات التجريبية لا تُنشأ في الإنتاج.
   - إعدادات المطعم العامة.
   البيانات محفوظة في قاعدة دائمة وتتعدّل من لوحة الإدارة.
   ========================================================================== */
'use strict';
const store = require('./store');
const auth = require('./auth');

/* الصور المولّدة + صور التطبيق الأصلي (كلها موجودة فعليًا في public/img) */
const LIB = [
  { url: '/img/ai-hero.jpg', label: 'مشاوي على الفحم (غلاف)' },
  { url: '/img/ai-meals.jpg', label: 'وجبات مشاوي' },
  { url: '/img/ai-rolls.jpg', label: 'رولات وساندويتشات' },
  { url: '/img/ai-charcoal.jpg', label: 'برجر فحم' },
  { url: '/img/ai-chicken.jpg', label: 'تشيكن برجر' },
  { url: '/img/ai-smash.jpg', label: 'سماش برجر' },
  { url: '/img/ai-potatoroll.jpg', label: 'رول بطاطس' },
  { url: '/img/ai-fries.jpg', label: 'بطاطس' },
  { url: '/img/ai-offers.jpg', label: 'عروض' },
  { url: '/img/gen-65849550.jpg', label: 'أصلي: غلاف' },
  { url: '/img/gen-57c76008.jpg', label: 'أصلي: وجبات' },
  { url: '/img/gen-040dd48e.jpg', label: 'أصلي: رول' },
  { url: '/img/gen-75c1b0f3.jpg', label: 'أصلي: برجر فحم' },
  { url: '/img/gen-d1f11a3f.jpg', label: 'أصلي: تشيكن' },
  { url: '/img/gen-0a6a2824.jpg', label: 'أصلي: سماش' },
  { url: '/img/gen-b4b4a921.jpg', label: 'أصلي: رول بطاطس' },
  { url: '/img/gen-d66be832.jpg', label: 'أصلي: بطاطس' },
  { url: '/img/gen-b6aee7df.jpg', label: 'أصلي: عروض' },
];

const CATEGORIES = [
  { id: 'meals', name: 'وجبات', icon: '🍢', image: '/img/ai-meals.jpg' },
  { id: 'rolls', name: 'رول ساندويتش', icon: '🌯', image: '/img/ai-rolls.jpg' },
  { id: 'charcoal', name: 'برجر فحم', icon: '🔥', image: '/img/ai-charcoal.jpg' },
  { id: 'chicken', name: 'تشيكن برجر', icon: '🍗', image: '/img/ai-chicken.jpg' },
  { id: 'smash', name: 'سماش برجر', icon: '🍔', image: '/img/ai-smash.jpg' },
  { id: 'rollpotato', name: 'رول بطاطس', icon: '🥔', image: '/img/ai-potatoroll.jpg' },
  { id: 'fries', name: 'بطاطس', icon: '🍟', image: '/img/ai-fries.jpg' },
  { id: 'offers', name: 'عروض مميزة', icon: '🎁', image: '/img/ai-offers.jpg' },
];

const AI = (f) => '/img/' + f;
const MENU = [
  { id: 'm1', cat: 'meals', name: 'ميكس جريل', price: 240, featured: true, image: AI('ai-meals.jpg'),
    desc: '2 قطعة كفتة، 2 شيش طاووق، 2 سجق مشوي، 2 كبدة ستاك، أرز بسمتي مبهر، بطاطس محمرة، طحينة، مخلل' },
  { id: 'm2', cat: 'meals', name: 'وجبة ستربس', price: 180, image: AI('ai-meals.jpg'),
    desc: '4 قطع ستربس، أرز بسمتي مبهر، بطاطس محمرة، صوص من اختيارك، مخلل' },
  { id: 'm3', cat: 'meals', name: 'وجبة شيش طاووق', price: 190, image: AI('ai-meals.jpg'),
    desc: '6 قطع شيش طاووق مشوي، أرز بسمتي مبهر، بطاطس محمرة، طحينة، مخلل' },
  { id: 'm4', cat: 'meals', name: 'وجبة صدور مشوية', price: 220, image: AI('ai-meals.jpg'),
    desc: '250 جرام صدور مشوية ومتبلة، أرز بسمتي مبهر، بطاطس محمرة، طحينة، مخلل' },
  { id: 'm5', cat: 'meals', name: 'وجبة كفتة', price: 170, image: AI('ai-meals.jpg'),
    desc: '6 قطع كفتة، أرز بسمتي مبهر، بطاطس، طحينة، مخلل' },

  { id: 'r1', cat: 'rolls', name: 'ستربس', price: 100, image: AI('ai-rolls.jpg'),
    desc: 'خص، مايونيز، كاتشب، خيار مخلل، جبنة، موتزاريلا' },
  { id: 'r2', cat: 'rolls', name: 'سجق إيطالي', price: 100, image: AI('ai-rolls.jpg'),
    desc: 'خلطة إيطالي، جبنة شيدر، موتزاريلا' },
  { id: 'r3', cat: 'rolls', name: 'سجق شرقي', price: 90, image: AI('ai-rolls.jpg'),
    desc: 'بقدونس، طماطم، خيار مخلل، طحينة' },
  { id: 'r4', cat: 'rolls', name: 'شيش طاووق', price: 100, featured: true, image: AI('ai-rolls.jpg'),
    desc: 'خص، مايونيز، بريكيو، جبنة، موتزاريلا' },
  { id: 'r5', cat: 'rolls', name: 'صدور مشوية', price: 120, image: AI('ai-rolls.jpg'),
    desc: 'خص، مايونيز، كاتشب، خيار مخلل، جبنة، موتزاريلا' },
  { id: 'r6', cat: 'rolls', name: 'طرب', price: 130, image: AI('ai-rolls.jpg'),
    desc: 'بقدونس، طماطم، خيار مخلل، طحينة' },
  { id: 'r7', cat: 'rolls', name: 'كبدة ستاك', price: 90, image: AI('ai-rolls.jpg'),
    desc: 'طحينة، بقدونس، دبس رمان' },
  { id: 'r8', cat: 'rolls', name: 'كفتة', price: 90, image: AI('ai-rolls.jpg'),
    desc: 'بقدونس، طماطم، خيار مخلل، طحينة' },
  { id: 'r9', cat: 'rolls', name: 'لحمة ستاك', price: 130, image: AI('ai-rolls.jpg'),
    desc: 'شرائح لحمة ستاك مشوية، صوصات مميزة، موتزاريلا' },
  { id: 'r10', cat: 'rolls', name: 'هوت دوج بالجبنة', price: 80, image: AI('ai-rolls.jpg'),
    desc: 'خص، خيار مخلل، جبنة، موتزاريلا' },
  { id: 'r11', cat: 'rolls', name: 'هوت دوج كلاسيك', price: 70, image: AI('ai-rolls.jpg'),
    desc: 'كاتشب، مايونيز، خيار مخلل' },

  { id: 'c1', cat: 'charcoal', name: 'برجر فحم دابل', price: 200, featured: true, image: AI('ai-charcoal.jpg'),
    desc: '300 جرام برجر لحم، خص، خيار مخلل، طماطم، موتزاريلا، ميكس صوصات مع البطاطس' },
  { id: 'c2', cat: 'charcoal', name: 'برجر فحم سنجل', price: 150, image: AI('ai-charcoal.jpg'),
    desc: '150 جرام برجر لحم، خص، خيار مخلل، طماطم، موتزاريلا، ميكس صوصات مع البطاطس' },

  { id: 'k1', cat: 'chicken', name: 'برجر ميكس', price: 200, image: AI('ai-chicken.jpg'),
    desc: 'قطعة بيف برجر مشوية على الفحم مع قطعة صدور فراخ، خص، خيار مخلل، موتزاريلا، ميكس صوصات، بطاطس' },
  { id: 'k2', cat: 'chicken', name: 'تشيكن رانش', price: 140, image: AI('ai-chicken.jpg'),
    desc: 'قطعة صدور كرسبي متبلة، صوص رانش، موتزاريلا، خس وخيار مخلل، ومجموعة من الصوصات المميزة' },
  { id: 'k3', cat: 'chicken', name: 'تشيكن كنج', price: 200, image: AI('ai-chicken.jpg'),
    desc: '4 قطع صدور تندر، خص، صوص بيج تيستي، طماطم، خيار مخلل، كاتشب، جبنة، موتزاريلا، بطاطس' },
  { id: 'k4', cat: 'chicken', name: 'كنتاك', price: 130, image: AI('ai-chicken.jpg'),
    desc: 'قطعة صدور فرش، خص، صوص بيج تيستي، طماطم، خيار مخلل، كاتشب، موتزاريلا، بطاطس' },
  { id: 'k5', cat: 'chicken', name: 'مارشملو تشيكن', price: 150, image: AI('ai-chicken.jpg'),
    desc: 'قطعة صدور كرسبي متبلة مع كريمي مشروم وخص وموتزاريلا وخيار مخلل ومجموعة من الصوصات المميزة' },
  { id: 'k6', cat: 'chicken', name: 'مايتي زنجر', price: 200, featured: true, image: AI('ai-chicken.jpg'),
    desc: 'قطعتين صدور فرش، خص، صوص بيج تيستي، طماطم، خيار مخلل، كاتشب، جبنة، موتزاريلا، بطاطس' },

  { id: 's1', cat: 'smash', name: 'أوريجينال تربل', price: 180, image: AI('ai-smash.jpg'),
    desc: 'سماش برجر، خص، بيج تيستي، بصل مكرمل، موتزاريلا، خيار مخلل، بريكيو، جبنة، بطاطس' },
  { id: 's2', cat: 'smash', name: 'أوريجينال دابل', price: 150, featured: true, image: AI('ai-smash.jpg'),
    desc: 'سماش برجر، خص، بيج تيستي، بصل مكرمل، موتزاريلا، خيار مخلل، بريكيو، جبنة، بطاطس' },
  { id: 's3', cat: 'smash', name: 'أوريجينال سنجل', price: 120, image: AI('ai-smash.jpg'),
    desc: 'سماش برجر، خص، بيج تيستي، بصل مكرمل، موتزاريلا، خيار مخلل، بريكيو، جبنة، بطاطس' },
  { id: 's4', cat: 'smash', name: 'إيطاليانو تربل', price: 200, image: AI('ai-smash.jpg'),
    desc: 'سماش برجر، خلطة إيطالي، خص، بيج تيستي، بريكيو، بصل مكرمل، موتزاريلا، خيار مخلل، جبنة، بطاطس' },
  { id: 's5', cat: 'smash', name: 'إيطاليانو دابل', price: 170, image: AI('ai-smash.jpg'),
    desc: 'سماش برجر، خلطة إيطالي، خص، بيج تيستي، بريكيو، بصل مكرمل، موتزاريلا، خيار مخلل، جبنة، بطاطس' },
  { id: 's6', cat: 'smash', name: 'إيطاليانو سنجل', price: 140, image: AI('ai-smash.jpg'),
    desc: 'سماش برجر، خلطة إيطالي، خص، بيج تيستي، بريكيو، بصل مكرمل، موتزاريلا، خيار مخلل، جبنة، بطاطس' },
  { id: 's7', cat: 'smash', name: 'سوبريم تربل', price: 200, image: AI('ai-smash.jpg'),
    desc: 'سماش برجر، بيف بيكون، خص، خيار مخلل، بصل مكرمل، موتزاريلا، مجموعة من الصوصات المميزة' },
  { id: 's8', cat: 'smash', name: 'سوبريم دابل', price: 170, image: AI('ai-smash.jpg'),
    desc: 'سماش برجر، بيف بيكون، خص، خيار مخلل، بصل مكرمل، موتزاريلا، مجموعة من الصوصات المميزة' },
  { id: 's9', cat: 'smash', name: 'سوبريم سنجل', price: 140, image: AI('ai-smash.jpg'),
    desc: 'سماش برجر، بيف بيكون، خص، خيار مخلل، بصل مكرمل، موتزاريلا، مجموعة من الصوصات المميزة' },
  { id: 's10', cat: 'smash', name: 'مشروم تربل', price: 200, image: AI('ai-smash.jpg'),
    desc: 'سماش برجر، مشروم كريمي، بصل مكرمل، موتزاريلا، خص، بيج تيستي، خيار مخلل، بريكيو، جبنة، بطاطس' },
  { id: 's11', cat: 'smash', name: 'مشروم دابل', price: 170, featured: true, image: AI('ai-smash.jpg'),
    desc: 'سماش برجر، مشروم كريمي، بصل مكرمل، موتزاريلا، خص، بيج تيستي، خيار مخلل، بريكيو، جبنة، بطاطس' },
  { id: 's12', cat: 'smash', name: 'مشروم سنجل', price: 140, image: AI('ai-smash.jpg'),
    desc: 'سماش برجر، مشروم كريمي، بصل مكرمل، موتزاريلا، خص، بيج تيستي، خيار مخلل، بريكيو، جبنة، بطاطس' },

  { id: 'p1', cat: 'rollpotato', name: 'بطاطس توابل', price: 45, image: AI('ai-potatoroll.jpg'), desc: 'رول بطاطس بتوابل البيت' },
  { id: 'p2', cat: 'rollpotato', name: 'بطاطس شيدر', price: 65, image: AI('ai-potatoroll.jpg'), desc: 'رول بطاطس بصوص الشيدر' },
  { id: 'p3', cat: 'rollpotato', name: 'بطاطس كاتشب ومايونيز', price: 55, image: AI('ai-potatoroll.jpg'), desc: 'رول بطاطس بكاتشب ومايونيز' },

  { id: 'f1', cat: 'fries', name: 'باربكيو', price: 60, image: AI('ai-fries.jpg'), desc: 'بطاطس بصوص الباربكيو' },
  { id: 'f2', cat: 'fries', name: 'توابل', price: 40, image: AI('ai-fries.jpg'), desc: 'بطاطس بتوابل البيت' },
  { id: 'f3', cat: 'fries', name: 'ستربس فرايز', price: 120, image: AI('ai-fries.jpg'), desc: 'بطاطس مع قطع ستربس وصوصات' },
  { id: 'f4', cat: 'fries', name: 'شيدر', price: 60, image: AI('ai-fries.jpg'), desc: 'بطاطس بصوص الشيدر' },
  { id: 'f5', cat: 'fries', name: 'كاتشب مايونيز', price: 50, image: AI('ai-fries.jpg'), desc: 'بطاطس بكاتشب ومايونيز' },
  { id: 'f6', cat: 'fries', name: 'لوديد فرايز', price: 120, featured: true, image: AI('ai-fries.jpg'), desc: 'بطاطس محمّلة بالجبنة والصوصات' },
  { id: 'f7', cat: 'fries', name: 'ميكس جبن', price: 70, image: AI('ai-fries.jpg'), desc: 'بطاطس بميكس الجبن' },

  { id: 'o1', cat: 'offers', name: 'عرض رول', price: null, noPrice: true, featured: true, image: AI('ai-offers.jpg'),
    desc: 'أي 3 رول معاهُم بطاطس توابل هدية — كلّمنا على واتساب نجهّزلك العرض' },
  { id: 'o2', cat: 'offers', name: 'عرض ساندوتش كومبو', price: 25, priceLabel: 'إضافة', image: AI('ai-offers.jpg'),
    desc: 'اطلب أي ساندوتش من اختيارك وخليه كومبو بـ 25 جنيه بس' },
  { id: 'o3', cat: 'offers', name: 'عرض طرب + صدور + بطاطس توابل', price: 240, oldPrice: 290, image: AI('ai-offers.jpg'),
    desc: 'طرب + صدور + 1 بطاطس توابل' },
  { id: 'o4', cat: 'offers', name: 'عرض كفتة + كبدة ستاك', price: 150, oldPrice: 180, image: AI('ai-offers.jpg'),
    desc: '1 كفتة + كبدة ستاك' },
];

const SETTINGS = {
  name: 'The Original BBQ',
  tagline: 'مشاوي على الفحم',
  currency: 'ج.م',
  phone: '01000000000',
  whatsapp: '201000000000',
  address: 'القاهرة، مصر',
  hoursText: 'يوميًا من ١٢ الظهر لحد ٢ بعد منتصف الليل',
  openHour: 12, closeHour: 26, forceState: null,       // null = تلقائي | 'open' | 'closed'
  deliveryFee: 20, freeDeliveryOver: 300, minOrder: 60, deliveryEta: '٤٥ دقيقة',
  payments: [
    { id: 'cash', label: 'نقدًا عند التوصيل', kind: 'cod', enabled: true },
    { id: 'card_delivery', label: 'بطاقة عند التوصيل', kind: 'cod', enabled: true },
    { id: 'online', label: 'دفع أونلاين (بطاقة / محفظة)', kind: 'online', enabled: false,
      note: 'رابط دفع آمن — الطلب بيتأكد بعد نجاح الدفع' },
  ],

  /* ===== إعدادات الدفع أونلاين (المفاتيح هنا مش بتظهر للعميل أبدًا) ===== */
  paymentConfig: {
    provider: 'demo',                 // demo | stripe | paymob
    currency: 'EGP',
    demo: { enabled: true },
    stripe: { secretKey: '', webhookSecret: '', publicKey: '' },
    paymob: { apiKey: '', integrationId: '', iframeId: '', hmacSecret: '', baseUrl: 'https://accept.paymob.com' },
  },

  /* ===== إشعارات واتساب ===== */
  whatsappNotify: {
    enabled: false,
    provider: 'console',              // console | link | meta | twilio | greenapi | ultramsg | callmebot
    defaultCountryCode: '20',
    requireOptIn: true,               // مبعتش لحد ما العميل يوافق
    staffEnabled: false,
    staffNumbers: [],
    notifyOn: { new: true, received: true, preparing: true, on_way: true, delivered: true, cancelled: true, paid: true },
    templates: null,                  // null = القوالب الافتراضية من whatsapp.js
    meta: { token: '', phoneId: '', templateName: '', templateLang: 'ar' },
    twilio: { accountSid: '', authToken: '', from: 'whatsapp:+14155238886' },
    greenapi: { baseUrl: 'https://7103.api.greenapi.com', instanceId: '', token: '' },
    ultramsg: { instanceId: '', token: '' },
    callmebot: { apiKey: '' },
  },
  promos: [
    { code: 'BBQ10', type: 'percent', value: 10, min: 150, label: 'خصم ١٠٪ على أي طلب فوق ١٥٠ ج.م' },
    { code: 'FREEDEL', type: 'freedelivery', value: 0, min: 200, label: 'توصيل مجاني فوق ٢٠٠ ج.م' },
  ],
  addons: {
    default: [{ name: 'جبنة إضافية', price: 15 }, { name: 'صوص إضافي', price: 10 }],
    meals: [{ name: 'زيادة أرز', price: 20 }, { name: 'صوص إضافي', price: 10 }, { name: 'بطاطس إضافية', price: 25 }],
    fries: [{ name: 'شيدر إضافي', price: 20 }, { name: 'صوص إضافي', price: 10 }],
    rolls: [{ name: 'جبنة موتزاريلا', price: 15 }, { name: 'جبنة شيدر', price: 15 }, { name: 'صوص إضافي', price: 10 }],
  },
  statuses: [
    { id: 'new', label: 'طلب جديد', emoji: '📥', note: 'تم إرسال طلبك للمطعم — في انتظار تأكيد الإدارة' },
    { id: 'received', label: 'تم استلام الطلب', emoji: '✅', note: 'المطعم أكّد استلام الطلب' },
    { id: 'preparing', label: 'جاري التجهيز', emoji: '🔥', note: 'بيتجهّز دلوقتي على الفحم' },
    { id: 'on_way', label: 'خرج للتوصيل', emoji: '🛵', note: 'الطلب خرج مع الدليفري' },
    { id: 'delivered', label: 'تم التوصيل', emoji: '🎉', note: 'بالهنا والشفا ❤️' },
    { id: 'cancelled', label: 'ملغي', emoji: '✖️', note: 'الطلب اتلغى' },
  ],
  imageLibrary: LIB,
  aiAutoImages: true,          // توليد صور تلقائيًا للأصناف المستوردة بدون صورة
};

function seed() {
  let created = false;
  /* ترقية أي بيانات قديمة: ضيف حقول الدفع/الواتساب لو مش موجودة */
  const cur = store.find('settings', (x) => x.id === 'main');
  if (cur) {
    const patch = {};
    if (!cur.paymentConfig) patch.paymentConfig = SETTINGS.paymentConfig;
    if (!cur.whatsappNotify) patch.whatsappNotify = SETTINGS.whatsappNotify;
    if (cur.statuses?.some((status) => status.id === 'new' && status.note === 'وصلنا طلبك وبدأنا نجهّزه')) {
      patch.statuses = cur.statuses.map((status) => status.id === 'new' ? { ...status, note: SETTINGS.statuses[0].note } : status);
    }
    if (!Array.isArray(cur.payments) || !cur.payments[0] || !cur.payments[0].kind) patch.payments = SETTINGS.payments;
    if (Object.keys(patch).length) { store.update('settings', 'main', patch); console.log('⬆️ تمت ترقية الإعدادات (دفع أونلاين + واتساب)'); }
  }

  /* Owner setup is independent of whether customers already exist. */
  auth.bootstrapOwner();
  const fixtures = [
    { name: 'أدمن تجريبي', email: 'admin@bbq.app', password: 'admin123', role: 'admin' },
    { name: 'مشرف تجريبي', email: 'supervisor@bbq.app', password: 'super123', role: 'supervisor' },
    { name: 'عميل تجريبي', email: 'demo@bbq.app', password: 'demo123', role: 'customer' },
  ];
  const devFixtures = process.env.SEED_DEMO === '1' && process.env.NODE_ENV !== 'production' && !store.IS_SERVERLESS;
  if (devFixtures) {
    for (const fixture of fixtures) if (!auth.byEmail(fixture.email)) auth.createUser(fixture);
  } else {
    /* Disable only untouched, publicly-known legacy accounts. Keep their order history.
       An account whose password was changed is NOT silently disabled or overwritten. */
    for (const fixture of fixtures) {
      const user = auth.byEmail(fixture.email);
      if (user && !user.isOwner && user.active !== false && auth.verifyPassword(fixture.password, user.salt, user.hash)) {
        store.update('users', user.id, { active: false });
        store.write('sessions', store.all('sessions').filter((session) => session.userId !== user.id));
      }
    }
  }

  if (!store.all('categories').length) {
    store.write('categories', CATEGORIES.map((c, i) => ({ ...c, sort: i, active: true })));
    created = true;
  }

  if (!store.all('menu').length) {
    store.write('menu', MENU.map((m, i) => ({
      ...m, sort: i, active: true, available: true,
      imageSource: 'ai',           // صور مولّدة تلقائيًا — قابلة للتغيير من الإدارة
      createdAt: new Date().toISOString(),
    })));
    created = true;
    console.log(`🍔 تم استيراد ${MENU.length} صنف مع صور مولّدة تلقائيًا`);
  }

  if (!store.all('settings_pending').length || !store.find('settings', (s) => s.id === 'main')) {
    const exists = store.find('settings', (s) => s.id === 'main');
    if (!exists) { store.insert('settings', { id: 'main', ...SETTINGS }); created = true; }
  }

  if (created) console.log('✨ تم تجهيز البيانات الأولية');
  return created;
}

module.exports = { seed, SEED_MENU: MENU, SEED_CATEGORIES: CATEGORIES, SEED_SETTINGS: SETTINGS, LIB };
