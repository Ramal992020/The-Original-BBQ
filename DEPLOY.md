# 🚀 دليل النشر — من جهازك للإنترنت (GitHub → Vercel)

ده الدليل الكامل لنشر **The Original BBQ** أونلاين. ملخصه: **٥ دقايق** لو ماشي على طريق Vercel.

> **المشروع بيشتغل في وضعين من نفس الكود بالظبط، وبيختار لوحده:**
> | | وضع السيرفر العادي | وضع Vercel (سيرفرلس) |
> |---|---|---|
> | التخزين | ملفات JSON في `server/data/` | **Supabase PostgreSQL** (مُوصى به) أو Upstash Redis (Legacy — بدون أي مكتبات خارجية) |
> | تحديث الطلبات | ✅ لحظي (SSE) | 🔄 كل ٥ ثوانٍ أثناء فتح التطبيق (الواجهة بتتبدّل لوحدها) |
> | الصور المرفوعة | على القرص في `uploads/` | جوّه قاعدة البيانات وبتتقدم من `/api/img/:id` |
> | الطلبات والصلاحيات والدفع والواتساب | ✅ | ✅ |
> | ينفع لمين | VPS / Render (لو عايز لحظية كاملة) | أسهل إعداد وأرخصه (Free) |
>
> **الاختيار الأوتوماتيك:** مع إعدادات Supabase → PostgreSQL أولًا، وإلا مع إعدادات Upstash → Redis. محليًا بدونهما → ملف دائم.
> على Vercel غياب قاعدة دائمة ينتج 503 صريح، ولا يتحول إلى `/tmp` أبدًا.
> (وتقدر تجبر الاختيار بـ `STORAGE=postgres` أو `STORAGE=redis` أو `STORAGE=file` خارج السيرفرلس. Vercel يقبل postgres أو redis فقط.)

---

## 📋 المحتويات

> 📌 **عايز الخطوات بالتفصيل من الصفر؟** [`docs/SUPABASE.md`](docs/SUPABASE.md) —
> إنشاء مشروع Supabase → تشغيل migration → نسخ `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` → إضافتهم في Vercel → Redeploy → التأكد (بالصور والنسخ/اللصق) + ترحيل البيانات القديمة.
> (ولو بتفضل Upstash: [`docs/VERCEL-UPSTASH.md`](docs/VERCEL-UPSTASH.md) — لسه مدعوم كـLegacy.)

