'use strict';
/* Local secrets stay in the ignored .env file. Hosting environment variables win. */
const fs = require('fs');
const path = require('path');

function load() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.BBQ_ENV_FILE === '') return;
  const file = process.env.BBQ_ENV_FILE || path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
    let value = match[2];
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const end = value.lastIndexOf(quote);
      if (end < 1) throw new Error('Invalid quoted value in local .env: ' + match[1]);
      value = value.slice(1, end);
      if (quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    } else { value = value.replace(/\s+#.*$/, '').trim(); }
    process.env[match[1]] = value;
  }
}
module.exports = { load };
