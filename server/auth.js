/* Accounts, hashed passwords, sessions and roles are enforced on the server. */
'use strict';
const crypto = require('crypto');
const store = require('./store');

const ROLES = ['customer', 'supervisor', 'admin'];
const SESSION_DAYS = 30;
const OWNER_EMAIL = String(process.env.ADMIN_EMAIL || 'aliielramal@gmail.com').trim().toLowerCase();
const DEMO_OPEN = process.env.DEMO_LOGIN === '1' && process.env.SEED_DEMO === '1'
  && process.env.NODE_ENV !== 'production' && !store.IS_SERVERLESS;
const validPassword = (password) => typeof password === 'string' && password.length >= 6 && password.length <= 128;
const validEmail = (email) => typeof email === 'string' && email.length <= 254 && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') };
}
function verifyPassword(password, salt, hash) {
  if (typeof password !== 'string' || password.length > 128 || !salt || !/^[a-f0-9]{128}$/i.test(hash || '')) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === test.length && crypto.timingSafeEqual(test, expected);
}
const publicUser = (u) => u && ({
  id: u.id, name: u.name, email: u.email, phone: u.phone || '',
  address: u.address || '', area: u.area || '', role: u.role,
  isOwner: u.isOwner === true, active: u.active !== false, createdAt: u.createdAt,
  notifyWhatsapp: u.notifyWhatsapp !== false,
});
const byEmail = (email) => store.find('users', (u) => u.email.toLowerCase() === String(email || '').trim().toLowerCase());
const byId = (id) => store.find('users', (u) => String(u.id) === String(id));

function createUser({ name, email, password, passwordHash, role = 'customer', isOwner = false }) {
  if (byEmail(email)) throw new Error('Duplicate account');
  const { salt, hash } = passwordHash || hashPassword(password);
  return store.insert('users', {
    id: store.uid(), name: String(name || '').trim(), email: String(email || '').trim().toLowerCase(),
    phone: '', address: '', area: '', salt, hash,
    role: ROLES.includes(role) ? role : 'customer', isOwner: !!isOwner,
    active: true, createdAt: new Date().toISOString(),
  });
}

/** Provision/migrate the restaurant owner once; NEVER reset a changed password on restart. */
function bootstrapOwner() {
  const configError = (message) => Object.assign(new Error(message), { code: 'OWNER_NOT_CONFIGURED' });
  if (!validEmail(OWNER_EMAIL)) throw configError('ADMIN_EMAIL is invalid');
  const owner = byEmail(OWNER_EMAIL);
  if (owner?.isOwner === true && owner.role === 'admin') return owner;
  const existingOwner = store.find('users', (u) => u.isOwner === true);
  if (existingOwner) throw configError('ADMIN_EMAIL differs from the existing owner. Keep the configured owner email.');
  let passwordHash;
  if (process.env.ADMIN_PASSWORD_HASH) {
    const [salt, hash, extra] = process.env.ADMIN_PASSWORD_HASH.split(':');
    if (!/^[a-f0-9]{32}$/i.test(salt || '') || !/^[a-f0-9]{128}$/i.test(hash || '') || extra !== undefined) {
      throw configError('ADMIN_PASSWORD_HASH must be a scrypt salt:hash');
    }
    passwordHash = { salt, hash };
  } else if (validPassword(process.env.ADMIN_PASSWORD)) {
    passwordHash = hashPassword(process.env.ADMIN_PASSWORD);
  } else {
    const e = new Error('Set ADMIN_PASSWORD (or ADMIN_PASSWORD_HASH) privately in .env / hosting settings to create the restaurant owner');
    e.code = 'OWNER_NOT_CONFIGURED';
    throw e;
  }
  if (owner) {
    /* An existing customer with that address cannot retain a privileged session. */
    store.write('sessions', store.all('sessions').filter((s) => s.userId !== owner.id));
    return store.update('users', owner.id, {
      ...passwordHash, role: 'admin', isOwner: true, active: true, name: 'صاحب المطعم',
    });
  }
  const created = createUser({ name: 'صاحب المطعم', email: OWNER_EMAIL, passwordHash, role: 'admin', isOwner: true });
  console.log('👤 تم تجهيز حساب صاحب المطعم (بدون نشر كلمة السر)');
  return created;
}

const tokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
function createSession(user, meta = {}) {
  const token = store.token();
  store.write('sessions', store.all('sessions').filter((s) => s.expiresAt > Date.now()));
  const session = store.insert('sessions', {
    id: store.uid(), tokenHash: tokenHash(token), userId: user.id,
    createdAt: Date.now(), expiresAt: Date.now() + SESSION_DAYS * 864e5,
    ua: String(meta.ua || '').slice(0, 300),
  });
  return { ...session, token };  // Only the hash is stored in the database.
}
function requestToken(req) {
  const header = req.headers.authorization || '';
  let token = header.startsWith('Bearer ') ? header.slice(7).trim() : (req.headers['x-token'] || '');
  if (!token) {
    /* EventSource cannot send an Authorization header. Only this route accepts a URL token. */
    try {
      const url = new URL(req.url, 'http://x');
      const route = url.searchParams.get('__path');
      if (url.pathname === '/api/events' || route === 'events') token = url.searchParams.get('token') || '';
    } catch {}
  }
  return token;
}
const sessionMatches = (s, token) => s.tokenHash === tokenHash(token) || s.token === token; // Existing sessions migrate on login.
function sessionUser(req) {
  const token = requestToken(req);
  if (!token || token.length > 256) return null;
  const s = store.find('sessions', (row) => sessionMatches(row, token) && row.expiresAt > Date.now());
  if (!s) return null;
  const user = byId(s.userId);
  return user && user.active !== false ? user : null;
}
function destroySession(req) {
  const token = requestToken(req);
  if (token) store.write('sessions', store.all('sessions').filter((s) => !sessionMatches(s, token)));
}
function changePassword(user, password) {
  const updated = store.update('users', user.id, { ...hashPassword(password), passwordChangedAt: new Date().toISOString() });
  store.write('sessions', store.all('sessions').filter((s) => String(s.userId) !== String(user.id)));
  return updated;
}

function resetToken(email) {
  const user = byEmail(email);
  if (!user || user.active === false) return null;
  const token = store.token();
  store.write('password_reset_tokens', store.all('password_reset_tokens').filter((t) => !t.used && t.expiresAt > Date.now() && t.userId !== user.id));
  store.insert('password_reset_tokens', {
    id: store.uid(), tokenHash: tokenHash(token), userId: user.id, expiresAt: Date.now() + 36e5, used: false,
  });
  return { token, user };
}
function consumeResetToken(token, newPassword) {
  const t = store.find('password_reset_tokens', (row) => sessionMatches(row, token) && !row.used && row.expiresAt > Date.now());
  if (!t) return null;
  const user = byId(t.userId);
  if (!user || user.active === false) return null;
  const updated = changePassword(user, newPassword);
  store.update('password_reset_tokens', t.id, { used: true });
  return updated;
}
const isStaff = (u) => !!u && (u.role === 'admin' || u.role === 'supervisor');
const isAdmin = (u) => !!u && u.role === 'admin';
function demoLogin() {
  if (!DEMO_OPEN) return null;
  const user = byId(process.env.DEMO_USER_ID) || byEmail('demo@bbq.app');
  return user?.role === 'customer' && user.active !== false ? user : null;
}

/* Persist login throttling too, so another warm worker cannot bypass it. */
const ATTEMPT_WINDOW = 15 * 60000;
function tooManyAttempts(email) {
  const attempt = store.find('login_attempts', (a) => a.id === email);
  return !!attempt && Date.now() - attempt.at < ATTEMPT_WINDOW && attempt.n >= 8;
}
function noteAttempt(email, ok) {
  const live = store.all('login_attempts').filter((a) => Date.now() - a.at < ATTEMPT_WINDOW);
  const old = live.find((a) => a.id === email);
  store.write('login_attempts', [
    ...live.filter((a) => a.id !== email),
    ...(ok ? [] : [{ id: email, n: (old?.n || 0) + 1, at: old?.at || Date.now() }]),
  ]);
}

module.exports = {
  ROLES, OWNER_EMAIL, DEMO_OPEN, validPassword, validEmail, hashPassword, verifyPassword,
  publicUser, byEmail, byId, createUser, bootstrapOwner, createSession, sessionUser,
  destroySession, changePassword, resetToken, consumeResetToken,
  isStaff, isAdmin, demoLogin, tooManyAttempts, noteAttempt,
};
