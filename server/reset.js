'use strict';
/* Destructive maintenance tool. Always load the actual data before backing it up. */
require('./env').load();
const fs = require('fs');
const path = require('path');
const store = require('./store');

(async () => {
  if (store.MODE !== 'file') throw new Error('This reset tool only supports file storage. Back up Redis before managing it in Upstash.');
  await store.init();
  if (!fs.readdirSync(store.DATA_DIR).length) { console.log('ℹ️ مفيش بيانات تتصفّر.'); return; }
  if (!process.argv.includes('--hard')) {
    const backupDir = path.join(__dirname, '..', 'backups');
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const file = path.join(backupDir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(store.backup(), null, 2), { mode: 0o600 });
    console.log('💾 نسخة احتياطية اتحفظت في: ' + file);
  }
  fs.rmSync(store.DATA_DIR, { recursive: true, force: true });
  console.log('🧹 تم تصفير البيانات. أول تشغيل يحتاج إعدادات صاحب المطعم السرّية من جديد.');
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
