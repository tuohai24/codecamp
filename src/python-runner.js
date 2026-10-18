'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const VENV = path.join(DATA, 'pyenv');
const RUNS = path.join(DATA, 'runs');
const SHIM = path.join(ROOT, 'runners', 'pyshim');
fs.mkdirSync(RUNS, { recursive: true });

function candidates() {
  const list = [];
  if (process.env.PYTHON_BIN) list.push(process.env.PYTHON_BIN);
  list.push('python', 'python3', 'py');
  if (process.platform === 'win32') {
    list.push('C:\\Python313\\python.exe', 'C:\\Python312\\python.exe');
  }
  return list;
}

function detectPython() {
  for (const bin of candidates()) {
    const r = spawnSync(bin, ['-c', 'import sys;print(sys.version_info[0])'], { encoding: 'utf8' });
    if (r.status === 0 && String(r.stdout).trim() === '3') return bin;
  }
  return null;
}

let pyBin = detectPython();
const venvPy = () =>
  process.platform === 'win32'
    ? path.join(VENV, 'Scripts', 'python.exe')
    : path.join(VENV, 'bin', 'python');
const venvPip = () =>
  process.platform === 'win32' ? path.join(VENV, 'Scripts', 'pip.exe') : path.join(VENV, 'bin', 'pip');

let envReady = null;
function ensureEnv() {
  if (envReady) return envReady;
  envReady = new Promise((resolve) => {
    if (fs.existsSync(venvPy())) return resolve(venvPy());
    pyBin = pyBin || detectPython();
    if (!pyBin) return resolve(null);
    const r = spawnSync(pyBin, ['-m', 'venv', VENV], { encoding: 'utf8', timeout: 120000 });
    if (r.status === 0 && fs.existsSync(venvPy())) return resolve(venvPy());
    // 无 venv 模块时退回系统解释器
    resolve(pyBin);
  });
  return envReady;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, {
      ...opts,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1', ...(opts.env || {}) },
    });
    let stdout = '';
    let stderr = '';
    let killed = false;
    const timer = opts.timeout
      ? setTimeout(() => {
          killed = true;
          try {
            if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
            else child.kill('SIGKILL');
          } catch {}
        }, opts.timeout)
      : null;
    child.stdout.on('data', (d) => {
      if (stdout.length < 200000) stdout += d.toString('utf8');
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < 200000) stderr += d.toString('utf8');
    });
    child.on('error', (e) => {
      if (timer) clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + '\n' + e.message, killed, ms: Date.now() - started });
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, killed, ms: Date.now() - started });
    });
  });
}

const GUARD = [
  [/(^|\W)(shutil\.rmtree|os\.removedirs)\s*\(/m, '禁止批量删除目录（教学环境限制）'],
  [/subprocess\.(run|Popen|call)\s*\(\s*['"]rm\s+-rf/m, '禁止执行破坏性命令'],
  [/(socket\.socket|urllib\.request|requests\.)\.?\w*\s*\(/m, null],
];

function guard(code) {
  for (const [re, msg] of GUARD) {
    if (msg && re.test(code)) throw new Error(msg);
  }
  if (code.length > 120000) throw new Error('代码过长（上限 120KB）');
}

const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif' };

function collectImages(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else {
        const ext = path.extname(name).toLowerCase();
        if (MIME[ext] && st.size < 2.5 * 1024 * 1024) {
          out.push({
            name,
            mime: MIME[ext],
            data: fs.readFileSync(full).toString('base64'),
          });
        }
      }
    }
  };
  try {
    walk(dir);
  } catch {}
  return out.slice(0, 6);
}

async function runCode(code, { timeout = 15000 } = {}) {
  guard(code);
  const py = await ensureEnv();
  if (!py) return { ok: false, stdout: '', stderr: '未检测到 Python 3 解释器，请安装 Python 3.9+ 或设置 PYTHON_BIN 环境变量', images: [], ms: 0 };
  const dir = path.join(RUNS, crypto.randomUUID().slice(0, 8));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'main.py'), code, 'utf8');
  const res = await run(py, ['-u', 'main.py'], {
    cwd: dir,
    timeout,
    env: {
      PYTHONPATH: SHIM,
      MPLBACKEND: 'Agg',
      PYTHONWARNINGS: 'ignore',
      HOME: dir,
      TMPDIR: dir,
    },
  });
  const images = collectImages(dir);
  const cleanup = () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  };
  if (images.length === 0) cleanup();
  else setTimeout(cleanup, 120000);
  let stderr = res.stderr;
  if (res.killed) stderr += `\n[运行超时，已终止（上限 ${timeout / 1000}s）]`;
  return {
    ok: res.code === 0 && !res.killed,
    stdout: res.stdout,
    stderr,
    images,
    ms: res.ms,
    exitCode: res.code,
  };
}

async function installPackages(packages, indexUrl) {
  const py = await ensureEnv();
  if (!py) throw new Error('未检测到 Python 3 解释器');
  const safe = [];
  for (const raw of packages) {
    const name = String(raw).trim();
    if (!/^[A-Za-z0-9_.\-\[\]=<>,!~*]+$/.test(name)) throw new Error(`非法的包名：${name}`);
    safe.push(name);
  }
  if (!safe.length) throw new Error('没有指定要安装的包');
  const pip = fs.existsSync(venvPip()) ? venvPip() : py;
  const base = fs.existsSync(venvPip()) ? ['install', ...safe] : ['-m', 'pip', 'install', ...safe];
  const build = (idx) => [...base, ...(idx ? ['-i', idx] : []), '--disable-pip-version-check', '--no-input'];
  let res = await run(pip, build(indexUrl), { timeout: 180000 });
  // 镜像源不可用时回退到官方源
  if (res.code !== 0 && indexUrl && !/pypi\.org/.test(indexUrl)) {
    const retry = await run(pip, build('https://pypi.org/simple'), { timeout: 180000 });
    if (retry.code === 0) res = retry;
    else res.stderr = (res.stdout + res.stderr + '\n----- 回退官方源 -----\n' + retry.stdout + retry.stderr);
  }
  return {
    ok: res.code === 0,
    log: (res.stdout + '\n' + res.stderr).trim().slice(-8000),
    ms: res.ms,
  };
}

async function listPackages() {
  const py = await ensureEnv();
  if (!py) return [];
  const pip = fs.existsSync(venvPip()) ? venvPip() : py;
  const args = fs.existsSync(venvPip()) ? ['list', '--format=json'] : ['-m', 'pip', 'list', '--format=json'];
  const res = await run(pip, args, { timeout: 60000 });
  try {
    const json = JSON.parse(res.stdout.slice(res.stdout.indexOf('[')));
    return json.filter((p) => !['pip', 'setuptools', 'wheel'].includes(p.name));
  } catch {
    return [];
  }
}

module.exports = { runCode, installPackages, listPackages, ensureEnv, detectPython: () => pyBin };
