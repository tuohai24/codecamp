'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { db, now, ROOT } = require('./db');

const LIB_DIR = path.join(ROOT, 'public', 'assets', 'library');
fs.mkdirSync(LIB_DIR, { recursive: true });

const SPRITES = {
  cat: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<ellipse cx="50" cy="90" rx="26" ry="5" fill="rgba(0,0,0,.12)"/>
<path d="M28 42 L24 16 L46 30 Z" fill="#ff9f43"/><path d="M72 42 L76 16 L54 30 Z" fill="#ff9f43"/>
<path d="M31 40 L29 24 L43 33 Z" fill="#ffd6a5"/><path d="M69 40 L71 24 L57 33 Z" fill="#ffd6a5"/>
<ellipse cx="50" cy="56" rx="27" ry="24" fill="#ffb35c"/>
<ellipse cx="50" cy="68" rx="16" ry="12" fill="#fff3e0"/>
<circle cx="40" cy="50" r="4.5" fill="#2b2b2b"/><circle cx="60" cy="50" r="4.5" fill="#2b2b2b"/>
<circle cx="41.5" cy="48.5" r="1.6" fill="#fff"/><circle cx="61.5" cy="48.5" r="1.6" fill="#fff"/>
<path d="M47 61 h6 l-3 4 z" fill="#ff6b81"/>
<path d="M50 65 q-5 6 -10 2 M50 65 q5 6 10 2" stroke="#7a4a1e" stroke-width="1.6" fill="none" stroke-linecap="round"/>
<path d="M24 58 h10 M24 63 h10 M66 58 h10 M66 63 h10" stroke="#7a4a1e" stroke-width="1.4" stroke-linecap="round"/>
</svg>`,
  dog: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<ellipse cx="50" cy="91" rx="25" ry="5" fill="rgba(0,0,0,.12)"/>
<ellipse cx="50" cy="55" rx="26" ry="25" fill="#c68b59"/>
<ellipse cx="26" cy="52" rx="9" ry="16" fill="#8d5b33"/><ellipse cx="74" cy="52" rx="9" ry="16" fill="#8d5b33"/>
<ellipse cx="50" cy="68" rx="15" ry="12" fill="#f3ddc0"/>
<circle cx="41" cy="48" r="4" fill="#2b2b2b"/><circle cx="59" cy="48" r="4" fill="#2b2b2b"/>
<ellipse cx="50" cy="63" rx="6" ry="4.5" fill="#3b2a1e"/>
<path d="M50 67 v5 M50 72 q-6 5 -11 0 M50 72 q6 5 11 0" stroke="#3b2a1e" stroke-width="1.6" fill="none" stroke-linecap="round"/>
<path d="M44 78 q6 8 12 0" fill="#ff7b8a"/>
</svg>`,
  star: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<path d="M50 10 L62 38 L92 41 L69 61 L76 90 L50 74 L24 90 L31 61 L8 41 L38 38 Z" fill="#ffd93d" stroke="#f0a500" stroke-width="3" stroke-linejoin="round"/>
<circle cx="42" cy="48" r="3" fill="#7a5c00"/><circle cx="58" cy="48" r="3" fill="#7a5c00"/>
<path d="M44 58 q6 6 12 0" stroke="#7a5c00" stroke-width="2.4" fill="none" stroke-linecap="round"/>
</svg>`,
  rocket: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<path d="M50 6 q18 22 18 44 v14 H32 V50 Q32 28 50 6Z" fill="#e9eef5"/>
<path d="M50 6 q10 22 10 44 v14 H50Z" fill="#c9d4e2"/>
<circle cx="50" cy="42" r="9" fill="#4cc9f0" stroke="#8b98a8" stroke-width="3"/>
<path d="M32 52 L16 74 L32 68 Z" fill="#ff5c8a"/><path d="M68 52 L84 74 L68 68 Z" fill="#ff5c8a"/>
<path d="M42 66 h16 l-8 22 z" fill="#ffb703"/>
<path d="M46 66 h8 l-4 12 z" fill="#fff3b0"/>
</svg>`,
  ball: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><radialGradient id="b" cx="35%" cy="30%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f25c78"/></radialGradient></defs>
<circle cx="50" cy="52" r="36" fill="url(#b)"/>
<path d="M22 30 q28 22 56 0" stroke="#fff" stroke-width="4" fill="none" opacity=".8"/>
<path d="M20 66 q30 -22 60 0" stroke="#fff" stroke-width="4" fill="none" opacity=".6"/>
<ellipse cx="38" cy="38" rx="9" ry="6" fill="#fff" opacity=".7" transform="rotate(-25 38 38)"/>
</svg>`,
  tree: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect x="45" y="58" width="10" height="36" rx="3" fill="#8d5b33"/>
<circle cx="50" cy="40" r="24" fill="#4caf50"/><circle cx="30" cy="52" r="16" fill="#43a047"/><circle cx="70" cy="52" r="16" fill="#43a047"/>
<circle cx="40" cy="30" r="12" fill="#66bb6a"/><circle cx="62" cy="34" r="10" fill="#66bb6a"/>
<circle cx="42" cy="70" r="4" fill="#e53935"/><circle cx="58" cy="74" r="4" fill="#e53935"/>
</svg>`,
  robot: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect x="30" y="8" width="40" height="4" rx="2" fill="#7c8ba1"/><circle cx="50" cy="8" r="5" fill="#ff5c8a"/>
<rect x="22" y="20" width="56" height="44" rx="10" fill="#b9c6d8" stroke="#8b98a8" stroke-width="2"/>
<rect x="30" y="30" width="16" height="12" rx="4" fill="#1b2a41"/><rect x="54" y="30" width="16" height="12" rx="4" fill="#1b2a41"/>
<circle cx="40" cy="36" r="3" fill="#5ef1c0"/><circle cx="60" cy="36" r="3" fill="#5ef1c0"/>
<rect x="36" y="50" width="28" height="6" rx="3" fill="#7c8ba1"/>
<rect x="26" y="64" width="48" height="26" rx="8" fill="#9fb0c6"/>
<rect x="40" y="72" width="20" height="10" rx="3" fill="#4cc9f0"/>
</svg>`,
  ghost: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<path d="M24 60 q0 -42 26 -42 t26 42 v28 q-6 -6 -13 0 q-6 6 -13 0 q-6 -6 -13 0 q-7 6 -13 0 Z" fill="#e6ecff"/>
<circle cx="41" cy="50" r="5" fill="#2b2b2b"/><circle cx="59" cy="50" r="5" fill="#2b2b2b"/>
<ellipse cx="50" cy="64" rx="6" ry="8" fill="#b8c5ff" opacity=".7"/>
<circle cx="30" cy="60" r="5" fill="#ffb3c6" opacity=".7"/><circle cx="70" cy="60" r="5" fill="#ffb3c6" opacity=".7"/>
</svg>`,
  fish: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<path d="M20 50 q22 -26 44 -18 q14 6 16 18 q-2 12 -16 18 q-22 8 -44 -18Z" fill="#4cc9f0"/>
<path d="M80 50 l14 -14 v28 z" fill="#3aa8d8"/>
<circle cx="34" cy="46" r="4.5" fill="#fff"/><circle cx="34" cy="46" r="2.2" fill="#123"/>
<path d="M44 38 q8 -12 16 -2" stroke="#2d90bd" stroke-width="4" fill="none" stroke-linecap="round"/>
<circle cx="56" cy="52" r="2" fill="#a8e8ff"/><circle cx="64" cy="58" r="2" fill="#a8e8ff"/>
</svg>`,
  cloud: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<g fill="#fff" stroke="#dbe7f5" stroke-width="2">
<circle cx="36" cy="56" r="18"/><circle cx="58" cy="50" r="22"/><circle cx="74" cy="60" r="14"/>
<rect x="28" y="56" width="50" height="18" rx="9"/>
</g>
<circle cx="42" cy="52" r="3" fill="#9fb6cc"/><circle cx="62" cy="50" r="3" fill="#9fb6cc"/>
</svg>`,
};

