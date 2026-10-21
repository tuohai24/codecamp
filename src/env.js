'use strict';
/**
 * 极简 .env 加载器（零依赖）
 * 只在环境变量为空时填充，命令行 / systemd 里显式设置的值优先。
 */
const fs = require('node:fs');
const path = require('node:path');

function loadEnv(file) {
  const target = file || path.join(__dirname, '..', '.env');
  let text;
  try {
    text = fs.readFileSync(target, 'utf8');
  } catch {
    return {};
  }
  const loaded = {};
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(s);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
      loaded[key] = val;
    }
  }
  return loaded;
}

module.exports = { loadEnv };
