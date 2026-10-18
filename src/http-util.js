'use strict';
/**
 * HTTP 基础设施：路由、JSON、静态文件、请求体读取。
 *
 * 性能要点（相比最初版本）：
 *  - 路由按「方法 + 二级路径」分桶，请求只跑同桶里的几条正则；
 *  - 静态文件带 ETag，浏览器二次访问直接 304（不重传、不解析）；
 *  - 文本资源（js/css/svg/json）按需 gzip，压缩结果按 mtime 缓存复用；
 *  - 目录穿越用 path.relative 判断，杜绝 /publicX 这类前缀绕过。
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.py': 'text/plain; charset=utf-8',
  '.cur': 'image/x-icon',
  '.hex': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

// 值得压缩的文本类型
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.json', '.txt', '.md', '.map']);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* ------------------------------- 路由 ------------------------------- */

function createRouter() {
  const buckets = new Map(); // 'METHOD:segment' -> routes[]
  const add = (method, pattern, roles, handler, opts) => {
    const keys = [];
    const segs = pattern.split('/').filter((s) => s !== '');
    const re = new RegExp(
      '^/' +
        segs
          .map((seg) => {
            if (seg.startsWith(':')) {
              keys.push(seg.slice(1));
              return '([^/]+)';
            }
            return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          })
          .join('/') +
        '$'
    );
    // 二级路径分桶：/api/projects/1 -> projects
    const bucketSeg = segs[1];
    const bucketKey = bucketSeg && !bucketSeg.startsWith(':') ? `${method}:${bucketSeg}` : `${method}:*`;
    const route = { method, re, keys, roles, handler, opts: opts || {} };
    const list = buckets.get(bucketKey);
    if (list) list.push(route);
    else buckets.set(bucketKey, [route]);
  };
  return {
    get: (p, roles, h, o) => add('GET', p, roles, h, o),
    post: (p, roles, h, o) => add('POST', p, roles, h, o),
    put: (p, roles, h, o) => add('PUT', p, roles, h, o),
    patch: (p, roles, h, o) => add('PATCH', p, roles, h, o),
    delete: (p, roles, h, o) => add('DELETE', p, roles, h, o),
    match(method, pathname) {
      const segs = pathname.split('/');
      const key = `${method}:${segs[2] || ''}`;
      const list = buckets.get(key);
      const extra = buckets.get(`${method}:*`);
      const candidates = list && extra ? list.concat(extra) : list || extra;
      if (!candidates) return null;
      for (const r of candidates) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        const params = {};
        for (let i = 0; i < r.keys.length; i++) params[r.keys[i]] = decodeURIComponent(m[i + 1]);
        return { route: r, params };
      }
      return null;
    },
  };
}

/* ------------------------------- 响应 ------------------------------- */

function acceptsGzip(req) {
  const ae = req.headers['accept-encoding'] || '';
  return /\bgzip\b/.test(ae);
}

function sendJson(req, res, status, data) {
  let body = Buffer.from(JSON.stringify(data), 'utf8');
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  // 只对大响应压缩，避免小接口白跑一次 deflate 反而更慢
  if (body.length > 2048 && req && acceptsGzip(req)) {
    body = zlib.gzipSync(body, { level: 6 });
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(status, headers);
  res.end(body);
}

function readBody(req, limit = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, '请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, '请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function readBuffer(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, '文件过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendBuffer(res, buf, type = 'application/octet-stream', filename) {
  const headers = {
    'Content-Type': type,
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  };
  if (filename) headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(filename)}"`;
  res.writeHead(200, headers);
  res.end(buf);
}

/* ---------------------------- 静态文件 ---------------------------- */

// 压缩结果缓存：key = 绝对路径，值随 mtime/size 失效
const gzipCache = new Map();
let gzipCacheBytes = 0;
const GZIP_CACHE_MAX_BYTES = 12 * 1024 * 1024;

function cacheGzip(file, mtimeMs, buf) {
  if (buf.length > 512 * 1024) return buf; // 单个大文件不缓存
  const old = gzipCache.get(file);
  if (old) gzipCacheBytes -= old.buf.length; // 文件已更新：先扣掉旧条目，避免计数虚高
  if (gzipCacheBytes + buf.length > GZIP_CACHE_MAX_BYTES) {
    gzipCache.clear();
    gzipCacheBytes = 0;
  }
  gzipCache.set(file, { mtimeMs, buf });
  gzipCacheBytes += buf.length;
  return buf;
}

function insideRoot(rootDir, full) {
  const rel = path.relative(rootDir, full);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * 返回 true 表示已处理（含 304），false 表示文件不存在（交给上层回退）。
 */
function serveStatic(req, res, rootDir, urlPath, extraHeaders) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    // 非法百分号编码（如 /%zz），直接拒绝，避免 URIError 掀翻整个请求
    res.writeHead(400).end('Bad Request');
    return true;
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  const root = path.resolve(rootDir);
  const full = path.resolve(root, '.' + rel);
  if (!insideRoot(root, full)) {
    res.writeHead(403).end('Forbidden');
    return true;
  }
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    return false;
  }
  if (stat.isDirectory()) return false;

  const ext = path.extname(full).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const isHtml = ext === '.html';
  const etag = `W/"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`;
  const cacheControl = isHtml ? 'no-cache' : 'public, max-age=3600';
  const headers = {
    'Content-Type': type,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    ETag: etag,
    // 同一 URL 可能因 Accept-Encoding 返回两种字节流，必须声明 Vary
    ...(COMPRESSIBLE.has(ext) ? { Vary: 'Accept-Encoding' } : {}),
    ...(extraHeaders || {}),
  };

  // 协商缓存：内容没变就不传 body（首屏 HTML 与 app.js 每次刷新都能省一次传输）
  const inm = req.headers['if-none-match'];
  if (inm && (inm === etag || inm.includes(etag))) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }

  if (COMPRESSIBLE.has(ext) && stat.size > 1024 && acceptsGzip(req)) {
    let cached = gzipCache.get(full);
    if (!cached || cached.mtimeMs !== stat.mtimeMs) {
      try {
        const raw = fs.readFileSync(full);
        cached = { mtimeMs: stat.mtimeMs, buf: cacheGzip(full, stat.mtimeMs, zlib.gzipSync(raw, { level: 6 })) };
      } catch {
        cached = null;
      }
    }
    if (cached) {
      res.writeHead(200, {
        ...headers,
        'Content-Encoding': 'gzip',
        'Content-Length': cached.buf.length,
        Vary: 'Accept-Encoding',
      });
      res.end(cached.buf);
      return true;
    }
  }

  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  fs.createReadStream(full).pipe(res);
  return true;
}

module.exports = {
  createRouter,
  sendJson,
  readBody,
  readBuffer,
  sendBuffer,
  serveStatic,
  HttpError,
  MIME,
  acceptsGzip,
};
