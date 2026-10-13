/* ============================================================================
   auth.js — الحسابات والجلسات والصلاحيات (كلها على السيرفر)
   ----------------------------------------------------------------------------
   - كلمات السر بتتخزن مشفّرة بـ scrypt + salt (مش نص عادي أبدًا).
   - الجلسة بتتبقى شغالة 30 يوم عن طريق token في هيدر Authorization.
   - الصلاحيات بتتفحص هنا على السيرفر — إخفاء الأزرار في الواجهة شكلي فقط.
   ========================================================================== */
'use strict';
const crypto = require('crypto');
const store = require('./store');

const ROLES = ['customer', 'supervisor', 'admin'];
const SESSION_DAYS = 30;

/* ------------------------------- كلمات السر ------------------------------- */
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(test, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* --------------------------------- المستخدمون ------------------------------ */
const publicUser = (u) => u && ({
  id: u.id, name: u.name, email: u.email, phone: u.phone || '',
  address: u.address || '', area: u.area || '',
  role: u.role, active: u.active !== false, createdAt: u.createdAt,
  notifyWhatsapp: u.notifyWhatsapp !== false,   // موافق يستقبل تحديثات الطلب على واتساب
});

const byEmail = (email) => store.find('users', (u) => u.email.toLowerCase() === String(email || '').trim().toLowerCase());
const byId = (id) => store.find('users', (u) => String(u.id) === String(id));

/* أي مستخدم جديد = Customer تلقائيًا */
function createUser({ name, email, password, role = 'customer' }) {
  const { salt, hash } = hashPassword(password);
  return store.insert('users', {
    id: store.uid(),
    name: String(name || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    phone: '', address: '', area: '',
    salt, hash,
    role: ROLES.includes(role) ? role : 'customer',
    active: true,
    createdAt: new Date().toISOString(),
  });
}

/* --------------------------------- الجلسات -------------------------------- */
function createSession(user, meta = {}) {
  return store.insert('sessions', {
    token: store.token(),
    userId: user.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DAYS * 864e5,
    ua: meta.ua || '',
  });
}
function sessionUser(req) {
  const auth = req.headers['authorization'] || '';
  let tk = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (req.headers['x-token'] || '');
  if (!tk) {
    /* EventSource (SSE) مش بيقدر يبعت هيدرز — فبنقبل التوكن في الرابط كمان */
    try { tk = new URL(req.url, 'http://x').searchParams.get('token') || ''; } catch { tk = ''; }
  }
  if (!tk) return null;
  const s = store.find('sessions', (x) => x.token === tk && x.expiresAt > Date.now());
  if (!s) return null;
  const u = byId(s.userId);
  if (!u || u.active === false) return null;      // الحساب المعطَّل مايفتحش
  return u;
}
function destroySession(req) {
  const tk = (req.headers['authorization'] || '').replace('Bearer ', '').trim() || (req.headers['x-token'] || '');
  if (!tk) return;
  store.write('sessions', store.all('sessions').filter((s) => s.token !== tk));
}

/* ------------------------------- استعادة السر ----------------------------- */
function resetToken(email) {
  const u = byEmail(email);
  if (!u) return null;                                   // من غير ما نفضح إن الإيميل مش موجود
  const t = { id: store.uid(), token: store.token(), userId: u.id, expiresAt: Date.now() + 36e5, used: false };
  store.insert('password_reset_tokens', t);
  return { token: t.token, user: u };
}
function consumeResetToken(tk, newPassword) {
  const t = store.find('password_reset_tokens', (x) => x.token === tk && !x.used && x.expiresAt > Date.now());
  if (!t) return null;
  const u = byId(t.userId);
  if (!u) return null;
  const { salt, hash } = hashPassword(newPassword);
  store.update('users', u.id, { salt, hash });
  store.update('password_reset_tokens', t.id, { used: true });
  store.write('sessions', store.all('sessions').filter((s) => String(s.userId) !== String(u.id)));  // اطرد الجلسات القديمة
  return u;
}

/* -------------------------------- الصلاحيات ------------------------------- */
const isStaff = (u) => !!u && (u.role === 'admin' || u.role === 'supervisor');
const isAdmin = (u) => !!u && u.role === 'admin';

/* حماية شكلية للتجربة السريعة (login: demo@bbq.app / demo) — تتقفل لو SENDBOX=0 */
const DEMO_OPEN = process.env.DEMO_LOGIN !== '0';
function demoLogin() {
  if (!DEMO_OPEN) return null;
  const u = byId(process.env.DEMO_USER_ID) || store.find('users', (x) => x.email === 'demo@bbq.app');
  return u && u.active !== false ? u : null;
}

/* حماية من تكرار محاولات الدخول */
const attempts = new Map();
function tooManyAttempts(key) {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.at > 15 * 60000) { attempts.delete(key); return false; }
  return a.n >= 8;
}
function noteAttempt(key, ok) {
  if (ok) { attempts.delete(key); return; }
  const a = attempts.get(key) || { n: 0, at: Date.now() };
  a.n += 1; a.at = Date.now();
  attempts.set(key, a);
}

module.exports = {
  ROLES, hashPassword, verifyPassword, publicUser, byEmail, byId, createUser,
  createSession, sessionUser, destroySession, resetToken, consumeResetToken,
  isStaff, isAdmin, demoLogin, tooManyAttempts, noteAttempt,
};
