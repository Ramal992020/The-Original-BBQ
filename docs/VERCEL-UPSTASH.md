# 🔗 ازاي تربط Upstash وتظبط متغيرات Vercel (خطوة بخطوة)

الدليل ده للسؤال: **«المعاينة بتستخدم تخزين السيرفر… ازاي أخليها دائمة على Vercel؟»**

الخلاصة: محتاج ٤ متغيرات في **Vercel → Settings → Environment Variables**، وبعدين **Redeploy**:

| المتغير | مثال | منين |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | `https://eu1-great-owl-12345.upstash.io` | لوحة Upstash → قاعدة البيانات → **REST API** |
| `UPSTASH_REDIS_REST_TOKEN` | `AXeyASQg...` (سلسلة طويلة) | نفس المكان |
| `ADMIN_PASSWORD` | `Bbq#Strong2026` | من عندك — ٨ حروف على الأقل |
| `APP_URL` | `https://the-original-bbq.vercel.app` | دومين Vercel بتاعك، من غير `/` في الآخر |

> كمان يُفضّل `DEMO_LOGIN=0` (يقفل زر «الدخول السريع»).

---

## ٠) ليه محتاج ده أصلًا؟ (٣٠ ثانية)

Vercel بيشغّل التطبيق **سيرفرلس**: كل طلب بيشتغل في نسخة جديدة من غير قرص ثابت دائم.
يعني:

- الملفات اللي يتكتب في `/tmp` **بتضيع** مع كل Deploy.
- الطلبات والعملاء والإعدادات لازم تتخزّن في **قاعدة خارجية** → هنا بتيجي **Upstash Redis** (الخطة المجانية كافية لمطعم).
- و`ADMIN_PASSWORD` بيضمن إن حساب الأدمن مش سايب بكلمة السر الافتراضية `admin123` اللي أي حد قراها في الـ README.

من غير المتغيرات دي التطبيق **هيفضل شغال** بس في «وضع المعاينة»: البيانات مؤقتة والدخول بـ `admin123`.

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
> **مش** رابط `redis://default:...@...` — المشروع بيكلم Upstash عبر HTTP من غير أي مكتبات،
> ولو حطيت `redis://` هتلاقي في اللوجات `Upstash HTTP ...` أو `fetch failed`.

### طريق بديل: من سوق Vercel نفسه

لو ركّبت Upstash من **Vercel → Storage → Upstash**، Vercel ممكن يسمّي المتغيرات
`KV_REST_API_URL` / `KV_REST_API_TOKEN` بدل أسماء `UPSTASH_*`.
في الحالة دي ببساطة ضيف المتغيرين بالاسمين اللي الكود بيقراهم (`UPSTASH_REDIS_REST_URL` و
`UPSTASH_REDIS_REST_TOKEN`) بنفس القيم، عشان متواجهش «storage: file» بعد النشر.

---

## ٣) حطّهم في Vercel

