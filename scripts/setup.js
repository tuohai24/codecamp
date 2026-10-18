#!/usr/bin/env node
/**
 * CodeCamp 安装 / 更新 / 卸载 管理脚本
 *
 *   node scripts/setup.js install [--port 3000] [--host 0.0.0.0] [--foreground]
 *   node scripts/setup.js update
 *   node scripts/setup.js uninstall [--purge] [--yes]
 *   node scripts/setup.js start | stop | restart | status | logs
 *   node scripts/setup.js passwd <用户名> <新密码>
 *
 * 项目本身零依赖，安装就是「建目录 + 起进程」，不需要 npm install。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const readline = require('node:readline');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME = path.join(ROOT, '.runtime');
const PID_FILE = path.join(RUNTIME, 'app.pid');
const CONF_FILE = path.join(RUNTIME, 'config.json');
const LOG_DIR = path.join(ROOT, 'data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const DATA_DIR = path.join(ROOT, 'data');
const MIN_NODE = 22.5;

const isWin = process.platform === 'win32';

/* ------------------------------- 小工具 ------------------------------- */

const say = (msg = '') => process.stdout.write(msg + '\n');
const ok = (msg) => say('  [ok] ' + msg);
const warn = (msg) => say('  [注意] ' + msg);
const fail = (msg) => {
  say('  [失败] ' + msg);
  process.exit(1);
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 同步睡眠：不依赖外部的 sleep 命令，Windows / Linux / macOS 都能用
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function pkgVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function checkNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 5)) {
    fail(
      `需要 Node.js ${MIN_NODE} 或更高版本（内置 node:sqlite），当前是 v${process.versions.node}。\n` +
        '        请到 https://nodejs.org 安装 LTS 版本后重试。'
    );
  }
  ok(`Node.js v${process.versions.node}`);
}

function ensureDirs() {
  for (const dir of [RUNTIME, DATA_DIR, LOG_DIR, path.join(DATA_DIR, 'uploads'), path.join(DATA_DIR, 'sb3')]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadConf() {
  try {
    return JSON.parse(fs.readFileSync(CONF_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveConf(patch) {
  const conf = { ...loadConf(), ...patch };
  fs.mkdirSync(RUNTIME, { recursive: true });
  fs.writeFileSync(CONF_FILE, JSON.stringify(conf, null, 2));
  return conf;
}

function readPid() {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function runningPid() {
  const pid = readPid();
  return alive(pid) ? pid : null;
}

function portFree(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1');
  });
}

function probe(port, timeout = 1200) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/site', timeout }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => {
    rl.close();
    resolve(a.trim());
  }));
}

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        opts[key] = next;
        i++;
      } else {
        opts[key] = true;
      }
    } else {
      opts._.push(a);
    }
  }
  return opts;
}

/* ------------------------------- 进程管理 ------------------------------- */

function startServer(port, host, foreground) {
  ensureDirs();
  const env = { ...process.env, PORT: String(port), HOST: host };

  if (foreground) {
    say(`  前台运行：http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}  (Ctrl+C 停止)`);
    const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, stdio: 'inherit', env });
    child.on('exit', (code) => process.exit(code || 0));
    return null;
  }

  const fd = fs.openSync(LOG_FILE, 'a');
  fs.writeSync(fd, `\n===== ${new Date().toLocaleString('zh-CN')} 启动 (PORT=${port}, HOST=${host}) =====\n`);
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', fd, fd],
    env,
  });
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));
  return child.pid;
}

async function waitReady(port, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe(port)) return true;
    if (!runningPid()) return false;
    await sleep(600);
  }
  return false;
}

function killPid(pid) {
  if (!alive(pid)) return;
  if (isWin) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* 进程可能已退出 */
    }
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    if (!alive(pid)) return;
    sleepSync(200);
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* ignore */
  }
}

async function stopServer(quiet = false) {
  const pid = runningPid();
  if (!pid) {
    if (!quiet) say('  服务当前没有在运行。');
    try {
      fs.rmSync(PID_FILE, { force: true });
    } catch {}
    return false;
  }
  killPid(pid);
  try {
    fs.rmSync(PID_FILE, { force: true });
  } catch {}
  if (!quiet) ok(`已停止（PID ${pid}）`);
  return true;
}

function serviceUrl(conf) {
  const host = !conf.host || conf.host === '0.0.0.0' ? '127.0.0.1' : conf.host;
  return `http://${host}:${conf.port || 3000}`;
}

/* ------------------------------- 命令实现 ------------------------------- */

