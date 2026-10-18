'use strict';
/**
 * 官方 Scratch 素材镜像。
 *
 * 背景：cdn.assets.scratch.mit.edu 在境内被 DNS 污染 + TLS SNI 阻断，
 *   但同一台 Fastly 节点的 80 端口（明文 HTTP，Host 头路由）仍可访问。
 * 因此这里自行解析真实 IP，用 HTTP + Host 头把素材取回来，落盘缓存，
 * 之后全站（缩略图、VM 读取、素材库）都走本地文件，离线也可用。
 *
 * 可配置：环境变量 SCRATCH_ASSET_BASE 指定私有镜像前缀（逗号分隔），
 *   命中即优先使用，形如 https://my-mirror.example.com/asset/。
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

const HOST = 'cdn.assets.scratch.mit.edu';
const ALT_HOST = 'assets.scratch.mit.edu';
const PATHS = [
  (h, f) => `https://${h}/internalapi/asset/${f}/get/`,
  (h, f) => `http://${h}/internalapi/asset/${f}/get/`,
];

const DATA_DIR = path.join(__dirname, '..', 'data');
const ASSET_DIR = path.join(DATA_DIR, 'scratch-assets');
fs.mkdirSync(ASSET_DIR, { recursive: true });

const EXT_OK = new Set(['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'wav', 'mp3', 'json']);
const MIME = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  json: 'application/json; charset=utf-8',
};

const FILE_RE = /^([0-9a-f]{32})\.([a-z0-9]{2,5})$/i;

function normalize(file) {
  const m = FILE_RE.exec(String(file || ''));
  if (!m) return null;
  const ext = m[2].toLowerCase();
  if (!EXT_OK.has(ext)) return null;
  return { id: m[1].toLowerCase(), ext, name: `${m[1].toLowerCase()}.${ext}` };
}

function mimeOf(ext) {
  return MIME[String(ext || '').toLowerCase()] || 'application/octet-stream';
}

function localPath(name) {
  return path.join(ASSET_DIR, name);
}

function readLocal(name) {
  try {
    return fs.readFileSync(localPath(name));
  } catch {
    return null;
  }
}

/* ---------------- 真实 IP 解析（绕开 DNS 污染） ---------------- */

let ipCache = { at: 0, ips: [] };

function httpGetJson(url, ms) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: ms, headers: { accept: 'application/dns-json' } }, (res) => {
      let s = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (s += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(s));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

function isBogus(ip) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return true;
  const p = ip.split('.').map(Number);
  if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 224 || p[0] >= 240) return true;
  // 典型污染段：Facebook 31.13.x / 157.240.x、保留段 0.0.0.0、8.7.198.x(旧污染)
  if (p[0] === 31 && p[1] === 13) return true;
  if (p[0] === 157 && p[1] === 240) return true;
  if (p[0] === 8 && p[1] === 7 && p[2] === 198) return true;
  return false;
}

async function resolveIps(force) {
  if (!force && ipCache.ips.length && Date.now() - ipCache.at < 10 * 60 * 1000) return ipCache.ips;

  const sources = [
    'https://doh.pub/dns-query?name=' + HOST + '&type=A',
    'https://1.12.12.12/dns-query?name=' + HOST + '&type=A',
    'https://dns.alidns.com/resolve?name=' + HOST + '&type=A',
  ];
  const ips = [];
  for (const s of sources) {
    const json = await httpGetJson(s, 5000);
    const ans = json && Array.isArray(json.Answer) ? json.Answer : [];
    for (const a of ans) {
      if (a && (a.type === 1 || a.type === '1') && typeof a.data === 'string' && !isBogus(a.data)) {
        if (!ips.includes(a.data)) ips.push(a.data);
      }
    }
    if (ips.length) break;
  }
  if (ips.length) ipCache = { at: Date.now(), ips };
  return ips;
}

/* ---------------- HTTP 抓取 ---------------- */

const CONCURRENCY = Number(process.env.SCRATCH_FETCH_CONCURRENCY || 8);
let running = 0;
const waiters = [];

async function slot() {
  if (running < CONCURRENCY) {
    running++;
    return;
  }
  await new Promise((r) => waiters.push(r));
  running++;
}

function release() {
  running--;
  const w = waiters.shift();
  if (w) w();
}

function request(url, hostHeader, ms, redirects, onReq) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      return resolve(null);
    }
    const mod = target.protocol === 'https:' ? https : http;
    const opts = {
      protocol: target.protocol,
      host: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search,
      method: 'GET',
      headers: {
        Host: hostHeader || target.host,
        'User-Agent': 'Mozilla/5.0 codecamp-mirror',
        Accept: '*/*',
        'Accept-Encoding': 'identity',
      },
      timeout: ms,
      agent: false,
    };
    if (target.protocol === 'https:') opts.servername = hostHeader || target.hostname;

    const req = mod.request(opts, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location && (redirects || 0) < 3) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(request(next, hostHeader, ms, (redirects || 0) + 1, onReq));
      }
      if (code !== 200) {
        res.resume();
        return resolve({ status: code });
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: 200, body: Buffer.concat(chunks) }));
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    if (onReq) onReq(req);
    req.end();
  });
}

/** 并发竞速：谁先拿到 200 就用谁，其余立即断开 */
function race(candidates, ms) {
  return new Promise((resolve) => {
    if (!candidates.length) return resolve(null);
    const reqs = [];
    let done = false;
    let left = candidates.length;
    const finish = (r) => {
      if (done) return;
      done = true;
      for (const q of reqs) {
        try {
          q.destroy();
        } catch {}
      }
      resolve(r);
    };
    for (const c of candidates) {
      request(c.url, c.host || null, ms, 0, (q) => reqs.push(q)).then((r) => {
        left--;
        if (done) return;
        if (r && r.status === 200 && r.body && r.body.length) return finish(r);
        if (r && r.status === 404) return finish(null);
        if (left === 0) finish(null);
      });
    }
    setTimeout(() => finish(null), ms + 500);
  });
}

