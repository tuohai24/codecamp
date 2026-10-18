'use strict';
const fs = require('node:fs');
const path = require('node:path');

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
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.py': 'text/plain; charset=utf-8',
  '.cur': 'image/x-icon',
  '.hex': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function createRouter() {
  const routes = [];
  const add = (method, pattern, roles, handler, opts) => {
    const keys = [];
    const re = new RegExp(
      '^' +
        pattern
          .split('/')
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
    routes.push({ method, re, keys, roles, handler, opts: opts || {} });
  };
  return {
    get: (p, roles, h, o) => add('GET', p, roles, h, o),
    post: (p, roles, h, o) => add('POST', p, roles, h, o),
    put: (p, roles, h, o) => add('PUT', p, roles, h, o),
    patch: (p, roles, h, o) => add('PATCH', p, roles, h, o),
    delete: (p, roles, h, o) => add('DELETE', p, roles, h, o),
    match(method, pathname) {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = pathname.match(r.re);
        if (!m) continue;
        const params = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { route: r, params };
      }
      return null;
    },
  };
}

function sendJson(res, status, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
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
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
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

function serveStatic(res, rootDir, urlPath, extraHeaders) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = path.resolve(rootDir, '.' + rel);
  if (!full.startsWith(path.resolve(rootDir))) {
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
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    ...(extraHeaders || {}),
  });
  fs.createReadStream(full).pipe(res);
  return true;
}

module.exports = { createRouter, sendJson, readBody, readBuffer, sendBuffer, serveStatic, HttpError, MIME };