async function cmdInstall(opts) {
  say(`CodeCamp v${pkgVersion()} 安装程序`);
  say('----------------------------------------');
  checkNode();
  ensureDirs();

  const conf = loadConf();
  const port = Number(opts.port || conf.port || 3000);
  const host = String(opts.host || conf.host || '0.0.0.0');

  if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`端口不合法：${opts.port}`);

  if (await probe(port)) {
    const pid = runningPid();
    warn(`端口 ${port} 上已经有服务在响应${pid ? `（PID ${pid}）` : ''}，视为已安装。`);
    saveConf({ port, host });
    printSummary(port, host);
    return;
  }
  if (runningPid()) {
    warn('检测到本目录的服务进程在运行但端口没有响应，先重启一次。');
    await stopServer(true);
  }
  if (!(await portFree(port, host))) {
    fail(`端口 ${port} 被其它程序占用，换一个端口：node scripts/setup.js install --port 3001`);
  }

  ok(`数据目录 ${DATA_DIR}`);
  ok(`日志文件 ${LOG_FILE}`);

  saveConf({ port, host, installedAt: new Date().toISOString(), version: pkgVersion() });
  const pid = startServer(port, host, !!opts.foreground);
  if (opts.foreground) return;

  say('  正在启动服务（首次启动会初始化数据库与演示数据）…');
  if (!(await waitReady(port))) {
    warn('服务没有在预期时间内就绪，最近日志：');
    say(tailLog(20));
    fail('启动失败。可运行 `node scripts/setup.js logs` 查看完整日志。');
  }
  ok(`服务已启动（PID ${pid}）`);
  printSummary(port, host);
}

function printSummary(port, host) {
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
  say('');
  say('安装完成 🎉');
  say(`  访问地址   ${url}`);
  if (host === '0.0.0.0') say(`  局域网访问 http://<本机 IP>:${port}（请放行防火墙端口）`);
  say('  初始账号   admin / teacher / student，密码均为 123456');
  say('  改密码     node scripts/setup.js passwd admin 你的新密码');
  say('  常用命令   node scripts/setup.js status|logs|restart|update|uninstall');
  say(`  数据位置   ${DATA_DIR}（升级、卸载都不会自动删除）`);
}

async function cmdStart(opts) {
  const conf = loadConf();
  const port = Number(opts.port || conf.port || 3000);
  const host = String(opts.host || conf.host || '0.0.0.0');
  if (runningPid() && (await probe(port))) {
    ok(`服务已在运行：${serviceUrl(conf)}`);
    return;
  }
  const pid = startServer(port, host, !!opts.foreground);
  if (opts.foreground) return;
  if (!(await waitReady(port))) fail('启动失败，请查看日志：node scripts/setup.js logs');
  ok(`服务已启动（PID ${pid}）：${serviceUrl(conf)}`);
}

async function cmdStop() {
  await stopServer();
}

async function cmdRestart() {
  const conf = loadConf();
  await stopServer(true);
  const port = Number(conf.port || 3000);
  const host = String(conf.host || '0.0.0.0');
  const pid = startServer(port, host, false);
  if (!(await waitReady(port))) fail('重启失败，请查看日志：node scripts/setup.js logs');
  ok(`已重启（PID ${pid}）：${serviceUrl(conf)}`);
}

async function cmdStatus() {
  const conf = loadConf();
  const pid = runningPid();
  const port = Number(conf.port || 3000);
  const up = await probe(port);
  say('CodeCamp 运行状态');
  say('----------------------------------------');
  say(`  版本       v${pkgVersion()}`);
  say(`  安装目录   ${ROOT}`);
  say(`  端口       ${port}（监听 ${conf.host || '0.0.0.0'}）`);
  say(`  进程       ${pid ? `运行中，PID ${pid}` : '未运行'}`);
  say(`  健康检查   ${up ? '正常' : '无响应'}`);
  say(`  访问地址   ${serviceUrl(conf)}`);
  say(`  数据大小   ${sizeOf(DATA_DIR)}`);
  if (!pid && !up) say('\n  启动：node scripts/setup.js start');
}

function sizeOf(dir) {
  let total = 0;
  const walk = (p) => {
    let entries;
    try {
      entries = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) walk(full);
      else {
        try {
          total += fs.statSync(full).size;
        } catch {}
      }
    }
  };
  walk(dir);
  return `${(total / 1024 / 1024).toFixed(1)} MB`;
}

function tailLog(lines = 60) {
  try {
    const text = fs.readFileSync(LOG_FILE, 'utf8');
    return text.split('\n').slice(-lines).join('\n');
  } catch {
    return '（还没有日志文件，服务可能从未启动过）';
  }
}

function cmdLogs() {
  say(`日志文件：${LOG_FILE}`);
  say('----------------------------------------');
  say(tailLog(80));
}

