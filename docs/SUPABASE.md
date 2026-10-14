# 🗄️ إعداد Supabase PostgreSQL + متغيرات الاستضافة (خطوة بخطوة)

الدليل ده بيشرح إزاي تخلي التخزين الدائم للحسابات والطلبات والإشعارات على
**Supabase PostgreSQL** — وهو التخزين الموصى به للنسخة المنشورة (بدل Upstash القديم).

> ⚠️ **أمان مهم:**
> - مفتاح `service_role` السري **بيفضل على السيرفر بس** — مش بيتحط في الكود ولا في الواجهة ولا في Git.
> - كلمة سر صاحب المطعم **بتاخد من `ADMIN_PASSWORD` أو `ADMIN_PASSWORD_HASH`** في إعدادات الاستضافة السرية — مكتوبة في الكود أبدًا.
> - التطبيق **مش بيستخدم Supabase Auth** — نظام تسجيل الدخول الحالي (حسابات + جلسات + scrypt) زي ما هو بالظبط.
> - الواجهة مالهاش أي وصول مباشر لقاعدة البيانات — كل حاجة عبر الـAPI بتاع السيرفر.

---

## ٠) المتغيرات المطلوبة على الاستضافة (Vercel / Render)

| المتغير | مثال | منين | سري؟ |
|---|---|---|---|
| `SUPABASE_URL` | `https://abcdefgh.supabase.co` | Supabase → Project Settings → **API** → Project URL | ❌ |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` | نفس الصفحة → **Project API keys → service_role** | ✅ نعم |
| `APP_URL` | `https://the-original-bbq.vercel.app` | دومينك — من غير `/` في الآخر | ❌ |
| `ADMIN_EMAIL` | `aliielramal@gmail.com` | إيميل صاحب المطعم (الافتراضي كده) | ❌ |
| `ADMIN_PASSWORD` | كلمة سر قوية (٦ أحرف+) | من عندك | ✅ نعم |
| `ADMIN_PASSWORD_HASH` | `salt:hash` | بديل اختياري لكلمة السر | ✅ نعم |

> كمان في الإنتاج سيبها كده: `DEMO_LOGIN=0` · `SEED_DEMO=0` · `ALLOW_DEMO_PAYMENTS=0` · `ALLOW_CONSOLE_MAIL=0`
> اختياريًا: `SUPERVISOR_EMAIL` + `SUPERVISOR_PASSWORD` لتجهيز حساب المشرف من البيئة.

---

## ١) اعمل مشروع Supabase (مجاني)

