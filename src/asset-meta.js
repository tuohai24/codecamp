'use strict';
/* 素材元数据：格式、尺寸、md5、音频采样信息。上传时算一次并入库，老数据按需补算 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DATA_DIR, ROOT } = require('./db');

const PUBLIC_DIR = path.join(ROOT, 'public');
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp']);
const SOUND_EXTS = new Set(['wav', 'mp3']);

function readBuffer(url) {
  const u = String(url || '');
  if (!u) throw new Error('素材地址为空');
  const full = u.startsWith('/uploads/')
    ? path.join(DATA_DIR, u.slice(1))
    : path.join(PUBLIC_DIR, u.replace(/^\//, ''));
  return fs.readFileSync(full);
}

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

function svgSize(text) {
  const vb = /viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  if (vb) return { width: Math.round(Number(vb[3])), height: Math.round(Number(vb[4])) };
  const w = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i.exec(text);
  const h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i.exec(text);
  if (w && h) return { width: Math.round(Number(w[1])), height: Math.round(Number(h[1])) };
  return { width: 100, height: 100 };
}

function jpegSize(buf) {
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) {
      off++;
      continue;
    }
    const marker = buf[off + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    const len = buf.readUInt16BE(off + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
    if (len < 2) break;
    off += 2 + len;
  }
  return null;
}

function webpSize(buf) {
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  return null;
}

function imageSize(buf) {
  if (buf.length >= 24 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 10 && buf.toString('ascii', 0, 3) === 'GIF') {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) return jpegSize(buf);
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return webpSize(buf);
  }
  return null;
}

function wavInfo(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let off = 12;
  let fmt = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ' && body + 16 <= buf.length) {
      fmt = {
        channels: buf.readUInt16LE(body + 2),
        rate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data' && fmt) {
      const bytes = Math.min(size, Math.max(0, buf.length - body));
      const frame = Math.max(1, fmt.channels * (fmt.bits / 8));
      const sampleCount = Math.floor(bytes / frame);
      return { rate: fmt.rate, sampleCount, duration: fmt.rate ? sampleCount / fmt.rate : 0 };
    }
    if (size < 0) break;
    off = body + size + (size % 2);
  }
  return null;
}

/** 依据字节内容判断格式与尺寸 / 音频参数 */
function probe(buf, ext) {
  const e = String(ext || '').toLowerCase();
  const out = { format: e, width: 0, height: 0, rate: 0, sampleCount: 0, duration: 0 };
  if (e === 'svg') {
    const size = svgSize(buf.toString('utf8'));
    out.width = size.width;
    out.height = size.height;
    return out;
  }
  if (SOUND_EXTS.has(e)) {
    const info = e === 'wav' ? wavInfo(buf) : null;
    if (info) {
      out.rate = info.rate;
      out.sampleCount = info.sampleCount;
      out.duration = info.duration;
    }
    return out;
  }
  const size = imageSize(buf);
  if (size) {
    out.width = size.width;
    out.height = size.height;
  }
  return out;
}

module.exports = { readBuffer, md5, probe, imageSize, wavInfo, IMAGE_EXTS, SOUND_EXTS };
