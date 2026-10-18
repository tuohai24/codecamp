'use strict';
/**
 * 把官方 Scratch 素材库（角色 / 背景 / 声音）全量镜像到 data/scratch-assets/。
 *
 *   node scripts/fetch-scratch-assets.js            # 全量，跳过已存在
 *   node scripts/fetch-scratch-assets.js --retry 3  # 失败重试次数
 *   node scripts/fetch-scratch-assets.js --only sprites
 *
 * 说明：cdn.assets.scratch.mit.edu 在境内 TLS 被阻断，走 src/scratch-mirror.js
 * 里的「明文本地 IP + Host 头」通道抓取；也可以用 SCRATCH_ASSET_BASE 指定私有镜像。
 */
const fs = require('node:fs');
const path = require('node:path');
const mirror = require('../src/scratch-mirror');

const LIB_DIR = path.join(__dirname, '..', 'public', 'vendor', 'scratch-gui', 'libraries');

const argv = process.argv.slice(2);
const argOf = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] || def : def;
};
const RETRY = Number(argOf('retry', 2)) || 2;
const ONLY = argOf('only', '');

function collect() {
  const groups = { sprites: new Set(), backdrops: new Set(), sounds: new Set() };
  const add = (set, item) => {
    if (item && item.md5ext) set.add(item.md5ext);
  };

  const sprites = JSON.parse(fs.readFileSync(path.join(LIB_DIR, 'sprites.json'), 'utf8'));
  for (const s of sprites) {
    (s.costumes || []).forEach((c) => add(groups.sprites, c));
    (s.sounds || []).forEach((s2) => add(groups.sprites, s2));
  }
  for (const b of JSON.parse(fs.readFileSync(path.join(LIB_DIR, 'backdrops.json'), 'utf8'))) {
    add(groups.backdrops, b);
  }
  for (const s of JSON.parse(fs.readFileSync(path.join(LIB_DIR, 'sounds.json'), 'utf8'))) {
    add(groups.sounds, s);
  }
  return groups;
}

(async () => {
  const groups = collect();
  const keys = ONLY ? [ONLY] : Object.keys(groups);
  const all = [];
  for (const k of keys) {
    if (!groups[k]) throw new Error('未知分组：' + k);
    for (const f of groups[k]) if (!all.includes(f)) all.push(f);
  }

  const local = mirror.stat();
  console.log(`[镜像] 目标 ${all.length} 个文件，本地已有 ${local.files} 个（${(local.bytes / 1048576).toFixed(1)} MB）`);
  console.log('[镜像] 目录：' + local.dir);

  const t0 = Date.now();
  let done = 0;
  let ok = 0;
  let skip = 0;
  let bytes = 0;
  const failed = [];

  const queue = all.slice();
  const worker = async () => {
    for (;;) {
      const file = queue.shift();
      if (!file) return;
      if (mirror.getLocal(file)) {
        skip++;
        done++;
        continue;
      }
      let got = null;
      for (let i = 0; i <= RETRY && !got; i++) {
        got = await mirror.getAsset(file);
      }
      if (got) {
        ok++;
        bytes += got.buf.length;
      } else {
        failed.push(file);
      }
      done++;
      if (done % 25 === 0 || done === all.length) {
        const sec = (Date.now() - t0) / 1000;
        const speed = done / Math.max(sec, 1);
        console.log(
          `  ${done}/${all.length}  新增 ${ok}  跳过 ${skip}  失败 ${failed.length}  ` +
            `${(bytes / 1048576).toFixed(1)} MB  ${speed.toFixed(1)} 个/秒`
        );
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(4, Number(process.env.SCRATCH_FETCH_CONCURRENCY) || 8) }, worker));

  if (failed.length) {
    fs.writeFileSync(path.join(mirror.ASSET_DIR, '_failed.txt'), failed.join('\n'));
    console.log(`\n[镜像] 失败 ${failed.length} 个，已写入 _failed.txt，可稍后重跑本脚本补齐`);
  }
  const st = mirror.stat();
  console.log(
    `\n[镜像] 完成：新增 ${ok}，跳过 ${skip}，失败 ${failed.length}，` +
      `共 ${st.files} 个 / ${(st.bytes / 1048576).toFixed(1)} MB，耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`
  );
})().catch((e) => {
  console.error('[镜像] 出错：', e);
  process.exit(1);
});
