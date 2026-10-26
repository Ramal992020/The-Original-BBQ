/* ============================================================================
   ai.js — مولّد صور الطعام للأصناف
   ----------------------------------------------------------------------------
   1) لو فيه مفتاح API في متغيرات البيئة (GEMINI_API_KEY أو OPENAI_API_KEY)
      → بيولّد صورة جديدة فعلية للصنف من وصفه.
   2) لو مفيش مفتاح → "مطابقة ذكية": بيختار أنسب صورة من مكتبة الصور المولّدة
      المرفقة مع التطبيق حسب اسم الصنف وتصنيفه.
   3) آخر حل: صورة SVG بسيطة بالاسم.

   الناتج دايمًا: مسار صورة محلي (مش رابط خارجي) — يعني مضمون إنه يشتغل،
   وقابل للتغيير يدويًا بعد كده من لوحة الإدارة.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const imagekit = require('./imagekit');

const IMG_DIR = path.join(__dirname, '..', 'public', 'img');

/* كلمات مفتاحية عربي/إنجليزي → أنسب صورة */
const POOL = [
  { file: 'ai-potatoroll.jpg', kw: ['رول بطاطس', 'بطاطس توابل', 'بطاطس شيدر', 'بطاطس كاتشب'] },
  { file: 'ai-fries.jpg',      kw: ['بطاطس', 'فرايز', 'لوديد', 'ميكس جبن', 'توابل', 'باربكيو', 'شيدر'] },
  { file: 'ai-chicken.jpg',    kw: ['تشيكن', 'فراخ', 'زنجر', 'كنتاك', 'رانش', 'مارشملو', 'ستربس فرايز', 'chicken'] },
  { file: 'ai-smash.jpg',      kw: ['سماش', 'smashed', 'smash', 'دابل', 'تربل', 'سنجل', 'مشروم', 'إيطاليانو', 'سوبريم'] },
  { file: 'ai-charcoal.jpg',   kw: ['فحم', 'charcoal', 'برجر', 'burger', 'برجر لحم'] },
  { file: 'ai-rolls.jpg',      kw: ['رول', 'ساندوتش', 'شيش', 'طاووق', 'صدور', 'كفتة', 'كبدة', 'طرب', 'لحمة', 'هوت دوج', 'سجق', 'wrap', 'roll'] },
  { file: 'ai-offers.jpg',     kw: ['عرض', 'كومبو', 'combo', 'offer'] },
  { file: 'ai-meals.jpg',      kw: ['وجبة', 'ميكس', 'جريل', 'meal', 'أرز'] },
];

const BUILTIN_POOL_FILES = new Set(POOL.map((p) => p.file));

const CATEGORY_HINT = {
  meals: 'ai-meals.jpg', rolls: 'ai-rolls.jpg', charcoal: 'ai-charcoal.jpg',
  chicken: 'ai-chicken.jpg', smash: 'ai-smash.jpg', rollpotato: 'ai-potatoroll.jpg',
  fries: 'ai-fries.jpg', offers: 'ai-offers.jpg',
};

function pickFromPool(name = '', desc = '', cat = '') {
  const text = `${name} ${desc}`;
  for (const p of POOL) {
    if (p.kw.some((k) => text.includes(k))) return p.file;
  }
  return CATEGORY_HINT[cat] || 'ai-meals.jpg';
}

function buildPrompt(item) {
  const kind = /برجر|سماش|burger/i.test(item.name) ? 'burger'
    : /رول|ساندوتش|شيش|كفتة|كبدة|hot ?dog|سجق|طرب|صدور/i.test(item.name) ? 'grilled wrap / kebab sandwich'
    : /بطاطس|فرايز|fries/i.test(item.name) ? 'loaded french fries'
    : 'Middle Eastern charcoal mixed grill meal';
  return `Professional appetizing food photography of ${kind}: ${item.name}. ${item.desc || ''} ` +
    `Plated on dark slate, warm moody restaurant lighting, steam, shallow depth of field, ` +
    `high detail, no text, no watermark.`;
}

/* ------------------------------ المزوّدون الحقيقيون ------------------------------ */
async function viaGemini(item) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(item) }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
  const j = await res.json();
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  const img = parts.find((p) => p.inlineData || p.inline_data);
  if (!img) return null;
  return (img.inlineData || img.inline_data).data;
}

async function viaOpenAI(item) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt: buildPrompt(item), size: '1024x1024', n: 1 }),
  });
  if (!res.ok) throw new Error('OpenAI HTTP ' + res.status);
  const j = await res.json();
  const d = j.data && j.data[0];
  return d && (d.b64_json || d.b64);
}

/* --------------------------- الصورة البديلة (SVG) --------------------------- */
function placeholderSvg(item) {
  const label = String(item.name || 'صنف').replace(/[<>&]/g, '');
  const cat = String(item.cat || '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#241a12"/><stop offset="1" stop-color="#121010"/></linearGradient></defs>
  <rect width="900" height="600" fill="url(#g)"/>
  <circle cx="450" cy="250" r="120" fill="none" stroke="#ff6b2c" stroke-width="10" opacity=".85"/>
  <circle cx="450" cy="250" r="82" fill="#ff6b2c" opacity=".18"/>
  <text x="450" y="272" font-size="96" text-anchor="middle" font-family="sans-serif">🔥</text>
  <text x="450" y="460" font-size="46" fill="#f6f0e9" text-anchor="middle" font-family="sans-serif">${label}</text>
  <text x="450" y="512" font-size="28" fill="#a89d94" text-anchor="middle" font-family="sans-serif">${cat}</text>
</svg>`;
  /* data URI — شغال في أي بيئة (قرص أو سيرفرلس) من غير أي ملفات */
  return {
    url: 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64'),
    source: 'placeholder', provider: 'placeholder',
  };
}

/* ------------------------------- الدالة الرئيسية ---------------------------- */
/**
 * يولّد/يختار صورة مناسبة لصنف.
 * @returns {{url:string, source:'ai'|'pool'|'placeholder', provider:string}}
 */
async function generateFoodImage(item) {
  // 1) مزوّد حقيقي لو المفتاح متاح
  for (const [name, fn] of [['gemini', viaGemini], ['openai', viaOpenAI]]) {
    try {
      const b64 = await fn(item);
      if (b64) {
        const saved = await imagekit.saveBase64(b64);
        return { url: saved.url, source: 'ai', provider: name };
      }
    } catch (e) {
      console.warn(`[ai] ${name} فشل: ${e.message} — هنجرّب البديل`);
    }
  }

  // 2) مطابقة ذكية من المكتبة المرفقة
  const file = pickFromPool(item.name, item.desc, item.cat);
  const src = path.join(IMG_DIR, file);
  if (BUILTIN_POOL_FILES.has(file) || fs.existsSync(src)) {
    return { url: '/img/' + file, source: 'pool', provider: 'built-in-library' };
  }

  // 3) آخر حل
  return placeholderSvg(item);
}

module.exports = { generateFoodImage, pickFromPool, buildPrompt, POOL, IMG_DIR };
