/* ============================================================================
   mail.js — إرسال الإيميلات (استعادة كلمة السر)
   ----------------------------------------------------------------------------
   افتراضيًا بيطبع الرسالة في الـconsole (طريقة "console transport") عشان
   التطبيق يشتغل بدون أي إعدادات. لو حبيت إيميل حقيقي:
     ضيف متغيرات البيئة دي وشغّل السيرفر:
       SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=you@gmail.com SMTP_PASS=... MAIL_FROM="BBQ <you@gmail.com>"
   (الربط الحقيقي بـ SMTP بيتم من nodemailer — بديل بسيط: خدمة Resend/Twilio عبر fetch).
   ========================================================================== */
'use strict';

const OUTBOX = [];   // آخر الرسائل المرسلة (للمعاينة من لوحة الإدارة لو حبيت)

async function send({ to, subject, text, html }) {
  const msg = { to, subject, text, html, at: new Date().toISOString() };
  OUTBOX.unshift(msg);
  if (OUTBOX.length > 50) OUTBOX.pop();

  if (process.env.RESEND_API_KEY) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.RESEND_API_KEY },
        body: JSON.stringify({ from: process.env.MAIL_FROM || 'onboarding@resend.dev', to: [to], subject, text }),
      });
      if (r.ok) return { ok: true, via: 'resend' };
      console.warn('[mail] Resend فشل:', r.status);
    } catch (e) { console.warn('[mail] Resend خطأ:', e.message); }
  }

  console.log('\n📧 ===== رسالة (console transport) =====');
  console.log('إلى:', to);
  console.log('الموضوع:', subject);
  console.log(text);
  console.log('=======================================\n');
  return { ok: true, via: 'console' };
}

const outbox = () => OUTBOX.slice(0, 20);

module.exports = { send, outbox };