function basesFromEnv() {
  return String(process.env.SCRATCH_ASSET_BASE || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 依次尝试：私有镜像 → 直连 HTTPS → 明文 HTTP + Host 头打真实 IP。
 * 后两者并发竞速：境内 HTTPS 被 SNI 阻断、HTTP 可用，境外反之，谁通用谁。
 */
async function fetchUpstream(name) {
  const bases = basesFromEnv();
  if (bases.length) {
    const r = await race(
      bases.map((b) => ({ url: b.replace(/\/+$/, '') + '/' + name })),
      15000
    );
    if (r) return r.body;
  }

  const ips = await resolveIps(false);
  const candidates = [];
  for (const host of [HOST, ALT_HOST]) {
    candidates.push({ url: `https://${host}/internalapi/asset/${name}/get/` });
  }
  for (const ip of ips.slice(0, 3)) {
    candidates.push({ url: `http://${ip}/internalapi/asset/${name}/get/`, host: HOST });
  }
  const got = await race(candidates, 12000);
  return got ? got.body : null;
}

const inflight = new Map();
const negative = new Map();

function saveLocal(name, buf) {
  const dst = localPath(name);
  const tmp = dst + '.tmp' + process.pid + Math.random().toString(16).slice(2, 8);
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dst);
}

/**
 * 取一个素材：先本地缓存，再回源下载并缓存。
 * @returns {Promise<{buf:Buffer, ext:string, cached:boolean}|null>}
 */
async function getAsset(file) {
  const info = normalize(file);
  if (!info) return null;

  const hit = readLocal(info.name);
  if (hit) return { buf: hit, ext: info.ext, cached: true };

  const neg = negative.get(info.name);
  if (neg && Date.now() - neg < 10 * 60 * 1000) return null;

  if (inflight.has(info.name)) {
    const buf = await inflight.get(info.name);
    return buf ? { buf, ext: info.ext, cached: false } : null;
  }

  const task = (async () => {
    await slot();
    try {
      const buf = await fetchUpstream(info.name);
      if (buf && buf.length) {
        saveLocal(info.name, buf);
        return buf;
      }
      negative.set(info.name, Date.now());
      return null;
    } finally {
      release();
    }
  })();

  inflight.set(info.name, task);
  try {
    const buf = await task;
    return buf ? { buf, ext: info.ext, cached: false } : null;
  } finally {
    inflight.delete(info.name);
  }
}

/** 只查本地，不发网络请求 */
function getLocal(file) {
  const info = normalize(file);
  if (!info) return null;
  const buf = readLocal(info.name);
  return buf ? { buf, ext: info.ext } : null;
}

function stat() {
  let files = 0;
  let bytes = 0;
  for (const n of fs.readdirSync(ASSET_DIR)) {
    if (n.endsWith('.tmp')) continue;
    try {
      const st = fs.statSync(path.join(ASSET_DIR, n));
      if (st.isFile()) {
        files++;
        bytes += st.size;
      }
    } catch {}
  }
  return { files, bytes, dir: ASSET_DIR };
}

/* ---------------- 官方库全量同步 ---------------- */

const LIB_DIR = path.join(__dirname, '..', 'public', 'vendor', 'scratch-gui', 'libraries');

/** 官方四个库（角色含自身造型与声音）引用到的全部素材文件名 */
function libraryFiles() {
  const read = (f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(LIB_DIR, f), 'utf8'));
    } catch {
      return [];
    }
  };
  const out = [];
  const seen = new Set();
  const add = (item) => {
    if (item && item.md5ext && !seen.has(item.md5ext)) {
      seen.add(item.md5ext);
      out.push(item.md5ext);
    }
  };
  for (const s of read('sprites.json')) {
    (s.costumes || []).forEach(add);
    (s.sounds || []).forEach(add);
  }
  for (const key of ['backdrops.json', 'costumes.json', 'sounds.json']) read(key).forEach(add);
  return out;
}

let syncState = { running: false, total: 0, done: 0, ok: 0, skip: 0, failed: 0, startedAt: 0, finishedAt: 0 };

function syncStatus() {
  return { ...syncState, ...stat() };
}

async function syncAll(onProgress) {
  if (syncState.running) return syncState;
  const files = libraryFiles();
  syncState = {
    running: true,
    total: files.length,
    done: 0,
    ok: 0,
    skip: 0,
    failed: 0,
    startedAt: Date.now(),
    finishedAt: 0,
  };
  const queue = files.slice();
  const worker = async () => {
    for (;;) {
      const f = queue.shift();
      if (!f) return;
      if (getLocal(f)) {
        syncState.skip++;
      } else {
        let got = null;
        for (let i = 0; i < 3 && !got; i++) got = await getAsset(f);
        if (got) syncState.ok++;
        else syncState.failed++;
      }
      syncState.done++;
      if (onProgress) onProgress(syncState);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  syncState.running = false;
  syncState.finishedAt = Date.now();
  return syncState;
}

module.exports = {
  getAsset,
  getLocal,
  stat,
  syncAll,
  syncStatus,
  libraryFiles,
  normalize,
  mimeOf,
  resolveIps,
  ASSET_DIR,
  CDN_HOST: HOST,
};
