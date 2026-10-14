> 🗄️ **ملاحظة (الأولوية للتغييرات الجديدة):** التخزين الموصى به للنسخة المنشورة بقى **Supabase PostgreSQL** —
> شوف الدليل الجديد **[docs/SUPABASE.md](SUPABASE.md)**. الدليل ده لسه شغال وصحيح لو بتستخدم Upstash كـ **Legacy**،
> ولو حطيت مفاتيح Supabase التطبيق بيختارها أولًا تلقائيًا (للتراجع الاضطراري: `STORAGE=redis`).

# 🔗 ازاي تربط Upstash وتظبط متغيرات Vercel (خطوة بخطوة)

الدليل ده للسؤال: **«المعاينة بتستخدم تخزين السيرفر… ازاي أخليها دائمة على Vercel؟»**

الخلاصة: محتاج المتغيرات دي في **Vercel → Settings → Environment Variables**، وبعدين **Redeploy**:

| المتغير | مثال | منين |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | `https://eu1-great-owl-12345.upstash.io` | لوحة Upstash → القاعدة → **REST API** |
| `UPSTASH_REDIS_REST_TOKEN` | `AXeyASQg...` | نفس المكان |
| `ADMIN_EMAIL` | `aliielramal@gmail.com` | إيميل صاحب المطعم |
| `ADMIN_PASSWORD` | كلمة سر قوية | من عندك — إعداد خاص، متنشرهوش في Git |
| `APP_URL` | `https://the-original-bbq.vercel.app` | دومين Vercel، من غير `/` في الآخر |

> كمان في الإنتاج: `DEMO_LOGIN=0` · `SEED_DEMO=0` · `ALLOW_DEMO_PAYMENTS=0` · `ALLOW_CONSOLE_MAIL=0`
> (دي بتمنع أي حساب تجريبي بكلمات سر معروفة أو محاكاة دفع).

---

## ٠) ليه محتاج ده أصلًا؟

Vercel بيشغّل التطبيق **سيرفرلس**: كل طلب بيشتغل في نسخة منفصلة **من غير قرص دائم**. يعني:

- أي حاجة تتكتب في `/tmp` **بتضيع** مع كل Deploy — وعلشان كده الكود **بيرفض** التخزين بالملفات على السيرفرلس
  (هتشوف `503 / STORAGE_UNAVAILABLE` بدل ما يضحك عليك ويقولك «تم» وهو مش حافظ حاجة).
- الطلبات والعملاء والإعدادات لازم تتخزّن في **قاعدة خارجية** → **Upstash Redis** (الخطة المجانية كافية لمطعم).
- و`ADMIN_EMAIL` + `ADMIN_PASSWORD` هما اللي بيجهّزوا **حساب صاحب المطعم** — مفيش `admin123` منشور في أي حتة.

---

## ١) اعمل قاعدة Upstash (مجانية)

