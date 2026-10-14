'use strict';
/* /api/* rewrites use the same transaction/commit-before-response handler.
   Vercel → Settings → Environment Variables (first setup):
     SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY         (التخزين الدائم — إجباري، للسيرفر بس)
     APP_URL                                          (الدومين بتاعك)
     ADMIN_PASSWORD (أو ADMIN_PASSWORD_HASH)          (حساب صاحب المطعم — سري)
   وبعدين Redeploy. الشرح خطوة بخطوة: docs/SUPABASE.md
   الفحص: npm run check:env -- --vercel
   (بيانات Upstash القديمة لسه مدعومة كـLegacy — docs/VERCEL-UPSTASH.md) */
module.exports = require('../server/index').serverlessHandler;
