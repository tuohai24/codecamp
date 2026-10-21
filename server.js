'use strict';
// 先加载 .env，后面模块读取 process.env 时才拿得到 WX_APPID 等配置
require('./src/env').loadEnv();
const http = require('node:http');
const path = require('node:path');
const { createRouter, sendJson, readBody, readBuffer, serveStatic, HttpError } = require('./src/http-util');
const { verify } = require('./src/auth');
const { db, DATA_DIR, closeDb } = require('./src/db');
const { getUser, flushViews } = require('./src/cache');
require('./src/seed-assets');
require('./src/seed-scratch').ensureSeedSb3();
const { buildApi } = require('./src/api');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');

const router = createRouter();
buildApi(router);

// 应用自身的 JS / CSS、Studio 页面、以及我们改过的 GUI 宿主文件走协商缓存，
// 改完刷新立即生效；官方 vendor 大文件仍走长缓存（几十 MB，不能每次重新下载）。
function needsRevalidate(pathname) {
  return (
    pathname.startsWith('/js/') ||
    pathname.startsWith('/css/') ||
    pathname.startsWith('/studio/') ||
    pathname === '/vendor/scratch-gui/host.js' ||
    pathname === '/vendor/scratch-gui/host.html'
  );
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  // HEAD 按 GET 匹配（Node 会自动丢弃响应体），这样监控/预检也能拿到 200
  const method = req.method === 'HEAD' ? 'GET' : req.method;

  // 静态资源
  if (!pathname.startsWith('/api/')) {
    if (pathname === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    if (pathname.startsWith('/uploads/')) {
      const headers = {
        // 用户上传的 SVG 可能含脚本，禁止其在站点源上执行
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        'Cache-Control': 'public, max-age=604800',
      };
      if (serveStatic(req, res, path.join(DATA_DIR, 'uploads'), pathname.replace('/uploads', ''), headers)) return;
      res.writeHead(404).end('Not Found');
      return;
    }
    if (pathname.startsWith('/chunks/')) {
      // scratch-storage 的 web worker 分块以 /chunks 为 publicPath 加载
      if (serveStatic(req, res, path.join(PUBLIC, 'vendor', 'scratch', 'chunks'), pathname.replace('/chunks', ''))) return;
    }
    if (serveStatic(req, res, PUBLIC, pathname, needsRevalidate(pathname) ? { 'Cache-Control': 'no-cache' } : undefined)) return;
    // SPA 回退
    if (!path.extname(pathname) && serveStatic(req, res, PUBLIC, '/index.html')) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
    return;
  }

  const hit = router.match(method, pathname);
  if (!hit) throw new HttpError(404, '接口不存在');
  const { route, params } = hit;

  const query = Object.fromEntries(url.searchParams.entries());
  const ctx = { req, res, params, query, body: {}, user: null };

  // 认证：token 校验之外，用户信息走 10s 内存缓存，写操作会主动失效
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const payload = token ? verify(token) : null;
  if (payload) {
    const u = getUser(payload.uid);
    if (u && u.status) ctx.user = u;
  }

  if (route.roles === 'any' && !ctx.user) throw new HttpError(401, '请先登录');
  if (Array.isArray(route.roles)) {
    if (!ctx.user) throw new HttpError(401, '请先登录');
    if (!route.roles.includes(ctx.user.role)) throw new HttpError(403, '没有操作权限');
  }

  if (route.opts && route.opts.raw) {
    ctx.raw = await readBuffer(req, route.opts.limit);
  } else if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    ctx.body = await readBody(req);
  }

  const result = await route.handler(ctx);
  if (res.writableEnded) return;
  sendJson(req, res, 200, result === undefined ? { ok: true } : result);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error('[error]', req.method, req.url, err);
    // 5xx 只回一句通用文案，细节留在服务端日志里，避免把栈信息暴露给前端
    const message = status >= 500 ? '服务器内部错误' : err.message || '请求失败';
    if (!res.headersSent) sendJson(req, res, status, { error: message });
    else res.end();
  });
});

// 长连接复用：减少移动端反复建连的开销
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 120000;

server.listen(PORT, HOST, () => {
  const py = require('./src/python-runner');
  const pybin = py.detectPython();
  console.log('');
  console.log('  CodeCamp 少儿编程学堂 已启动');
  console.log(`  → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  Python 解释器：${pybin || '未检测到（Python 运行/装包功能不可用）'}`);
  console.log('  演示账号：admin / teacher / student  密码均为 123456');
  console.log('');
  // 预热 Python 虚拟环境，避免首次运行代码过慢
  if (pybin) py.ensureEnv().then((p) => p && console.log('  Python 运行环境就绪：' + p));
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`端口 ${PORT} 被占用，请设置环境变量 PORT 换一个端口`);
  else console.error(e);
  process.exit(1);
});

/* 优雅退出：先落库未写盘的浏览量，再收 WAL，避免进程被 kill 时丢计数/日志膨胀 */
let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n  收到 ${signal}，正在退出…`);
  try {
    flushViews();
  } catch {}
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  // 兜底：5 秒内没退出就强制结束
  setTimeout(() => {
    closeDb();
    process.exit(0);
  }, 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', () => {
  try {
    flushViews();
  } catch {}
});
