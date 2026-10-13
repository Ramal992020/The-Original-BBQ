/* ============================================================================
   api/[...route].js — نقطة دخول Vercel (سيرفرلس)
   ----------------------------------------------------------------------------
   Vercel بيشغّل كل طلب في دالة منفصلة، فبنستخدم نفس كود السيرفر بالظبط
   (server/index.js → serverlessHandler) عشان مفيش أي كود مكرر.
   كل راوتات /api/* بتمر من هنا، والملفات الثابتة (public/) Vercel بيخدمها لوحده.

   ⚠️ مهم: على Vercel لازم تضبط متغيرات البيئة دي:
      UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (التخزين — إجباري)
      APP_URL                                             (الدومين بتاعك)
   ========================================================================== */
'use strict';
const { serverlessHandler, ensureReady } = require('../server/index');

/* نبني كل حاجة مرة واحدة عند "البداية الباردة" (cold start) */
const boot = ensureReady().catch((e) => {
  console.error('[vercel] فشل تجهيز البيانات:', e.message);
  return null;
});

module.exports = async (req, res) => {
  await boot;
  return serverlessHandler(req, res);
};
