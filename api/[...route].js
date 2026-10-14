'use strict';
/* Vercel requires Upstash REST credentials and a private ADMIN_PASSWORD on first setup.
   Vercel → Settings → Environment Variables:
     UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (التخزين الدائم — إجباري)
     APP_URL                                             (الدومين بتاعك)
     ADMIN_PASSWORD (أو ADMIN_PASSWORD_HASH)             (حساب صاحب المطعم)
   وبعدين Redeploy. الشرح خطوة بخطوة: docs/VERCEL-UPSTASH.md
   الفحص: npm run check:env -- --vercel */
module.exports = require('../server/index').serverlessHandler;
