'use strict';
/**
 * 最小可用的 sb3（Scratch 3 作品包）读写工具。
 * sb3 本质是一个 zip：project.json + 若干素材文件。
 * 这里只实现 store（不压缩）方式的打包，够用于生成演示作品。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function dosTime(d = new Date()) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

/** files: [{ name, data: Buffer }] -> zip Buffer */
function zip(files) {
  const { time, date } = dosTime();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // UTF-8 文件名
    lh.writeUInt16LE(0, 8); // store
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, name, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(0, 30);
    ch.writeUInt32LE(0, 34);
    ch.writeUInt16LE(0, 38);
    ch.writeUInt16LE(0, 40);
    ch.writeUInt32LE(0, 42);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += lh.length + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, eocd]);
}

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

/** 把一段 svg 文本变成 sb3 素材 + costume 描述 */
function svgCostume(name, svgText) {
  const data = Buffer.from(svgText, 'utf8');
  const assetId = md5(data);
  const m = /viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svgText);
  const w = m ? Number(m[3]) : 480;
  const h = m ? Number(m[4]) : 360;
  return {
    asset: { name: `${assetId}.svg`, data },
    costume: {
      assetId,
      name,
      bitmapResolution: 1,
      dataFormat: 'svg',
      rotationCenterX: w / 2,
      rotationCenterY: h / 2,
      md5ext: `${assetId}.svg`,
    },
  };
}

function baseTarget(isStage, name, extra = {}) {
  return {
    isStage,
    name,
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: {},
    comments: {},
    currentCostume: 0,
    costumes: [],
    sounds: [],
    volume: 100,
    layerOrder: isStage ? 0 : 1,
    ...(isStage
      ? { tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null }
      : {
          visible: true,
          x: 0,
          y: 0,
          size: 100,
          direction: 90,
          draggable: false,
          rotationStyle: 'all around',
        }),
    ...extra,
  };
}

/**
 * 生成一份「小猫边走边反弹」的演示作品 sb3。
 * @param {string} catSvg 小猫造型的 SVG 源码
 * @param {boolean} withScript 是否带上默认脚本（false 时生成空白起始作品）
 */
function demoProject(catSvg, withScript = true) {
  const cat = svgCostume('造型1', catSvg);
  const bg = svgCostume(
    '背景1',
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
      <rect width="480" height="360" fill="#8ed1fc"/>
      <circle cx="400" cy="70" r="34" fill="#ffe066"/>
      <ellipse cx="120" cy="72" rx="46" ry="22" fill="#ffffff" opacity=".85"/>
      <ellipse cx="160" cy="64" rx="34" ry="18" fill="#ffffff" opacity=".85"/>
      <rect y="280" width="480" height="80" fill="#7ed957"/>
    </svg>`
  );

  const blocks = withScript
    ? {
        flag: {
      opcode: 'event_whenflagclicked',
      next: 'forever',
      parent: null,
      inputs: {},
      fields: {},
      shadow: false,
      topLevel: true,
      x: 40,
      y: 40,
    },
    forever: {
      opcode: 'control_forever',
      next: null,
      parent: 'flag',
      inputs: { SUBSTACK: [2, 'move'] },
      fields: {},
      shadow: false,
      topLevel: false,
    },
    move: {
      opcode: 'motion_movesteps',
      next: 'bounce',
      parent: 'forever',
      inputs: { STEPS: [1, [4, '10']] },
      fields: {},
      shadow: false,
      topLevel: false,
    },
    bounce: {
      opcode: 'motion_ifonedgebounce',
      next: null,
      parent: 'move',
      inputs: {},
      fields: {},
      shadow: false,
      topLevel: false,
    },
      }
    : {};

  const stage = baseTarget(true, 'Stage', { costumes: [bg.costume] });
  const sprite = baseTarget(false, '小猫', { costumes: [cat.costume], blocks });

  const project = {
    targets: [stage, sprite],
    monitors: [],
    extensions: [],
    meta: { semver: '3.0.0', vm: '5.0.300', agent: 'CodeCamp' },
  };

  return zip([
    { name: 'project.json', data: Buffer.from(JSON.stringify(project), 'utf8') },
    cat.asset,
    bg.asset,
  ]);
}

module.exports = { zip, crc32, demoProject, svgCostume };
