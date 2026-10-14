/* ============================================================================
   imagekit.js — رفع الصور ومعالجتها
   ----------------------------------------------------------------------------
   بيرفع الصور في مجلد uploads/ ويرجّع رابط، وبيضغطها لو مكتبات jpeg-js/pngjs
   متاحة (مش إلزامية — التطبيق بيشتغل من غيرها، بس بيحفظ الصورة زي ما هي).
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');

let jpeg = null, PNG = null;
try { jpeg = require('jpeg-js'); } catch { /* مش متاحة */ }
try { PNG = require('pngjs').PNG; } catch { /* مش متاحة */ }

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
};

/* ------------------------- قراءة multipart/form-data ----------------------- */
function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return { fields: {}, files: [] };
  const boundary = Buffer.from('--' + (m[1] || m[2]).trim());
  const fields = {}, files = [];
  let pos = buffer.indexOf(boundary);
  while (pos >= 0) {
    const start = pos + boundary.length;
    const next = buffer.indexOf(boundary, start);
    if (next < 0) break;
    const chunk = buffer.slice(start, next);
    const headerEnd = chunk.indexOf('\r\n\r\n');
    if (headerEnd > 0) {
      const head = chunk.slice(0, headerEnd).toString('utf8');
      const body = chunk.slice(headerEnd + 4, chunk.length - 2);  // نشيل \r\n الأخيرة
      const nameM = /name="([^"]*)"/i.exec(head);
      const fileM = /filename="([^"]*)"/i.exec(head);
      const typeM = /Content-Type:\s*([^\r\n]+)/i.exec(head);
      const name = nameM ? nameM[1] : '';
      if (fileM) files.push({ field: name, filename: fileM[1], type: (typeM ? typeM[1] : 'application/octet-stream').trim(), data: body });
      else if (name) fields[name] = body.toString('utf8');
    }
    pos = next;
  }
  return { fields, files };
}

/* ------------------------------ ضغط الصورة -------------------------------- */
function resizeJpeg(buf, maxSide = 1400, quality = 82) {
  if (!jpeg) return buf;
  try {
    const raw = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 512 });
    const { width, height } = raw;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    if (scale >= 1) return jpeg.encode({ data: raw.data, width, height }, quality).data;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(height - 1, Math.floor(y / scale));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(width - 1, Math.floor(x / scale));
        const si = (sy * width + sx) * 4, di = (y * w + x) * 4;
        out[di] = raw.data[si]; out[di + 1] = raw.data[si + 1]; out[di + 2] = raw.data[si + 2]; out[di + 3] = 255;
      }
    }
    return jpeg.encode({ data: out, width: w, height: h }, quality).data;
  } catch { return buf; }
}
function resizePng(buf, maxSide = 1400) {
  if (!PNG) return buf;
  try {
    const png = PNG.sync.read(buf);
    const scale = Math.min(1, maxSide / Math.max(png.width, png.height));
    if (scale >= 1) return buf;
    const w = Math.round(png.width * scale), h = Math.round(png.height * scale);
    const out = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) {
      const sy = Math.min(png.height - 1, Math.floor(y / scale));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(png.width - 1, Math.floor(x / scale));
        const si = (png.width * sy + sx) << 2, di = (w * y + x) << 2;
        out.data[di] = png.data[si]; out.data[di + 1] = png.data[si + 1];
        out.data[di + 2] = png.data[si + 2]; out.data[di + 3] = png.data[si + 3];
      }
    }
    return PNG.sync.write(out, { colorType: 6 });
  } catch { return buf; }
}

/* حفظ ملف في التخزين السحابي (وضع Vercel) → بيتخزن في مجموعتنا ونخدمه من /api/img/:id */
function saveToDb(data, mime, prefix = 'up') {
  const id = `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  const rows = store.all('files').slice();
  rows.push({ id, mime, size: data.length, b64: data.toString('base64'), at: new Date().toISOString() });
  store.write('files', rows.slice(-300));      // بنحتفظ بآخر ٣٠٠ ملف
  return { url: '/api/img/' + id, bytes: data.length };
}

/* حفظ صورة مرفوعة → يرجّع الرابط النسبي */
function saveUpload(file, { prefix = 'up' } = {}) {
  const ext = (path.extname(file.filename || '').slice(1) || 'jpg').toLowerCase();
  const safeExt = MIME[ext] ? ext : 'jpg';
  let data = file.data;
  if (safeExt === 'jpg' || safeExt === 'jpeg') data = resizeJpeg(data, 1200, 80);
  else if (safeExt === 'png') data = resizePng(data, 1200);

  /* قاعدة سحابية/سيرفرلس: مفيش قرص ثابت — بنخزن في قاعدة البيانات نفسها */
  if (store.MODE !== 'file' || store.IS_SERVERLESS) return saveToDb(data, MIME[safeExt] || 'image/jpeg', prefix);

  const name = `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${safeExt}`;
  fs.writeFileSync(path.join(store.UPLOAD_DIR, name), data);
  return { url: '/uploads/' + name, bytes: data.length };
}

/* حفظ صورة جاية base64 (من مولّد الصور مثلًا) */
function saveBase64(b64, mimeHint = 'image/png') {
  const m = /^data:(image\/[a-z+]+);base64,(.*)$/i.exec(String(b64).trim());
  const mime = m ? m[1] : mimeHint;
  const payload = Buffer.from(m ? m[2] : String(b64), 'base64');
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg';
  const data = ext === 'jpg' ? resizeJpeg(payload, 1200, 80) : ext === 'png' ? resizePng(payload, 1200) : payload;

  if (store.MODE !== 'file' || store.IS_SERVERLESS) return saveToDb(data, mime, 'ai');

  const name = `ai-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(store.UPLOAD_DIR, name), data);
  return { url: '/uploads/' + name, bytes: data.length };
}

/* قراءة ملف مخزّن في قاعدة البيانات (وضع Vercel) */
function getFile(id) {
  const row = store.find('files', (f) => f.id === id);
  if (!row) return null;
  return { buffer: Buffer.from(row.b64, 'base64'), mime: row.mime, size: row.size };
}

module.exports = { MIME, parseMultipart, saveUpload, saveBase64, getFile, resizeJpeg, resizePng };
