/* ============================================================================
   Test-only Supabase/PostgREST emulator for the bbq_* RPC surface.
   Not a production database — it exists so the full order cycle can be tested
   locally with the exact same request/response contract as supabase/migrations.
   Controls mirror tools/fake-upstash.js: offline / failCommits / loseLease.
   ========================================================================== */
'use strict';
const http = require('http');

/* collection → Map(id → { seq, data }) preserving insertion order */
const tables = new Map();
let seqCounter = 0;
const controls = { offline: false, failCommits: 0, loseLease: false, requireAuth: true };

function table(name) {
  if (!tables.has(name)) tables.set(name, new Map());
  return tables.get(name);
}

function rowsOf(name) {
  return [...table(name).values()].sort((a, b) => a.seq - b.seq).map((r) => r.data);
}

function loadCollections() {
  const out = {};
  for (const name of tables.keys()) {
    const rows = rowsOf(name);
    if (rows.length) out[name] = rows;
  }
  return out;
}

/* ---- lock (mirrors bbq_lock + bbq_try_lock/renew/release) ---- */
let lockRow = null; // { token, expiresAt }

const lockAlive = () => !!lockRow && lockRow.expiresAt > Date.now();

function tryLock(token, ttlMs) {
  if (!token) return false;
  if (lockRow && lockRow.expiresAt > Date.now() && lockRow.token !== token) return false;
  lockRow = { token, expiresAt: Date.now() + Number(ttlMs || 60000) };
  return true;
}
function renewLock(token, ttlMs) {
  if (!lockRow || lockRow.token !== token || lockRow.expiresAt <= Date.now()) return false;
  lockRow.expiresAt = Date.now() + Number(ttlMs || 60000);
  return true;
}
function releaseLock(token) {
  if (lockRow && lockRow.token === token) { lockRow = null; return true; }
  return false;
}

/* ---- unique constraints (same guarantees as the SQL indexes) ---- */
function assertUnique(collection, staged) {
  const seen = new Map();
  for (const row of staged.values()) {
    const d = row.data;
    const keyOf = (() => {
      if (collection === 'users' && d.email) return ['email', String(d.email).toLowerCase()];
      if (collection === 'orders' && d.number != null) return ['number', String(d.number)];
      if (collection === 'orders' && d.requestId) return ['request', String(d.user_id) + '|' + String(d.requestId)];
      if (collection === 'sessions' && d.tokenHash) return ['token', String(d.tokenHash)];
      return null;
    })();
    if (!keyOf) continue;
    const [label, value] = keyOf;
    if (seen.has(value)) {
      const e = new Error(`duplicate key value violates unique constraint (${collection}.${label})`);
      e.status = 409;
      e.code = '23505';
      throw e;
    }
    seen.set(value, String(row.id));
  }
}

/** Atomic commit: validate everything first, then apply — never partial. */
function commit(token, upserts, deletes) {
  if (controls.loseLease) { controls.loseLease = false; lockRow = null; }
  if (!lockRow || lockRow.token !== token || lockRow.expiresAt <= Date.now()) return false;

  /* stage first (deep copies so a failed commit leaves nothing behind) */
  const staged = new Map();
  const getStaged = (name) => {
    if (!staged.has(name)) staged.set(name, new Map(table(name)));
    return staged.get(name);
  };

  for (const [name, rows] of Object.entries(upserts || {})) {
    if (!Array.isArray(rows)) { const e = new Error('upserts must be arrays'); e.status = 400; throw e; }
    for (const row of rows) {
      const id = row && row.id != null ? String(row.id) : '';
      if (!id) { const e = new Error('bbq: row missing id'); e.status = 400; throw e; }
      const map = getStaged(name);
      const prev = map.get(id);
      map.set(id, { seq: prev ? prev.seq : ++seqCounter, data: JSON.parse(JSON.stringify(row)) });
    }
  }
  for (const [name, ids] of Object.entries(deletes || {})) {
    if (!Array.isArray(ids)) { const e = new Error('deletes must be arrays'); e.status = 400; throw e; }
    const map = getStaged(name);
    for (const id of ids) map.delete(String(id));
  }

  /* constraints against the staged state, then apply */
  for (const [name, map] of staged) assertUnique(name, map);
  for (const [name, map] of staged) tables.set(name, map);

  lockRow = null;
  return true;
}

/* ---- HTTP: PostgREST-style /rest/v1/rpc/<fn> ---- */
function handleRpc(name, args) {
  switch (name) {
    case 'bbq_ping': return 'pong';
    case 'bbq_load': return loadCollections();
    case 'bbq_try_lock': return tryLock(args.p_token, args.p_ttl_ms);
    case 'bbq_renew_lock': return renewLock(args.p_token, args.p_ttl_ms);
    case 'bbq_release_lock': return releaseLock(args.p_token);
    case 'bbq_commit': {
      if (controls.failCommits > 0) {
        controls.failCommits--;
        const e = new Error('simulated durable write failure');
        e.status = 500;
        throw e;
      }
      return commit(args.p_token, args.p_upserts, args.p_deletes);
    }
    default: {
      const e = new Error(`function public.${name} does not exist`);
      e.status = 404;
      throw e;
    }
  }
}

function createServer() {
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const send = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (controls.offline) return send(503, { message: 'Database offline' });
      if (controls.requireAuth) {
        const auth = String(req.headers.authorization || '');
        if (!req.headers.apikey || !auth.startsWith('Bearer ') || auth.length < 15) {
          return send(401, { message: 'Unauthorized: provide a valid service key' });
        }
      }
      const m = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(req.url || '');
      if (!m) return send(404, { message: 'Not found' });
      let args = {};
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        args = raw ? JSON.parse(raw) : {};
      } catch { return send(400, { message: 'Invalid JSON body' }); }
      try {
        send(200, handleRpc(m[1], args));
      } catch (e) {
        send(e.status || 500, { code: e.code || 'PGRST202', message: e.message });
      }
    });
  });
}

function start(port = 0) {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function reset() {
  tables.clear();
  seqCounter = 0;
  lockRow = null;
  controls.offline = false;
  controls.failCommits = 0;
  controls.loseLease = false;
}

module.exports = { start, createServer, tables, controls, reset, loadCollections, rowsOf, lockAlive };
if (require.main === module) {
  start(Number(process.env.PORT || 4598)).then((server) => console.log('🧪 Test-only Supabase emulator on ' + server.address().port));
}