1. افتح **[console.upstash.com](https://console.upstash.com)** → سجّل دخول (ممكن بحساب GitHub).
2. **Create Database**.
3. الإعدادات:

   | الإعداد | القيمة |
   |---|---|
   | Name | `bbq` (أي اسم) |
   | Type | **Regional** |
   | Region | الأقرب لعملائك — لمصر: `eu-central-1` (فرانكفورت) أو `eu-west-1` |
   | Plan | **Free** |

4. دوس **Create**.

## ٢) انسخ الرابط والتوكن

جوه صفحة القاعدة، انزل لقسم **REST API** (أو **Details → REST API → .env**):

```
UPSTASH_REDIS_REST_URL=https://eu1-great-owl-12345.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXeyASQgMjAyNi0xMC0xN...
```

فيه زر نسخ جنب كل واحدة — استخدمه (ما تكتبهاش بإيدك).

> 🚨 **أهم غلطة:** لازم الرابط يبدأ بـ `https://`.
> **مش** رابط `redis://default:...@...` — المشروع بيكلّم Upstash عبر HTTP من غير أي مكتبات،
> ولو حطيت `redis://` هتلاقي في اللوجات `Upstash HTTP ...` أو `fetch failed`.

### طريق بديل: من سوق Vercel نفسه

لو ركّبت Upstash من **Vercel → Storage → Upstash**، Vercel ممكن يسمّي المتغيرات
`KV_REST_API_URL` / `KV_REST_API_TOKEN` بدل أسماء `UPSTASH_*`.
في الحالة دي ضيف المتغيرين بالاسمين اللي الكود بيقراهم (`UPSTASH_REDIS_REST_URL` و
`UPSTASH_REDIS_REST_TOKEN`) بنفس القيم.

## ٣) حطّهم في Vercel

1. افتح **[vercel.com](https://vercel.com)** → المشروع بتاعك.
2. **Settings** → **Environment Variables**.
3. لكل متغير: **Key** + **Value**، واختار البيئات **Production** (و **Preview** لو عايز المعاينات كمان
   تتخزن دائم — بس استخدم قاعدة أو `REDIS_PREFIX` تاني عشان متخلطش البيانات) → **Save**.

   | Key | Value |
   |---|---|
   | `UPSTASH_REDIS_REST_URL` | `https://eu1-...upstash.io` |
   | `UPSTASH_REDIS_REST_TOKEN` | التوكن الطويل |
   | `ADMIN_EMAIL` | `aliielramal@gmail.com` (أو إيميلك) |
   | `ADMIN_PASSWORD` | كلمة سر قوية — إعداد خاص |
   | `APP_URL` | `https://the-original-bbq.vercel.app` |
   | `DEMO_LOGIN` · `SEED_DEMO` · `ALLOW_DEMO_PAYMENTS` · `ALLOW_CONSOLE_MAIL` | `0` |

   > اختياري: `SUPERVISOR_EMAIL` + `SUPERVISOR_PASSWORD` (بيجهّزوا حساب مشرف من البيئة)،
   > و`ADMIN_PASSWORD_HASH` (بديل لـ `ADMIN_PASSWORD` بصيغة `salt:hash` — من غير ما تكتب النص الصريح خالص)،
   > و`REDIS_PREFIX` لو القاعدة مشتركة.

4. **من التيرمنال (بديل أسرع):**

   ```bash
   vercel env add UPSTASH_REDIS_REST_URL production
   vercel env add UPSTASH_REDIS_REST_TOKEN production
   vercel env add ADMIN_EMAIL production
   vercel env add ADMIN_PASSWORD production
   vercel env add APP_URL production
   vercel env add DEMO_LOGIN production      # اكتب 0
   ```

## ٤) Redeploy — الخطوة اللي الناس بتنساها

المتغيرات **مش بتتطبّق على deploy قديم**. لازم:

**Deployments → (آخر deployment) → ⋯ → Redeploy** (أو `vercel --prod`).

بدون Redeploy هتفضل تشوف `503 / STORAGE_UNAVAILABLE` أو `OWNER_NOT_CONFIGURED`.

---

## ٥) اتأكد إنها اشتغلت

### أ) من المتصفح

| الفحص | المفروض |
|---|---|
| `https://<app>.vercel.app/api/health` | `"storage":"redis"` · `"persistent":true` · `"ownerFromEnv":true` |
| `https://<app>.vercel.app/api/bootstrap` | جوّه `settings`: `"storage":"redis"` |
| لوحة الإدارة → تبويب **🛠️ النظام** | ✅ جنب كل متغير إجباري + زمن الرد من Upstash + حالة حساب المالك |

### ب) من جهازك قبل النشر

```bash
npm run check:env -- --vercel
```

بيقولك بالظبط إيه الناقص وإيه الغلط، ويعمل PING تجريبي حقيقي على Upstash:

```
   ✅ UPSTASH_REDIS_REST_URL     https://eu1-...upstash.io
   ✅ UPSTASH_REDIS_REST_TOKEN   ••••••mnop
   ✅ APP_URL                    https://the-original-bbq.vercel.app
   ✅ ADMIN_PASSWORD             ••••••2026
اتصال Upstash:
   ✅ PONG في 38ms — الرابط والتوكن شغالين
حساب صاحب المطعم:
   من البيئة : نعم (ADMIN_PASSWORD / ADMIN_PASSWORD_HASH)
```

(الخروج بـ `exit 1` = لسه فيه حاجة ناقصة.)

### ج) فحص يدوي للتوكن بس

```bash
curl https://<YOUR-URL>/ping -H "Authorization: Bearer <YOUR-TOKEN>"
# المفروض يرجّع: {"result":"PONG"}
```

---

## ٦) حساب صاحب المطعم: إزاي بيشتغل

- أول تشغيل: السيرفر بيجهّز حساب **المالك** من `ADMIN_EMAIL` + `ADMIN_PASSWORD`
  (مرة واحدة — وبيتحوّل لهاش scrypt، ومش بيتكتب في أي لوج).
- **البيئة بتوفّر كلمة السر لحين ما صاحبها يغيّرها من اللوحة**:
  - طالما الحساب لسه متغيّرش من **حسابي → تغيير كلمة السر**، أي تغيير في `ADMIN_PASSWORD`
    بيتطبّق مع كل Redeploy → **ده طريق استرجاع الدخول لو نسيتها**.
  - أول ما المالك يغيّر كلمة السر من اللوحة، البيئة **مش بتلمسها تاني أبدًا**.
- بعد كده استخدم **«نسيت كلمة السر»** (محتاج `RESEND_API_KEY` عشان يبعت إيميل حقيقي).
- `ADMIN_PASSWORD_HASH` بديل أدق: بتحط `salt:hash` جاهز بدل النص الصريح —
  الجيل منه: `node -e "const c=require('crypto');const s=c.randomBytes(16).toString('hex');console.log(s+':'+c.scryptSync('كلمة-السر',s,64).toString('hex'))"`.
- اختياري: `SUPERVISOR_EMAIL` + `SUPERVISOR_PASSWORD` يعملوا نفس الكلام لحساب مشرف.

> ⚠️ الدخول بعد الظبط: **`ADMIN_EMAIL` + كلمة سر `ADMIN_PASSWORD`** — مفيش `admin123` على الإنتاج خالص
> (أي حساب تجريبي قديم بكلمات سر معروفة بيتعطّل أوتوماتيك عند الترقية، وطلباته محفوظة).

---

## ٧) غلطات شايعة وحلّها

| العرض | السبب | الحل |
|---|---|---|
| `503 / STORAGE_UNAVAILABLE` | Upstash ناقص/غلط، أو محاولة `file` على Vercel | اتأكد الرابط يبدأ بـ `https://` والتوكن كامل → Redeploy |
| `503 / OWNER_NOT_CONFIGURED` | مفيش `ADMIN_PASSWORD` (أو `ADMIN_PASSWORD_HASH`) | ضيفه بشكل خاص → Redeploy |
| `Upstash HTTP 401` في اللوجات | التوكن غلط أو منسوخ ناقص | انسخه تاني من Upstash → حدّث المتغير → Redeploy |
| `fetch failed` / `ETIMEDOUT` | رابط `redis://` أو دومين غلط | استخدم رابط REST بـ `https://` |
| روابط الدفع/الواتساب بتطلع `localhost` | `APP_URL` مش مظبوط | حط الدومين الكامل بـ https → Redeploy |
| المتغيرات متظبطة بس مش بتأثر | نسيت Redeploy / محددة على Preview بس | فعّل **Production** → **Redeploy** |
| Vercel سوق Upstash حط أسماء `KV_*` | أسماء مختلفة | ضيف `UPSTASH_REDIS_REST_URL/TOKEN` بنفس القيم |
| البيانات بتختفي بعد كل Deploy | لسه مش `redis` | نفس الحل الأول → وبعدها `"persistent":true` |
| مش عارف إيه الناقص بالظبط | — | افتح `/api/health` — حقل `setup.missing` بيقول الناقص بالاسم، أو صفحة `#/setup` جوه التطبيق، أو `npm run check:env -- --vercel` |
| الموقع بيقول «مش قادرين نوصل للمطعم» أو «خدمة التسجيل غير متاحة مؤقتًا» | الإعداد ناقص والسيرفر بيقفل كل الـAPI | التطبيق بيعرض صفحة `#/setup` بخطوات الإصلاح بنفسه؛ أكّد السبب من `/api/health` وظبّط المتغيرات → Redeploy |

---

## ٨) تشيك ليست نهائي

- [ ] قاعدة Upstash اتعملت (Free, Regional, أقرب منطقة).
- [ ] `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` متنسخين من قسم **REST API** ويبدأوا بـ `https://`.
- [ ] `ADMIN_EMAIL` + `ADMIN_PASSWORD` متظبطين (إعداد خاص — مش في Git).
- [ ] `APP_URL` = دومين Vercel الحقيقي من غير `/`.
- [ ] `DEMO_LOGIN` · `SEED_DEMO` · `ALLOW_DEMO_PAYMENTS` · `ALLOW_CONSOLE_MAIL` = `0`.
- [ ] كل المتغيرات مفعّلة على **Production**.
- [ ] عملت **Redeploy**.
- [ ] `/api/health` بيقول `"storage":"redis"` و `"persistent":true` و `"ownerFromEnv":true`.
- [ ] تبويب **🛠️ النظام** كله ✅.
- [ ] دخلت بحساب المالك وغيّرت كلمة السر من **حسابي**.

---

## ٩) مش هتستخدم Vercel؟

لو هتشتغل على **سيرفر عادي** (Render / VPS / جهازك) فمش محتاج Upstash —
التطبيق بيخزّن على **قرص دائم** (`server/data/`) وبيكتب نسخًا ذرية، وبيوفّر إشعارات لحظية (SSE).
بس خلي بالك:

- على Render/VPS لازم **Disk ثابت** — من غيره البيانات هتروح مع كل إعادة تشغيل.
- المتغير المهم ليك هناك: `APP_URL` + `ADMIN_EMAIL`/`ADMIN_PASSWORD` (+ `BBQ_DATA_DIR` لو حابب مكان تاني).

شوف كمان: **[DEPLOY.md](../DEPLOY.md)** للدليل الكامل (Vercel / Render / VPS)،
و**[.env.example](../.env.example)** لكل المتغيرات اللي المشروع بيفهمها.
