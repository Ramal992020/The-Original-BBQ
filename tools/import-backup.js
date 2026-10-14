/* ============================================================================
   tools/import-backup.js — ترحيل البيانات إلى قاعدة جديدة (Supabase مثلًا)
   ----------------------------------------------------------------------------
   الاستخدام:
     1) اضبط متغيرات البيئة على القاعدة الهدف (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
     2) node tools/import-backup.js path/to/backup.json [--dry-run]

   بيقبل نفس صيغة النسخة الاحتياطية اللي بيطلعها زر «⬇️ نسخة احتياطية» في اللوحة:
     { "users": [...], "orders": [...], ... }        أو
     { "version": 1, "collections": { ... } }        (نسخة ملف database.json)

   قواعد مهمة:
   - UPSERT فقط بالمعرّف id — مش بيمسح أي صف موجود في القاعدة (النقل بيحافظ
     على البيانات الحالية والقديمة مع بعض).
   - مفيش أي قيمة سرية بتتطبع في اللوجات.
   - الحفظ بيتم في معاملة واحدة → إما النقل كله أو فشل واضح (مفيش نصف نقل).
   ========================================================================== */
'use strict';
require('../server/env').load();
const fs = require('fs');
const path = require('path');
const store = require('../server/store');

const file = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
const dryRun = process.argv.includes('--dry-run');

(async () => {
  if (!file) {
    console.error('الاستخدام: node tools/import-backup.js <backup.json> [--dry-run]');
    process.exitCode = 1;
    return;
  }
  const raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const collections = raw && raw.collections && typeof raw.collections === 'object' && !Array.isArray(raw.collections)
    ? raw.collections
    : raw;
  if (!collections || typeof collections !== 'object' || Array.isArray(collections)) {
    throw new Error('ملف النسخة الاحتياطية غير صالح — المتوقع كائن فيه المجموعات (users/orders/...)');
  }

  await store.init();
  console.log(`📦 التخزين الهدف: ${store.MODE}${store.MODE === 'postgres' ? ' (Supabase PostgreSQL)' : store.MODE === 'redis' ? ' (Upstash Redis)' : ' (ملفات)'}`);
  if (dryRun) {
    let rows = 0;
    for (const [name, list] of Object.entries(collections)) {
      if (!Array.isArray(list)) throw new Error(`المجموعة ${name} لازم تكون قائمة صفوف`);
      rows += list.length;
      console.log(`   ${name}: ${list.length} صف`);
    }
    console.log(`✅ [تجريبي] ${rows} صف جاهزين للنقل من غير أي كتابة.`);
    return;
  }

  const summary = await store.transaction(() => {
    const out = [];
    for (const [name, list] of Object.entries(collections)) {
      if (!Array.isArray(list)) throw new Error(`المجموعة ${name} لازم تكون قائمة صفوف`);
      let inserted = 0, updated = 0, skipped = 0;
      for (const row of list) {
        if (!row || row.id == null || String(row.id) === '') { skipped++; continue; }
        const existing = store.find(name, (r) => String(r.id) === String(row.id));
        if (existing) { store.update(name, row.id, row); updated++; }
        else { store.insert(name, row); inserted++; }
      }
      out.push({ name, inserted, updated, skipped });
    }
    return out;
  });

  let total = 0;
  for (const s of summary) {
    total += s.inserted + s.updated;
    console.log(`   ${s.name}: +${s.inserted} جديد · ${s.updated} محدّث${s.skipped ? ` · ${s.skipped} متخطّى (بدون id)` : ''}`);
  }
  console.log(`✅ تم نقل ${total} صف فعليًا إلى ${store.MODE} — البيانات القديمة محفوظة (مفيش حذف).`);
})().catch((e) => {
  console.error('❌ فشل النقل:', e.message);
  process.exitCode = 1;
});
