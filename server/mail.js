'use strict';
/* Password recovery must not claim to send real mail when no provider is set up. */
const OUTBOX = [];
const consoleAllowed = () => process.env.ALLOW_CONSOLE_MAIL === '1'
  && process.env.NODE_ENV !== 'production' && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME;
const configured = () => !!process.env.RESEND_API_KEY || consoleAllowed();

async function send({ to, subject, text, html }) {
  if (!configured()) return { ok: false, via: 'none' };
  const msg = { to, subject, text, html, at: new Date().toISOString() };
  OUTBOX.unshift(msg);
  if (OUTBOX.length > 50) OUTBOX.pop();
  if (process.env.RESEND_API_KEY) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.RESEND_API_KEY },
        body: JSON.stringify({ from: process.env.MAIL_FROM || 'onboarding@resend.dev', to: [to], subject, text }),
      });
      if (res.ok) return { ok: true, via: 'resend' };
      console.warn('[mail] Resend failed:', res.status);
    } catch { console.warn('[mail] Email delivery failed'); }
    finally { clearTimeout(timeout); }
    return { ok: false, via: 'resend' };
  }
  console.log('\n📧 رسالة اختبار فقط (لا تُرسل لبريد حقيقي):', to, subject, text);
  return { ok: true, via: 'console' };
}
module.exports = { send, configured, outbox: () => OUTBOX.slice(0, 20) };