function commandExists(cmd) {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function cmdUpdate(opts) {
  say('更新 CodeCamp');
  say('----------------------------------------');
  const conf = loadConf();
  const port = Number(conf.port || 3000);
  const host = String(conf.host || '0.0.0.0');

  // 1. 停服务 + 备份数据库，任何一步失败都不动代码
  const wasRunning = !!runningPid();
  if (wasRunning) await stopServer(true);

  const backup = path.join(DATA_DIR, 'backups', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
  try {
    fs.mkdirSync(backup, { recursive: true });
    for (const name of ['codecamp.db', 'codecamp.db-wal', 'codecamp.db-shm']) {
      const from = path.join(DATA_DIR, name);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(backup, name));
    }
    ok(`已备份数据库到 ${path.relative(ROOT, backup)}`);
  } catch (e) {
    warn(`备份失败：${e.message}`);
  }

  // 2. 拉代码
  let pulled = false;
  if (fs.existsSync(path.join(ROOT, '.git')) && commandExists('git')) {
    try {
      execFileSync('git', ['-C', ROOT, 'pull', '--ff-only'], { stdio: 'inherit' });
      pulled = true;
    } catch {
      warn('git pull 没有成功（可能有本地改动或没有远端权限），继续用当前代码重启。');
    }
  } else {
    warn('当前目录不是 git 仓库，跳过代码拉取；如用压缩包安装，请手动覆盖文件。');
  }
  if (pulled) ok('代码已更新到最新版本');

  // 3. 重新启动：保持更新前的状态，原来在跑才重启
  if (wasRunning && !opts['no-start']) {
    const pid = startServer(port, host, false);
    if (!(await waitReady(port, 60000))) {
      warn('新版本启动失败，日志末尾：');
      say(tailLog(25));
      fail(`升级失败。数据库备份在 ${backup}，可回滚后重试。`);
    }
    ok(`已用新版本启动（PID ${pid}）：${serviceUrl(conf)}`);
  } else if (!wasRunning) {
    say('  服务更新前未在运行，未自动启动。需要时执行：node scripts/setup.js start');
  }
  if (backup && fs.existsSync(backup)) say(`\n数据备份：${backup}`);
}

async function cmdUninstall(opts) {
  say('卸载 CodeCamp');
  say('----------------------------------------');
  const purge = !!opts.purge;
  const auto = !!opts.yes || !!opts.y;

  say(`  安装目录：${ROOT}`);
  say(`  数据目录：${DATA_DIR}${purge ? '（将被删除）' : '（保留）'}`);
  say('');
  say('  将会：停止服务、删除 .runtime 运行状态与 data/logs 日志。');
  if (purge) say('  警告：--purge 会连同账号、作品、上传素材一起删除，无法恢复！');
  else say('  账号、作品、上传素材（data/）会保留，重新安装后依然可用。');
  say('');

  if (!auto) {
    const answer = await ask(purge ? '确认卸载并删除全部数据？输入 yes 继续：' : '确认卸载？输入 yes 继续：');
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      say('已取消。');
      return;
    }
  }

  await stopServer(true);
  ok('服务已停止');

  try {
    fs.rmSync(RUNTIME, { recursive: true, force: true });
    ok('已删除 .runtime');
  } catch (e) {
    warn(`删除 .runtime 失败：${e.message}`);
  }
  try {
    fs.rmSync(LOG_DIR, { recursive: true, force: true });
    ok('已删除运行日志');
  } catch {}

  if (purge) {
    try {
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
      ok('已删除 data（账号、作品、素材）');
    } catch (e) {
      warn(`删除 data 失败：${e.message}，请手动删除 ${DATA_DIR}`);
    }
  }

  say('');
  say('卸载完成。');
  say(`  代码目录还在：${ROOT}`);
  say('  确认不再需要时可以整个删掉该目录（Windows 资源管理器 / rm -rf 均可）。');
  if (!purge) say(`  想彻底清空数据：node scripts/setup.js uninstall --purge`);
}

async function cmdPasswd(opts) {
  const [username, password] = opts._;
  if (!username || !password) fail('用法：node scripts/setup.js passwd <用户名> <新密码>');
  if (password.length < 6) fail('新密码至少 6 位');
  const { hashPassword } = require('../src/auth');
  const { db } = require('../src/db');
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) fail(`用户不存在：${username}`);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(password), user.id);
  ok(`已更新 ${username} 的密码`);
}

function cmdHelp() {
  say(`CodeCamp v${pkgVersion()} 管理脚本

用法：node scripts/setup.js <命令> [选项]

命令：
  install       安装并后台启动（默认端口 3000，监听 0.0.0.0）
    --port N      指定端口
    --host H      监听地址（默认 0.0.0.0，只给本机用可填 127.0.0.1）
    --foreground  前台运行，Ctrl+C 停止
  update        备份数据库 → git pull → 重启
  uninstall     停止服务并清理运行状态（默认保留数据）
    --purge       连同 data/（账号、作品、素材）一起删除
    --yes         跳过确认
  start | stop | restart | status | logs
  passwd <用户名> <新密码>    重置某个账号的密码

示例：
  node scripts/setup.js install --port 8080
  node scripts/setup.js update
  node scripts/setup.js uninstall --purge`);
}

/* ------------------------------- 入口 ------------------------------- */

(async () => {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  const cmd = opts._.shift() || 'help';
  switch (cmd) {
    case 'install':
      return cmdInstall(opts);
    case 'start':
      return cmdStart(opts);
    case 'stop':
      return cmdStop();
    case 'restart':
      return cmdRestart();
    case 'status':
      return cmdStatus();
    case 'logs':
      return cmdLogs();
    case 'update':
      return cmdUpdate(opts);
    case 'uninstall':
      return cmdUninstall(opts);
    case 'passwd':
      return cmdPasswd(opts);
    case 'help':
    case '--help':
    case '-h':
      return cmdHelp();
    default:
      say(`未知命令：${cmd}`);
      say('');
      return cmdHelp();
  }
})().catch((e) => {
  say('');
  say('出错了：' + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