const BACKDROPS = {
  sky: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ecbff"/><stop offset="1" stop-color="#dff1ff"/></linearGradient></defs>
<rect width="480" height="360" fill="url(#s)"/><circle cx="400" cy="70" r="38" fill="#ffe066"/>
<g fill="#fff" opacity=".9"><ellipse cx="110" cy="90" rx="48" ry="24"/><ellipse cx="150" cy="82" rx="34" ry="20"/><ellipse cx="300" cy="130" rx="42" ry="20"/></g>
<path d="M0 300 q120 -70 240 -20 q120 50 240 -10 v90 H0Z" fill="#7ed957"/><path d="M0 320 q140 -40 260 0 q110 34 220 4 v36 H0Z" fill="#5cbf3a"/></svg>`,
  sunset: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360"><defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2b6b"/><stop offset=".55" stop-color="#ff7b54"/><stop offset="1" stop-color="#ffd09b"/></linearGradient></defs>
<rect width="480" height="360" fill="url(#t)"/><circle cx="240" cy="250" r="60" fill="#fff1a8" opacity=".95"/>
<path d="M0 265 h480 v95 H0Z" fill="#2a2140" opacity=".55"/><path d="M0 300 h480 v60 H0Z" fill="#1c1730"/></svg>`,
  space: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360"><rect width="480" height="360" fill="#0b1026"/>
<g fill="#fff"><circle cx="40" cy="40" r="2"/><circle cx="120" cy="80" r="1.5"/><circle cx="200" cy="30" r="2.5"/><circle cx="300" cy="70" r="2"/><circle cx="400" cy="40" r="1.8"/><circle cx="440" cy="140" r="2.2"/><circle cx="60" cy="180" r="1.6"/><circle cx="160" cy="220" r="2"/><circle cx="360" cy="200" r="1.6"/><circle cx="250" cy="150" r="1.4"/></g>
<circle cx="390" cy="90" r="34" fill="#6c8bff" opacity=".8"/><ellipse cx="390" cy="90" rx="52" ry="12" fill="none" stroke="#9db4ff" stroke-width="4" opacity=".7"/>
<circle cx="90" cy="290" r="46" fill="#2b3a7a" opacity=".6"/></svg>`,
  classroom: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360"><rect width="480" height="360" fill="#f2e9dc"/>
<rect y="270" width="480" height="90" fill="#c9a87c"/><rect x="40" y="30" width="180" height="110" rx="6" fill="#1b3a4b" stroke="#8b6f4b" stroke-width="8"/>
<rect x="300" y="20" width="140" height="120" rx="4" fill="#fff" stroke="#8b6f4b" stroke-width="6"/>
<path d="M310 60 h120 M310 90 h120" stroke="#cfd8dc" stroke-width="6"/>
<rect x="60" y="200" width="130" height="14" rx="4" fill="#a97f52"/><rect x="72" y="214" width="10" height="56" fill="#8b6f4b"/><rect x="168" y="214" width="10" height="56" fill="#8b6f4b"/>
<rect x="270" y="200" width="130" height="14" rx="4" fill="#a97f52"/><rect x="282" y="214" width="10" height="56" fill="#8b6f4b"/><rect x="378" y="214" width="10" height="56" fill="#8b6f4b"/></svg>`,
  forest: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe9c8"/><stop offset="1" stop-color="#e9f7ec"/></linearGradient></defs>
<rect width="480" height="360" fill="url(#f)"/>
<g fill="#3f8f4f"><path d="M60 250 l30 -80 l30 80z"/><path d="M150 260 l40 -110 l40 110z"/><path d="M300 250 l34 -90 l34 90z"/><path d="M390 260 l40 -110 l40 110z"/></g>
<g fill="#2f7a40"><path d="M60 250 l30 -60 l30 60z"/><path d="M150 260 l40 -80 l40 80z"/><path d="M300 250 l34 -66 l34 66z"/><path d="M390 260 l40 -80 l40 80z"/></g>
<rect y="260" width="480" height="100" fill="#8fd18f"/><path d="M0 300 q120 -30 240 0 q120 30 240 0 v60 H0Z" fill="#7bc47b"/></svg>`,
  night: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360"><defs><linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1330"/><stop offset="1" stop-color="#26365e"/></linearGradient></defs>
<rect width="480" height="360" fill="url(#n)"/>
<circle cx="90" cy="70" r="30" fill="#ffe9a8" opacity=".9"/><circle cx="78" cy="62" r="26" fill="#0a1330"/>
<g fill="#fff" opacity=".8"><circle cx="200" cy="50" r="1.8"/><circle cx="300" cy="90" r="1.4"/><circle cx="400" cy="50" r="2"/><circle cx="160" cy="120" r="1.4"/><circle cx="360" cy="140" r="1.6"/></g>
<g fill="#101a33"><rect x="20" y="200" width="60" height="160"/><rect x="100" y="160" width="50" height="200"/><rect x="170" y="220" width="70" height="140"/><rect x="260" y="180" width="55" height="180"/><rect x="335" y="210" width="60" height="150"/><rect x="410" y="170" width="50" height="190"/></g>
<g fill="#ffd166" opacity=".9"><rect x="34" y="220" width="10" height="12"/><rect x="58" y="250" width="10" height="12"/><rect x="112" y="190" width="10" height="12"/><rect x="130" y="230" width="10" height="12"/><rect x="186" y="250" width="10" height="12"/><rect x="274" y="210" width="10" height="12"/><rect x="292" y="260" width="10" height="12"/><rect x="350" y="240" width="10" height="12"/><rect x="424" y="200" width="10" height="12"/></g></svg>`,
};

