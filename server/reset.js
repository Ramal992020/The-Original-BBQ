/* ============================================================================
   reset.js — تصفير البيانات (بياخد نسخة احتياطية الأول)
   التشغيل:  npm run reset            → نسخة احتياطية + تصفير كامل
             npm run reset -- --hard  → تصفير نهائي من غير نسخة احتياطية
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const store = require('./store');

const hard = process.argv.includes('--hard');
const dataDir = store.DATA_DIR;

if (!fs.existsSync(dataDir) || !fs.readdirSync(dataDir).length) {
  console.log('ℹ️ مفيش بيانات تتصفّر أصلًا.');
  process.exit(0);
}

if (!hard) {
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(store.backup(), null, 2));
  console.log('💾 نسخة احتياطية اتحفظت في: ' + file);
}

fs.rmSync(dataDir, { recursive: true, force: true });
console.log('🧹 تم تصفير البيانات — أول تشغيل للسيرفر هيرجّع المنيو والحسابات الافتراضية.');
console.log('   (الصور اللي رفعتها في uploads/ مش بتتمسح)');
