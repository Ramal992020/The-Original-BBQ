/* ============================================================================
   tools/fake-upstash.js — محاكي محلي لـ Upstash Redis REST
   ----------------------------------------------------------------------------
   ليه؟ عشان تجرّب تشغيل التطبيق في "وضع Vercel" (السيرفرلس) على جهازك،
   من غير ما تعمل حساب Upstash.

   التشغيل كأداة مستقلة:
     node tools/fake-upstash.js                       (بيسمع على 4599)
     وبعدين في تيرمنال تاني:
     STORAGE=redis UPSTASH_REDIS_REST_URL=http://127.0.0.1:4599 \
       UPSTASH_REDIS_REST_TOKEN=x VERCEL=1 npm start

   أو استخدمه جوه كود:  const { start } = require('./tools/fake-upstash'); await start(4599);
   ========================================================================== */
'use strict';
const http = require('http');

const store = new Map();   // ده "الريديس" الوهمي

function createServer() {
  return http.createServer((req, res) => {
    const body = [];
    req.on('data', (c) => body.push(c));
    req.on('end', () => {
      const auth = req.headers.authorization || '';
      if (!auth.startsWith('Bearer ')) {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'unauthorized' }));
      }
      let cmds = [];
      try { cmds = JSON.parse(Buffer.concat(body).toString() || '[]'); } catch { cmds = []; }

      const isPipeline = Array.isArray(cmds[0]);
      const list = isPipeline ? cmds : [cmds];
      const out = list.map((c) => {
        const [op, key, val] = c.map(String);
        if (op === 'SET') { store.set(key, val); return { result: 'OK' }; }
        if (op === 'GET') return { result: store.has(key) ? store.get(key) : null };
        if (op === 'DEL') { store.delete(key); return { result: 1 }; }
        if (op === 'KEYS') return { result: [...store.keys()] };
        if (op === 'PING') return { result: 'PONG' };          // لفحص الاتصال (tools/check-env.js)
        if (op === 'FLUSHALL') { store.clear(); return { result: 'OK' }; }
        return { error: 'unknown command ' + op };
      });

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(isPipeline ? out : out[0]));
    });
  });
}

/** يشغّل المحاكي على بورت معيّن → يرجّع promise بالسيرفر */
function start(port = 4599) {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(port, '127.0.0.1', () => resolve(s));
  });
}

module.exports = { start, createServer, store };

/* تشغيل مباشر من التيرمنال */
if (require.main === module) {
  start(Number(process.env.PORT || 4599)).then(() => console.log('🧪 محاكي Upstash شغال على 4599'));
}