1. افتح **[supabase.com](https://supabase.com)** وسجّل دخول (ممكن بحساب GitHub).
2. **New Project** — اختار اسم مثل `the-original-bbq` ومنطقة قريبة من عملائك (Frankfurt `eu-central-1` مناسبة لمصر).
3. احفظ كلمة سر قاعدة البيانات (Database password) في مكان آمن — **مش محتاجها للتشغيل** لأننا هنستخدم مفاتيح الـAPI.

## ٢) شغّل ملف الـMigration (الجداول + الحماية)

1. من القائمة الجانبية: **SQL Editor** → **New query**.
2. افتح ملف المشروع [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) وانسخ محتواه كامل.
3. دوس **Run** — الملف بيعمل:
   - جداول حقيقية: `bbq_users` (الحسابات) · `bbq_orders` (الطلبات) · `bbq_notifications` (الإشعارات) · `bbq_sessions` (الجلسات) + باقي مجموعات التطبيق.
   - قيود تمنع التكرار: إيميل فريد · رقم طلب فريد · **منع تكرار الطلب عند إعادة المحاولة** (`user_id + request_id`) · هاش التوكن فريد.
   - **RLS مفعّل على كل الجداول بدون أي policies** → أدوار `anon`/`authenticated` (المفاتيح العامة) مبيقدروش يقروش ولا يكتبوا أي صف، والوصول الحقيقي من السيرفر بمفتاح `service_role` بس.
   - دوال الحفظ الذري `bbq_*` (تنفيذها لـ`service_role` بس): تحميل + قفل بين النسخ العاملة + **commit ذري** — يعني مفيش رد «نجاح» قبل الحفظ الفعلي، ومفيش نصف بيانات لو حصل فشل.

> لو بتستخدم Supabase CLI بدل الواجهة: `supabase db push` بيطبّق نفس مجلد `supabase/migrations/`.

## ٣) انسخ المفاتيح

من **Project Settings → API**:

- **Project URL** → ده `SUPABASE_URL` (لازم يبدأ بـ `https://`).
- **Project API keys → `service_role`** → ده `SUPABASE_SERVICE_ROLE_KEY`
  (الزر بيكشف المفتاح — استخدم `anon` لأي حاجة عامة لكن **التطبيق محتاج `service_role`** لأنه بيقرا/بيكتب من السيرفر).

> 🚨 **أهم غلطة:** تاخد مفتاح `anon` بالغلط. لو صار كده، الطلبات هترجع فشل اتصال/صلاحيات.
> المفتاح السري ما يتبعتش لأي عميل وما يتنشرش في GitHub أبدًا.

## ٤) متغيرات الاستضافة + Redeploy

### على Vercel
1. المشروع → **Settings → Environment Variables**.
2. ضيف `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` و `APP_URL` و `ADMIN_PASSWORD` (و`ADMIN_EMAIL` لو مختلف) — وفعّلهم لـ **Production** و **Preview**.
3. **Deployments → ⋯ → Redeploy** — المتغيرات بتتقرأ مع النشر مش مع التصفح.
4. اتأكد: `https://<app>.vercel.app/api/health` → `"storage":"postgres"` و `"persistent":true` و `"ownerFromEnv":true`.

### على Render / VPS
- ضيف نفس المتغيرات في **Environment** (Render) أو ملف `.env` على السيرفر.
- على VPS التطبيق بيشتغل بملفات افتراضيًا؛ لو حابب تربط Supabase ضيف المتغيرين و`STORAGE=postgres` (أو سيب الاختيار التلقائي — بيختار Supabase أول ما يلاقي المفاتيح).

### فحص قبل النشر (من جهازك)
```bash
npm run check:env -- --vercel   # بيحاكي بيئة Vercel ويعمل ping حقيقي على Supabase
```
لازم تلاقي ✔ جنب كل متغير إجباري + `pong` من القاعدة.

---

## ٥) ترحيل البيانات الموجودة (Upstash / ملفات → Supabase)

**النقل بيحافظ على كل البيانات** — UPSERT بالمعرّف بس، من غير حذف أي صف موجود:

1. اطلع نسخة احتياطية من المصدر:
   - من لوحة الإدارة: **الإعدادات → ⬇️ نسخة احتياطية (JSON)**، أو
   - من ملف `server/data/database.json` (وضع الملفات)، أو من نسخة احتياطية سابقة.
2. اضبط متغيرات بيئة Supabase على جهازك (نفس خطوة ٤) وشغّل:
   ```bash
   node tools/import-backup.js path/to/backup.json --dry-run   # معاينة بس
   node tools/import-backup.js path/to/backup.json             # النقل الفعلي
   ```
3. اتأكد من النتيجة: سجّل دخول بحساب صاحب المطعم → طلباتك القديمة موجودة، والعملاء والإشعارات موجودة.

> الملف بيقبل صيغ النسخ الاحتياطية كلها (`{users: [...]}` أو `{collections: {...}}`).
> كلمات السر المهاجرة بتفضل **هاشات scrypt** زي ما هي (مفيش نص صريح أبدًا).

---

## ٦) الدورة المتوقعة بعد الإعداد (اللي بتأكد منها الاختبارات)

1. عميل جديد يسجّل حساب حقيقي → الدور `customer` دائمًا (مفيش رفع صلاحيات من العميل).
2. يعمل طلب → الأسعار بتتحسب **على السيرفر** من المنيو والإعدادات.
3. الطلب بيتحفظ في `bbq_orders` **قبل** ما الرد يرجع (commit ذري) → لو الحفظ فشل، العميل ياخد خطأ مفهوم و«لم يتم تأكيد الطلب».
4. الطلب بيظهر للإدارة فورًا مع **إشعار** `طلب جديد` (وكل مشرف/أدمن ليه إشعاره).
5. أي تغيير حالة (استلام → تجهيز → خروج → توصيل) بيتسجل في `history` والعميل بيتبعه من «طلباتي».
6. إعادة المحاولة بنفس `Idempotency-Key` بترجّع **نفس الطلب** — مفيش تكرار (وقيد فريد في القاعدة يمنعه حتى تحت سباق).

---

## ٧) الاختبار

```bash
npm run test:supabase   # الدورة الكاملة على محاكي محلي مطابق للواجهة
npm run test:all        # كل الاختبارات (API + Vercel + Redis + Supabase + الواجهة)
```

> **صدقية:** الاختبارات بتشتغل على **محاكي محلي** مطابق لواجهة `bbq_*` (زي ما اختبارات Upstash بتشتغل على محاكي Upstash) —
> مش اتصال سحابي حقيقي أثناء التطوير. بعد ما تربط Supabase بتاعتك، `npm run check:env -- --vercel`
> بيعمل **ping حقيقي** على قاعدتك ويأكد إن المتغيرات مظبوطة قبل أول نشر.

---

## ٨) حل المشاكل الشايعة

| العرض | السبب | الحل |
|---|---|---|
| `503 STORAGE_UNAVAILABLE` + «راجع SUPABASE_URL…» | المتغيرات ناقصة أو مكتوبة غلط | ظبّط المتغيرين + Redeploy |
| `Supabase auth failed` | مفتاح `anon` بدل `service_role` أو ناقص | انسخ `service_role` كامل |
| `Supabase function missing` | الـmigration مش متشغل | شغّل `0001_init.sql` في SQL Editor |
| `Supabase error 401/403` | المفتاح اتغير أو اتشال | رجّع المفتاح من Settings → API |
| الطلبات القديمة مش ظاهرة | النقل متعملش | `node tools/import-backup.js` (خطوة ٥) |
| `OWNER_NOT_CONFIGURED` | مفيش `ADMIN_PASSWORD` | ضيفه في الاستضافة + Redeploy |
| بيانات قديمة على Upstash عايز تسيبها | — | احتفظ بـ Upstash كـLegacy (`STORAGE=redis`) لحد ما تنقل |

---

## ٩) لو لسه بتستخدم Upstash (Legacy)

الكود لسه بيدعم `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (شوف [docs/VERCEL-UPSTASH.md](VERCEL-UPSTASH.md))،
لكن **النسخة المنشورة الموصى بيها Supabase PostgreSQL**. لو حطيت مفاتيح Supabase، التطبيق بيختارها أولًا تلقائيًا.
للتراجع الاضطراري: `STORAGE=redis` صراحة.
