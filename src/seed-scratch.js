'use strict';
/**
 * 为演示作品生成官方 Scratch 3 作品包（.sb3）。
 * 依赖 public/assets/library 下的内置角色素材（由 seed-assets.js 写入）。
 */
const fs = require('node:fs');
const path = require('node:path');
const { db, DATA_DIR, ROOT } = require('./db');
const { demoProject } = require('./sb3');

const SB3_DIR = path.join(DATA_DIR, 'sb3');
const LIB_DIR = path.join(ROOT, 'public', 'assets', 'library');

const FALLBACK_CAT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<ellipse cx="50" cy="90" rx="26" ry="5" fill="rgba(0,0,0,.12)"/>
<ellipse cx="50" cy="56" rx="27" ry="24" fill="#ffb35c"/>
<circle cx="40" cy="50" r="4.5" fill="#2b2b2b"/><circle cx="60" cy="50" r="4.5" fill="#2b2b2b"/>
<path d="M47 61 h6 l-3 4 z" fill="#ff6b81"/>
</svg>`;

function catSvgText() {
  const catPath = path.join(LIB_DIR, 'cat.svg');
  return fs.existsSync(catPath) ? fs.readFileSync(catPath, 'utf8') : FALLBACK_CAT;
}

/** 新作品的起始工程：一只小猫 + 天空背景，没有任何积木 */
function starterSb3() {
  const file = path.join(SB3_DIR, '_starter.sb3');
  if (!fs.existsSync(file)) fs.writeFileSync(file, demoProject(catSvgText(), false));
  return fs.readFileSync(file);
}

function ensureSeedSb3() {
  fs.mkdirSync(SB3_DIR, { recursive: true });
  starterSb3();
  const rows = db.prepare("SELECT id, data FROM projects WHERE type = 'scratch'").all();
  for (const r of rows) {
    let d = {};
    try {
      d = JSON.parse(r.data || '{}');
    } catch {}
    if (d.seed !== 'demo') continue;
    const file = path.join(SB3_DIR, `${r.id}.sb3`);
    if (fs.existsSync(file)) continue;
    const buf = demoProject(catSvgText(), true);
    fs.writeFileSync(file, buf);
    db.prepare('UPDATE projects SET data = ? WHERE id = ?').run(JSON.stringify({ format: 'sb3', size: buf.length }), r.id);
  }
}

module.exports = { ensureSeedSb3, starterSb3, SB3_DIR };
