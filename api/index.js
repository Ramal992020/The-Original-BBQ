/* ============================================================================
   api/index.js — نقطة دخول Vercel الرئيسية (سيرفرلس)
   ----------------------------------------------------------------------------
   كل راوتات /api/* بتتحول لهنا عن طريق vercel.json rewrites.
   ========================================================================== */
'use strict';
const { serverlessHandler, ensureReady } = require('../server/index');

const boot = ensureReady().catch((e) => {
  console.error('[vercel] فشل تجهيز البيانات:', e.message);
  return null;
});

module.exports = async (req, res) => {
  await boot;
  return serverlessHandler(req, res);
};