function seedAssets() {
  const insert = db.prepare('INSERT INTO assets (kind,name,tags,url,uploader_id,created_at) VALUES (?,?,?,?,?,?)');
  const exists = db.prepare('SELECT COUNT(*) AS c FROM assets WHERE url = ?');
  const names = {
    cat: '小猫', dog: '小狗', star: '星星', rocket: '火箭', ball: '皮球',
    tree: '大树', robot: '机器人', ghost: '小幽灵', fish: '小鱼', cloud: '云朵',
  };
  const bnames = {
    sky: '蓝天草地', sunset: '黄昏', space: '星空', classroom: '教室', forest: '森林', night: '夜晚城市',
  };

  for (const [key, svg] of Object.entries(SPRITES)) {
    const rel = `/assets/library/${key}.svg`;
    fs.writeFileSync(path.join(LIB_DIR, `${key}.svg`), svg.trim());
    if (exists.get(rel).c === 0) insert.run('sprite', names[key] || key, '内置 角色', rel, 1, now());
  }
  for (const [key, svg] of Object.entries(BACKDROPS)) {
    const rel = `/assets/library/bg-${key}.svg`;
    fs.writeFileSync(path.join(LIB_DIR, `bg-${key}.svg`), svg.trim());
    if (exists.get(rel).c === 0) insert.run('backdrop', bnames[key] || key, '内置 背景', rel, 1, now());
  }
  if (!exists.get('/assets/library/cat.svg').c) {
    console.error('[assets] seed failed');
  }
}

seedAssets();
module.exports = { seedAssets };