1. افتح **[vercel.com](https://vercel.com)** → المشروع بتاعك.
2. **Settings** (تبويب فوق) → **Environment Variables**.
3. لكل متغير: **Key** + **Value**، واختار البيئات **Production** (و **Preview** لو عايز المعاينات كمان تتخزن دائم) → **Save**.

   | Key | Value | ملاحظة |
   |---|---|---|
   | `UPSTASH_REDIS_REST_URL` | `https://eu1-...upstash.io` | من قسم REST API |
   | `UPSTASH_REDIS_REST_TOKEN` | التوكن الطويل | سري |
   | `ADMIN_PASSWORD` | `Bbq#Strong2026` | ٨ حروف على الأقل |
   | `APP_URL` | `https://the-original-bbq.vercel.app` | من غير `/` في الآخر |
   | `DEMO_LOGIN` | `0` | اختياري بس مهم في الإنتاج |

   > اختياري: `ADMIN_EMAIL` (لو عايز إيميل أدمن غير `admin@bbq.app`)
   > و`SUPERVISOR_PASSWORD` (لحساب المشرف) و`REDIS_PREFIX` (لو القاعدة مشتركة).

4. **من التيرمنال (بديل أسرع):**

   ```bash
   vercel env add UPSTASH_REDIS_REST_URL production
   vercel env add UPSTASH_REDIS_REST_TOKEN production
   vercel env add ADMIN_PASSWORD production
   vercel env add APP_URL production
   vercel env add DEMO_LOGIN production     # اكتب 0
   ```

## ٤) Redeploy — الخطوة اللي الناس بتنساها

المتغيرات **مش بتتطبّق على deploy قديم**. لازم:

**Deployments → (آخر deployment) → ⋯ → Redeploy** (أو `vercel --prod` من التيرمنال).

بدون Redeploy هتفضل تشوف `"storage":"file"` وهتفضل البيانات بتضيع.

---

## ٥) اتأكد إنها اشتغلت

### أ) فحص سريع من المتصفح

| الرابط | المفروض تشوف |
|---|---|
| `https://<app>.vercel.app/api/health` | `"storage":"redis"` و `"persistent":true` و `"adminPasswordFromEnv":true` |
| `https://<app>.vercel.app/api/bootstrap` | جوّه `settings`: `"storage":"redis"` |
| `https://<app>.vercel.app/#/admin` → تبويب **🛠️ النظام** | ✅ جنب كل متغير إجباري + زمن الرد من Upstash |

### ب) فحص من جهازك قبل النشر

```bash
# حطّ نفس القيم في .env (الملف متجاهل في Git) وبعدين:
npm run check:env -- --vercel
```

هيقولك بالظبط إيه الناقص وإيه الغلط، ويعمل PING تجريبي حقيقي على Upstash:

```
   ✅ UPSTASH_REDIS_REST_URL     https://eu1-...upstash.io
   ✅ UPSTASH_REDIS_REST_TOKEN   ••••••mnop
   ✅ APP_URL                    https://the-original-bbq.vercel.app
   ✅ ADMIN_PASSWORD             ••••••2026
اتصال Upstash:
   ✅ PONG في 38ms — الرابط والتوكن شغالين
```

(الخروج بـ `exit 1` = لسه فيه حاجة ناقصة.)

### ج) فحص يدوي للتوكن بس

```bash
curl https://<YOUR-URL>/ping -H "Authorization: Bearer <YOUR-TOKEN>"
# المفروض يرجّع: {"result":"PONG"}
```

---

## ٦) كلمة سر الأدمن: إزاي تشتغل

- أول ما `ADMIN_PASSWORD` يتظبط، السيرفر بيطبّقه على `admin@bbq.app` (أو `ADMIN_EMAIL`) مع **كل إقلاع**.
- يعني: **متغير البيئة هو اللي بيكسب**. ده مقصود ومفيد:
  - مفيش حساب أدمن بـ `admin123` على الإنتاج أبدًا.
  - لو نسيت كلمة السر → غيّر `ADMIN_PASSWORD` في Vercel → **Redeploy** → ادخل بالجديدة.
- لو مش عايز كلمة السر تتحدّث أوتوماتيك: سيب `ADMIN_PASSWORD` فاضي وغيّرها من **صفحة الحساب** جوه التطبيق.
- اختياري: `SUPERVISOR_PASSWORD` يعمل نفس الكلام لحساب `supervisor@bbq.app`.

> ⚠️ بعد ما تظبط `ADMIN_PASSWORD`، الدخول بيبقى:
> `admin@bbq.app` + الكلمة اللي حطّيتها في Vercel (مش `admin123`).

---

## ٧) غلطات شايعة وحلّها

| العرض | السبب | الحل |
|---|---|---|
| `"storage":"file"` في `/api/health` | `UPSTASH_REDIS_REST_URL` ناقص أو شكله غلط | اتأكد إنه يبدأ بـ `https://` → Redeploy |
| `Upstash HTTP 401` في اللوجات | التوكن غلط أو منسوخ ناقص | انسخه تاني من Upstash → حدّث المتغير → Redeploy |
| `fetch failed` / `ETIMEDOUT` | رابط `redis://` أو دومين غلط | استخدم رابط REST بـ `https://` |
| البيانات بتختفي بعد كل Deploy | لسه في وضع `file` | نفس الحل فوق — وبعدها `"persistent":true` |
| روابط الدفع/الواتساب بتطلع `localhost` | `APP_URL` مش مظبوط | حط الدومين الكامل بـ https → Redeploy |
| الزر «الدخول السريع» لسه شغال | `DEMO_LOGIN` مش `0` | `DEMO_LOGIN=0` → Redeploy |
| `ADMIN_PASSWORD` مش بيأثر | نسيت Redeploy | Deployments → ⋯ → Redeploy |
| المتغيرات اتظبطت بس في Preview | محددتش Production | Vercel → Settings → Environment Variables → فعّل **Production** |
| Vercel سوق Upstash حط أسماء `KV_*` | أسماء مختلفة | ضيف `UPSTASH_REDIS_REST_URL/TOKEN` بنفس القيم |

---

## ٨) تشيك ليست نهائي

- [ ] قاعدة Upstash اتعملت (Free, Regional, أقرب منطقة).
- [ ] `UPSTASH_REDIS_REST_URL` (+ `TOKEN`) متنسخين من قسم **REST API** ويبدأوا بـ `https://`.
- [ ] `APP_URL` = دومين Vercel الحقيقي من غير `/`.
- [ ] `ADMIN_PASSWORD` = كلمة سر قوية (٨+ حروف).
- [ ] `DEMO_LOGIN=0`.
- [ ] كل المتغيرات مفعّلة على **Production** (و Preview لو محتاج).
- [ ] عملت **Redeploy**.
- [ ] `/api/health` بيقول `"storage":"redis"` و `"persistent":true`.
- [ ] تبويب **🛠️ النظام** في لوحة الإدارة كله ✅.
- [ ] دخلت بـ `admin@bbq.app` + كلمة السر الجديدة.

---

## ٩) مش هتستخدم Vercel؟

لو هتشتغل على **سيرفر عادي** (Render / VPS / جهازك) فمش محتاج Upstash خالص —
التطبيق بيخزّن في ملفات JSON على القرص (`server/data/`) وبيديك إشعارات لحظية (SSE).
في الحالة دي المتغير المهم ليك هو `APP_URL` و`ADMIN_PASSWORD` بس.

شوف كمان: **[DEPLOY.md](../DEPLOY.md)** للدليل الكامل (Vercel / Render / VPS)،
و**[.env.example](../.env.example)** لكل المتغيرات اللي المشروع بيفهمها.
