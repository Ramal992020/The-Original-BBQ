/* Test-only Upstash REST emulator. Not a production database. */
'use strict';
const http = require('http');
const store = new Map();
const expires = new Map();
const controls = { offline: false, failCommits: 0, loseLease: false };
function get(key) {
  if (expires.has(key) && expires.get(key) <= Date.now()) { store.delete(key); expires.delete(key); }
  return store.has(key) ? store.get(key) : null;
}
function del(key) { const existed = store.delete(key); expires.delete(key); return existed ? 1 : 0; }
function execute(command) {
  const [op, ...args] = command.map(String);
  const [key, value] = args;
  switch (op.toUpperCase()) {
    case 'GET': return { result: get(key) };
    case 'SET': {
      const options = args.slice(2).map((x) => x.toUpperCase());
      if (options.includes('NX') && get(key) !== null) return { result: null };
      store.set(key, value); expires.delete(key);
      const px = options.indexOf('PX');
      if (px >= 0) expires.set(key, Date.now() + Number(options[px + 1]));
      return { result: 'OK' };
    }
    case 'MSET':
      for (let i = 0; i < args.length; i += 2) { store.set(args[i], args[i + 1]); expires.delete(args[i]); }
      return { result: 'OK' };
    case 'DEL': return { result: args.reduce((n, k) => n + del(k), 0) };
    case 'PEXPIRE':
      if (get(key) === null) return { result: 0 };
      expires.set(key, Date.now() + Number(value)); return { result: 1 };
    case 'KEYS': return { result: [...store.keys()].filter((k) => get(k) !== null) };
    case 'FLUSHALL': store.clear(); expires.clear(); return { result: 'OK' };
    case 'EVAL': {
      /* Emulate only the application's scripts; not a general Lua interpreter. */
      const script = args[0], count = Number(args[1]);
      const keys = args.slice(2, 2 + count), values = args.slice(2 + count);
      if (script.startsWith('-- BBQ_COMMIT')) {
        if (controls.failCommits > 0) { controls.failCommits--; return { error: 'ERR simulated durable write failure' }; }
        if (controls.loseLease) { controls.loseLease = false; del(keys[0]); }
        if (get(keys[0]) !== values[0]) return { result: 0 };
        for (let i = 1; i < keys.length; i++) { store.set(keys[i], values[i]); expires.delete(keys[i]); }
        del(keys[0]); return { result: 1 };
      }
      if (script.startsWith('-- BBQ_RELEASE')) return { result: get(keys[0]) === values[0] ? del(keys[0]) : 0 };
      if (script.startsWith('-- BBQ_RENEW')) {
        if (get(keys[0]) !== values[0]) return { result: 0 };
        expires.set(keys[0], Date.now() + Number(values[1])); return { result: 1 };
      }
      return { error: 'ERR unsupported test script' };
    }
    default: return { error: 'ERR unknown command ' + op };
  }
}
function createServer() {
  return http.createServer((req, res) => {
    const body = [];
    req.on('data', (chunk) => body.push(chunk));
    req.on('end', () => {
      if (controls.offline) { res.writeHead(503); return res.end('Database offline'); }
      if (!(req.headers.authorization || '').startsWith('Bearer ')) {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'unauthorized' }));
      }
      let commands;
      try { commands = JSON.parse(Buffer.concat(body).toString()); }
      catch { res.writeHead(400); return res.end('Invalid JSON'); }
      const pipeline = Array.isArray(commands[0]);
      const result = (pipeline ? commands : [commands]).map(execute);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(pipeline ? result : result[0]));
    });
  });
}
function start(port = 4599) {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
module.exports = { start, createServer, store, controls };
if (require.main === module) {
  start(Number(process.env.PORT || 4599)).then((server) => console.log('🧪 Test-only Upstash emulator on ' + server.address().port));
}