1. [قبل ما تبدأ](#١-قبل-ما-تبدأ)
2. [الطريق أ: Vercel + Upstash (المُوصى به)](#٢-الطريق-أ-vercel--upstash)
3. [جدول متغيرات البيئة الكامل](#٣-جدول-متغيرات-البيئة-الكامل)
4. [أول ١٠ دقايق بعد النشر (مهم جدًا)](#٤-أول-١٠-دقايق-بعد-النشر-مهم-جدًا)
5. [الطريق ب: Render (سيرفر عادي + لحظية SSE)](#٥-الطريق-ب-render)
6. [الطريق ج: VPS / أي سيرفر Node](#٦-الطريق-ج-vps--أي-سيرفر-node)
7. [تجربة وضع Vercel محليًا](#٧-تجربة-وضع-vercel-محليًا)
8. [Webhooks الدفع على الإنتاج](#٨-webhooks-الدفع-على-الإنتاج)
9. [النسخ الاحتياطي والاسترجاع](#٩-النسخ-الاحتياطي-والاسترجاع)
10. [تحديث التطبيق بعد النشر](#١٠-تحديث-التطبيق-بعد-النشر)
11. [حل المشاكل (Troubleshooting)](#١١-حل-المشاكل)

---

## ١) قبل ما تبدأ

| الحاجة | منين | لازم؟ |
|---|---|---|
| **Node.js 18 أو أحدث** | [nodejs.org](https://nodejs.org) | ✅ للتشغيل المحلي والاختبارات |
| **حساب GitHub** | [github.com](https://github.com) | ✅ |
| **حساب Vercel** (مجاني) | [vercel.com](https://vercel.com) | ✅ للطريق أ |
| **حساب Upstash** (مجاني) | [console.upstash.com](https://console.upstash.com) | ✅ للطريق أ |
| Git | أي نظام | ✅ |

**جرّب محليًا الأول عشان تتأكد إن كل حاجة سليمة:**

```bash
npm install        # اختيارية — المشروع بيشتغل من غير أي مكتبات
cp .env.example .env
# اضبط ADMIN_PASSWORD في .env الخاص، ثم:
npm start          # افتح http://localhost:3000
npm run test:all    # الاختبارات تستخدم بيانات معزولة
```

حساب المالك: `aliielramal@gmail.com`، وكلمة السر الأولية من متغير `ADMIN_PASSWORD` الخاص. لا توجد حسابات إدارة عامة جاهزة. راجع [التسجيل والطلبات الفعلية](docs/REAL-ORDERS.md).

---

## ٢) الطريق أ: Vercel + Upstash

### خطوة ١ — ارفع الريبو على GitHub

لو الريبو موجود على GitHub أصلًا (زي `Ramal992020/The-Original-BBQ`) اعدي الخطوة دي.

```bash
cd The-Original-BBQ
git init                      # لو لسه مش ريبو
git add .
git commit -m "The Original BBQ"
git branch -M main
git remote add origin https://github.com/<اسمك>/<اسم-الريبو>.git
git push -u origin main
```

> ⚠️ **تأكد إن `server/data/` مش مرفوع.** هو في `.gitignore` — ده مجلد بياناتك الحقيقية
> (فيه هاشات كلمات السر وتوكنات الجلسات). لو اتعمله commit بالغلط، شوف [حل المشاكل](#١١-حل-المشاكل).

### خطوة ٢ — اعمل قاعدة Upstash Redis (مجانية)

1. افتح **[console.upstash.com](https://console.upstash.com)** وسجّل دخول (ممكن بحساب GitHub).
2. **Create Database** → اختار **Free / Pay-as-you-go**.
3. الاسم: `bbq` · النوع: **Regional** · المنطقة: **الأقرب لعملائك** (لمصر: `eu-central-1` فرانكفورت أو `eu-west-1`).
4. بعد ما تتعمل، انزل لتحت لـ **REST API** وانسخ حاجتين:
   - **UPSTASH_REDIS_REST_URL** → شكله: `https://eu1-xxxxx-xxxxx.upstash.io`
   - **UPSTASH_REDIS_REST_TOKEN** → سلسلة طويلة

> 🚨 **أهم غلطة بتحصل:** لازم تنسخ رابط **REST** اللي بيبدأ بـ `https://`،
> **مش** رابط `redis://default:...@...` — الكود بيكلّم Upstash عبر HTTP من غير أي مكتبات،
> فلو حطيت رابط `redis://` هياخدك «Upstash HTTP» أو «fetch failed».

### خطوة ٣ — اربط الريبو بـ Vercel

1. افتح **[vercel.com/new](https://vercel.com/new)**.
2. **Import** الريبو بتاعك (لو أول مرة، ادي لـ Vercel صلاحية على الريبو ده).
3. في صفحة الإعدادات:

   | الإعداد | القيمة |
   |---|---|
   | **Project Name** | أي اسم (هيظهر في الدومين) |
   | **Framework Preset** | **Other** |
   | **Root Directory** | سيبه فاضي (الريبو كله) |
   | **Build Command** | **فاضي** — مفيش أي بناء |
   | **Output Directory** | **فاضي** — Vercel بيخدم `public/` لوحده، و`api/[...route].js` بيتعامل كدالة سيرفرلس |
   | **Install Command** | **فاضي** — `dependencies` فاضية في `package.json` |

4. افتح **Environment Variables** وضيف (قبل ما تدوس Deploy):

   | Key | Value |
   |---|---|
   | `UPSTASH_REDIS_REST_URL` | `https://eu1-xxxxx-xxxxx.upstash.io` |
   | `UPSTASH_REDIS_REST_TOKEN` | التوكن اللي نسخته |
   | `APP_URL` | `https://<project>.vercel.app` (من غير `/` في الآخر) |
   | `ADMIN_EMAIL` | `aliielramal@gmail.com` |
   | `ADMIN_PASSWORD` | كلمة السر الأولية المطلوبة — إعداد خاص، لا تنشره في الكود |
   | `DEMO_LOGIN`, `SEED_DEMO`, `ALLOW_DEMO_PAYMENTS`, `ALLOW_CONSOLE_MAIL` | `0` |

5. **Redeploy بعد أي تغيير في المتغيرات:** المتغيرات مش بتتطبّق على deploy قديم —
   **Deployments → ⋯ → Redeploy** (أو `vercel --prod`).
6. **Deploy** ✅ — هياخد أقل من دقيقة.

> `vercel.json` موجود ومضبوط بالفعل (حد ٣٠ ثانية للدالة، ١٠٢٤ ميجا، وكاش للصور).
> ومفيش داعي لأي rewrites: كل الروابط في الواجهة **hash-based** (`/#/admin`، `/#/order/BBQ-1001`).

### خطوة ٤ — اتأكد إنها شغالة

| الفحص | إزاي | المفروض |
|---|---|---|
| الدالة حيّة | افتح `https://<app>.vercel.app/api/health` | `"storage":"postgres"` و `"persistent":true` و `"ownerFromEnv":true` |
| التخزين بقى Supabase | افتح `https://<app>.vercel.app/api/bootstrap` | جوّه `settings`: `"storage":"postgres"` و `"realtime":false` |
| الإعداد مكتمل | لوحة الإدارة → تبويب **🛠️ النظام** | ✅ جنب كل متغير إجباري + زمن الرد من Supabase |
| قبل النشر (من جهازك) | `npm run check:env -- --vercel` | كل المتغيرات الإجبارية ✅ + `PONG` من القاعدة |
| الواجهة | افتح الدومين | المنيو بـ ٥٠ صنف بالصور |
| الدخول | `aliielramal@gmail.com` وكلمة السر التي ضبطتها بشكل خاص | لوحة الإدارة تفتح |

> على Vercel لو ظهر `503 / STORAGE_UNAVAILABLE`، أصلح رابط REST والتوكن في **Settings → Environment Variables** واعمل **Redeploy**.
> التخزين بالملفات على Vercel مرفوض، ولا تُعرض رسالة نجاح لتسجيل/طلب لم يُحفظ. إذا ظهر `OWNER_NOT_CONFIGURED` اضبط `ADMIN_PASSWORD`.

### خطوة ٥ — دومين خاص (اختياري)

**Settings → Domains → Add** (`bbq-restaurant.com` مثلًا) واتبّع تعليمات الـ DNS.
بعدين **لازم** تحدّث `APP_URL` في متغيرات البيئة للدومين الجديد واعمل Redeploy —
لأن روابط الدفع ورسائل واتساب ورابط استعادة كلمة السر كلها بتتبنى من `APP_URL`.

---

## ٣) جدول متغيرات البيئة الكامل

ده كل اللي الكود بيقراه فعلًا (`server/*.js` + `api/[...route].js`):

| المتغير | إجباري؟ | فين | الفايدة |
|---|:--:|---|---|
| `SUPABASE_URL` | ✅ على Vercel | Vercel / Render | رابط مشروع Supabase (يبدأ بـ `https://`) — التخزين الدائم الموصى به |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ معاه | Vercel / Render | مفتاح `service_role` السري — للسيرفر فقط ولا يُنشر في الكود |
| `UPSTASH_REDIS_REST_URL` | ⚪ Legacy | Vercel | بديل قديم: رابط REST (يبدأ بـ `https://`) لو مش موصّل بـ Supabase |
| `UPSTASH_REDIS_REST_TOKEN` | ⚪ معاه | Vercel | بديل قديم: توكن Upstash |
| `APP_URL` | ✅ للإنتاج | Vercel / Render | الدومين النهائي — روابط الدفع + واتساب + استعادة كلمة السر |
| `ADMIN_EMAIL` | ✅ للمالك | أي وضع | الافتراضي `aliielramal@gmail.com` |
| `ADMIN_PASSWORD` | ✅ عند تجهيز المالك لأول مرة | أي وضع | كلمة سر سرية تتحول إلى scrypt؛ لا يُعاد ضبطها بعد تغييرها من الحساب |
| `ADMIN_PASSWORD_HASH` | ❌ بديل لكلمة السر | أي وضع | هاش scrypt بصيغة salt:hash، يُحفظ بشكل خاص |
| `DEMO_LOGIN=0` / `SEED_DEMO=0` | ✅ للإنتاج | أي وضع | لا يُنشئ/يفتح حسابات التجربة. التفعيل المحلي فقط بخيارين صريحين |
| `ALLOW_DEMO_PAYMENTS=0` | ✅ للإنتاج | أي وضع | يقفل محاكاة الدفع؛ المحاكاة ممنوعة على Vercel/production |
| `ALLOW_CONSOLE_MAIL=0` | ✅ للإنتاج | أي وضع | لا يزعم إرسال بريد بدون مزود حقيقي |
| `STORAGE` | ❌ | أي وضع | `redis` أو `file` — لتجاوز الاختيار التلقائي |
| `REDIS_PREFIX` | ❌ | Redis | بادئة المفاتيح (الافتراضي `bbq:`) — لو أكتر من تطبيق على نفس القاعدة |
| `PORT` | ❌ | سيرفر عادي | البورت (الافتراضي `3000`) — على Vercel/Render بيتحدد لوحده |
| `HOST` | ❌ | سيرفر عادي | الافتراضي `0.0.0.0` |
| `BBQ_DATA_DIR` | ❌ | سيرفر عادي | مكان ملفات JSON (الافتراضي `server/data`) |
| `BBQ_UPLOAD_DIR` | ❌ | سيرفر عادي | مكان الصور المرفوعة (الافتراضي `uploads/`) |
| `DEMO_USER_ID` | ❌ | أي وضع | الحساب اللي يدخل بيه «الدخول السريع» |
| `GEMINI_API_KEY` | ❌ | أي وضع | توليد صور حقيقية بالأصناف (Gemini) |
| `GEMINI_IMAGE_MODEL` | ❌ | أي وضع | الافتراضي `gemini-2.5-flash-image` |
| `OPENAI_API_KEY` | ❌ | أي وضع | توليد صور حقيقية (بديل Gemini) |
| `OPENAI_IMAGE_MODEL` | ❌ | أي وضع | الافتراضي `gpt-image-1` |
| `RESEND_API_KEY` | ❌ | أي وضع | إرسال إيميل استعادة كلمة السر فعليًا |
| `MAIL_FROM` | ❌ | مع RESEND | عنوان المُرسل |
| `VERCEL` / `AWS_LAMBDA_FUNCTION_NAME` | — | — | **متحطهاش بنفسك** — المنصة بتحطها، وهي اللي بتفعّل وضع السيرفرلس |

> 💳💬 **مفاتيح الدفع (Stripe / Paymob) ومفاتيح الواتساب (Meta / Twilio / Green API / UltraMsg / CallMeBot)
> مش متغيرات بيئة** — بتتحط من **لوحة الإدارة** (تبويب 💳 الدفع وتبويب 💬 واتساب) وبتتخزّن على السيرفر،
> وبتظهر في اللوحة **مقنّعة** (آخر ٤ حروف) ومستحيل توصل لأي API للعميل.

فيه نسخة جاهزة في الريبو: **[`.env.example`](.env.example)** — انسخها لـ `.env` للتشغيل المحلي.

### ٣.٥) فحص الجاهزية بأمر واحد (قبل النشر وبعده)

```bash
npm run check:env              # الوضع الحالي (محلي)
npm run check:env -- --vercel  # «اختبرني كأني على Vercel» قبل ما تنشر
```

بيطبع جدول بكل متغير (**ناقص / غلط / تمام**) من غير ما يكشف أي قيمة سرية، وبيعمل `PING` تجريبي
حقيقي على Upstash ويقولك زمن الرد. الخروج بـ `exit 1` معناه لسه فيه حاجة ناقصة.

وبعد النشر فيه تبويب **🛠️ النظام** في لوحة الإدارة (للمالك فقط) بيعرض نفس التقرير بزر «تحديث».

---

## ٤) أول ١٠ دقايق بعد النشر (مهم جدًا)

- [ ] **ادخل بحساب المالك** `aliielramal@gmail.com` وكلمة السر الخاصة التي ضبطتها، ويفضل تغييرها لكلمة قوية من **حسابي → تغيير كلمة السر**.
- [ ] **المشرفون** يسجلون حسابات عادية، ثم المالك يرقيهم من المستخدمين؛ لا يوجد كاشير بكلمة سر منشورة.
- [ ] تأكد أن خيارات التجربة الأربعة `0`. عند ترقية بيانات قديمة تُعطَّل فقط حسابات التجربة التي ما زالت بكلمات السر المعروفة؛ طلباتها تبقى محفوظة.
- [ ] **بيانات المطعم** → **الإعدادات**: الاسم، الرقم، واتساب، العنوان، مواعيد الشغل، رسوم التوصيل، أقل طلب.
- [ ] **الدفع** → نقدًا عند التوصيل يعمل فورًا. اضبط Stripe/Paymob قبل تفعيل الأونلاين؛ محاكاة الدفع غير متاحة في الإنتاج.
- [ ] **واتساب** → اختار المزوّد وحط الأرقام، وجرّب بزر «إرسال رسالة تجريبية».
- [ ] **المنيو** → راجع الأسعار والأصناف (الـ ٥٠ صنف المستوردين أسعارهم قابلة للتعديل).
- [ ] **اعمل نسخة احتياطية** من الإعدادات (زر «نسخة احتياطية» في الإعدادات).

> 🔐 كلمة سر المالك لا توضع في README أو Git أو الواجهة. التسجيل العام لا يعطي صلاحيات إدارة، وحساب المالك محمي من التعطيل/إزالة الصلاحيات.

---

## ٥) الطريق ب: Render

اختار الطريق ده لو عايز **اللحظية الكاملة** (الطلب يظهر للكاشير في نفس اللحظة — SSE) أو مش عايز Redis.

1. افتح **[dashboard.render.com](https://dashboard.render.com)** → **New +** → **Web Service**.
2. اربط حسابك بـ GitHub واختار الريبو.
3. الإعدادات:

   | الإعداد | القيمة |
   |---|---|
   | **Runtime** | Node |
   | **Build Command** | `npm install` (أو سيبه فاضي) |
   | **Start Command** | `npm start` |
   | **Instance Type** | Free مع Redis، أو Paid مع Disk دائم |

4. **Environment Variables**: `APP_URL=https://<service>.onrender.com` · `ADMIN_EMAIL=aliielramal@gmail.com` · `ADMIN_PASSWORD` بشكل خاص · `DEMO_LOGIN=0`
   (اختياري: `RESEND_API_KEY`، `GEMINI_API_KEY`).
5. 🚨 **الأهم — Disk:** من تبويب **Disks** ضيف disk:
   - حدد المسارات بمتغيرات `BBQ_DATA_DIR=/var/data/data` و `BBQ_UPLOAD_DIR=/var/data/uploads` وضيف Disk على `/var/data`. لا تركّب القرص فوق مجلد كود المشروع.
   - وضع الملف لعملية Node واحدة فقط؛ لعدة نسخ استخدم Redis.

   > من غير Disk، Render بيمسح القرص مع كل Deploy/restart → **طلباتك وصورك هتضيع**.
   > (ولو مش عايز Disk خالص → استخدم Redis: حط `UPSTASH_REDIS_REST_URL` + `TOKEN` والكود هيبدّل لوحده.)

6. **Create Web Service** ✅ واتبّع نفس [قائمة أول ١٠ دقايق](#٤-أول-١٠-دقايق-بعد-النشر-مهم-جدًا).

**اتأكد:** `https://<service>.onrender.com/api/health` → `{"ok":true}`، و`/api/bootstrap` → جوّه `settings`: `"storage":"file"` و`"realtime":true`.

---

## ٦) الطريق ج: VPS / أي سيرفر Node

```bash
# على السيرفر
git clone https://github.com/<اسمك>/<الريبو>.git && cd <الريبو>
node -v                                   # لازم 18+
cp .env.example .env
# اضبط ADMIN_PASSWORD في .env الخاص أولًا.
APP_URL=https://bbq.example.com NODE_ENV=production npm start
```

**تشغيل دائم بـ PM2:**

```bash
npm i -g pm2
APP_URL=https://bbq.example.com DEMO_LOGIN=0 pm2 start server/index.js --name bbq
pm2 save && pm2 startup          # يشتغل تلقائي بعد إعادة تشغيل السيرفر
pm2 logs bbq                     # اللوجات (رسائل واتساب في وضع console بتتطبع هنا)
```

**أو systemd** (`/etc/systemd/system/bbq.service`):

```ini
[Unit]
Description=The Original BBQ
After=network.target

[Service]
WorkingDirectory=/var/www/The-Original-BBQ
ExecStart=/usr/bin/node server/index.js
Environment=PORT=3000
Environment=APP_URL=https://bbq.example.com
Environment=DEMO_LOGIN=0
Environment=NODE_ENV=production
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now bbq
```

**Nginx كـ reverse proxy (اختياري):**

```nginx
server {
  listen 80;
  server_name bbq.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;

    # مهم للبث اللحظي (SSE) — من غيره التحديثات هتتأخر
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 24h;
  }
}
```

بعدها `sudo certbot --nginx -d bbq.example.com` لشهادة HTTPS مجانية.

---

## ٧) تجربة وضع Vercel محليًا

من غير حساب Upstash — فيه محاكي مدمج:

```bash
# تيرمنال ١: محاكي Upstash
npm run fake-redis                      # بيفتح على 4599

# تيرمنال ٢: التطبيق في وضع سيرفرلس
STORAGE=redis \
UPSTASH_REDIS_REST_URL=http://127.0.0.1:4599 \
UPSTASH_REDIS_REST_TOKEN=x \
VERCEL=1 ADMIN_PASSWORD=test-only-password npm start
```

**أو الاختبارات الآلية (٢٣ اختبار — بتعمل كل السيناريو لوحدها):**

```bash
npm run test:vercel
```

بتتأكد من: التخزين السحابي شغال من غير قرص · البيانات بتفضل بعد إعادة التشغيل (cold start) ·
رفع الصور بيتخزّن في القاعدة وبيتقدم من `/api/img/:id` · SSE بيترفض (400) والواجهة بتتحوّل لـ polling.

```bash
npm test              # ١٦٤ اختبار للوضع العادي: صلاحيات، طلبات، دفع، واتساب، إشعارات، إعداد النشر
npm run test:real     # سيناريوهات التسجيل والطلبات الحقيقية على تخزين دائم
npm run test:all      # الكل مع بعض
```

---

## ٨) Webhooks الدفع على الإنتاج

بعد ما تفعّل Stripe أو Paymob من **لوحة الإدارة → 💳 الدفع**، سجّل رابط الـ Webhook عند المزوّد:

| المزوّد | الرابط | فين تتسجل | ملاحظات |
|---|---|---|---|
| **Stripe** | `https://<دومينك>/api/webhooks/stripe` | Stripe Dashboard → Developers → Webhooks | اختار أحداث `checkout.session.completed` و`payment_intent.succeeded` · حط الـ **Signing Secret** في `webhookSecret` باللوحة |
| **Paymob** | `https://<دومينك>/api/webhooks/paymob` | Paymob Portal → Webhooks | حط الـ **HMAC Secret** في `hmacSecret` باللوحة |

> 🔐 **التوقيع بيتفحص على السيرفر:** أي Webhook بتوقيع غلط بيترفض ومش بيغيّر أي حالة في الطلب —
> Stripe بيرجّع **400**، وPaymob بيرجّع **200 مع `{ok:false, reason:"توقيع غير صحيح"}`** في الجسم
> (عشان Paymob ميفضلش يعيد المحاولة) — وده كله متغطّي في الاختبارات.
> فمستحيل حد يعلّم طلب كمدفوع من غير ما يدفع فعلًا.

**لو مش عايز Webhooks دلوقتي:** سيب المزوّد على `demo` — صفحة الدفع التجريبية (`/pay.html`) شغالة ومحمية
بتوكن خاص بكل طلب، وتقدر تجرّب سيناريو الدفع كامل من غير أي مفاتيح.

---

## ٩) النسخ الاحتياطي والاسترجاع

**وضع الملفات (Render / VPS):**

```bash
npm run reset            # نسخة احتياطية في backups/ + تصفير البيانات
npm run reset -- --hard  # تصفير نهائي من غير نسخة
```

أو انسخ المجلد كله: `cp -r server/data /مكان/آمن/` — وارجعه بمكانه واعمل restart.

**وضع Redis (Vercel):**

- من اللوحة: **الإعدادات → نسخة احتياطية** → بينزّلك ملف JSON بكل البيانات (أو `/api/admin/backup` بحساب أدمن).
- ومن Upstash نفسه: تبويب **Data / CLI** → تقدر تعمل snapshot.

> 📅 **اعمل نسخة احتياطية أسبوعيًا على الأقل** — الطلبات وسجل الواتساب وبيانات العملاء كلها جوه التخزين ده.

---

## ١٠) تحديث التطبيق بعد النشر

```bash
git add .
git commit -m "تعديل: ..."
git push origin main       # Vercel/Render بيعملوا Deploy تلقائي
```

| | Vercel | Render / VPS |
|---|---|---|
| الكود | بيتحدّث أوتوماتيك من `main` | أوتوماتيك (Render) أو `git pull && pm2 restart bbq` |
| البيانات | ✅ محفوظة في Redis — مش بتتأثر | ✅ محفوظة على الـ Disk |

> ⚠️ **على Vercel من غير Redis** التسجيل والطلبات لا يشتغلان (503) بدلًا من حفظ بيانات مؤقتة تضيع — إعدادات Redis إجبارية.

---

## ١١) حل المشاكل

| العرض | السبب على الأغلب | الحل |
|---|---|---|
| الموقع بيرجع **404** على كل حاجة | `public/` مش بيتخدم كـ static | تأكد إن **Framework Preset = Other** وإن **Output Directory فاضي** |
| `/api/*` بيرجع **404** | دالة `api/[...route].js` مش متعملة | شوف تبويب **Functions** في Vercel — لازم تكون موجودة؛ اعمل Redeploy |
| `503 / STORAGE_UNAVAILABLE` | إعداد Redis ناقص/فشل، أو محاولة file على Vercel | اضبط رابط REST والتوكن واعمل Redeploy؛ التطبيق لا يعيد زرع بيانات بدل المفقودة |
| `503 / OWNER_NOT_CONFIGURED` | المالك لم يُجهَّز | اضبط `ADMIN_PASSWORD` بشكل خاص ثم Redeploy؛ لا تنشره في Git |
| `fetch failed` / `Upstash HTTP 401` في اللوجات | رابط `redis://` بدل REST، أو توكن غلط | انسخ **UPSTASH_REDIS_REST_URL** (`https://...upstash.io`) والتوكن من تبويب REST API |
| `Upstash HTTP 429` | تجاوزت حد الخطة المجانية | رقّي الخطة أو قلّل معدل التحديث في الكود أو استخدم خطة مناسبة للاستخدام |
| الطلبات مش بتظهر لحظيًا للكاشير | وضع سيرفرلس مفيهوش SSE | طبيعي — التحديث كل ٥ ثوانٍ أثناء فتح التطبيق. عايز لحظي؟ استخدم **Render** |
| روابط واتساب/الدفع بتفتح `localhost` | `APP_URL` مش متظبط | حط `APP_URL` بالدومين الكامل واعمل Redeploy |
| إيميل استعادة كلمة السر مش بيوصل | مفيش `RESEND_API_KEY` | حط المفتاح (+`MAIL_FROM`) — من غيره تظهر رسالة أن خدمة الاستعادة غير مفعّلة |
| الصور مش بتتولّد | مفيش مفتاح AI | طبيعي: بيستخدم المكتبة المدمجة. حط `GEMINI_API_KEY` أو `OPENAI_API_KEY` |
| الصور المرفوعة بتختفي (Render) | مفيش Disk ثابت | ضيف Disk أو حوّل التخزين لـ Redis |
| زر «الدخول السريع» لسه موجود | تم تفعيل وضع التجربة المحلي صراحةً | ضيف `DEMO_LOGIN=0` واعمل Redeploy |
| المتغيرات متظبطة بس مش بتأثر | نسيت Redeploy / محددة على Preview بس | فعّل **Production** واعمل **Redeploy** |
| نسيت كلمة سر المالك | — | غيّر `ADMIN_PASSWORD` في الاستضافة → Redeploy (بيُعاد تطبيقه طالما الحساب متغيّرش من اللوحة)؛ بعد ما تتغيّر من **حسابي** استخدم «نسيت كلمة السر» |
| مش عارف إيه الناقص بالظبط | — | `npm run check:env -- --vercel` أو تبويب 🛠️ النظام |
| Vercel سوق Upstash حط أسماء `KV_*` | أسماء مختلفة عن اللي الكود بيقراه | ضيف `UPSTASH_REDIS_REST_URL` و `UPSTASH_REDIS_REST_TOKEN` بنفس القيم |
| `Error: Cannot find module` على Vercel | حاولت تضيف dependencies | المشروع **بدون أي مكتبات خارجية** — شيل `npm install` من Build Command |

**اللوجات:** Vercel → تبويب **Logs** · Render → **Logs** · VPS → `pm2 logs bbq`.
دور على الأسطر اللي بتبدأ بـ `[payments]` أو `[paymob webhook]` أو `🗄️ التخزين:` — دي بتقولك الوضع والتخزين الحالي.

---

## ✅ تشيك ليست نهائي

- [ ] `/api/health` بيرجّع `"storage":"redis"` و `"persistent":true` و `"ownerFromEnv":true`
- [ ] تبويب **🛠️ النظام** كله ✅ (أو `npm run check:env -- --vercel` من جهازك)
- [ ] `/api/bootstrap` بيوري `settings.storage = "redis"` (على Vercel) و`"realtime":false`
- [ ] المنيو بيظهر بالصور، والطلب بيتم بنجاح ويوصل للوحة الإدارة
- [ ] حساب المالك الخاص شغال، وخيارات التجربة مقفولة، وجُرّبت دورة الطلب من عميل إلى الإدارة ثم بعد إعادة تشغيل
- [ ] `APP_URL` = الدومين النهائي (ورابط الدفع/واتساب بيفتح صح)
- [ ] نسخة احتياطية اتعملت

**مبروك — مطعمك أونلاين 🔥**
