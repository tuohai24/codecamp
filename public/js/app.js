import { api, state, loadMe, loadSite, logout } from './api.js';
import { avatarHtml, esc, modal, toast } from './ui.js';
import { render as renderHome } from './views/home.js';
import { render as renderExplore } from './views/explore.js';
import { render as renderProject } from './views/project.js';
import { render as renderAuth } from './views/auth.js';
import { render as renderMe } from './views/me.js';
import { render as renderTeacher } from './views/teacher.js';
import { render as renderAdmin } from './views/admin.js';
import { render as renderUser } from './views/user.js';
import { render as renderShare } from './views/share.js';

const view = document.getElementById('view');

function parseHash() {
  let h = location.hash.slice(1) || '/';
  const [path, qs] = h.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  return { path: path || '/', query };
}

const routes = [
  { re: /^\/$/, fn: renderHome },
  { re: /^\/explore$/, fn: renderExplore },
  { re: /^\/p\/(\d+)$/, fn: renderProject, keys: ['id'] },
  { re: /^\/s\/([A-Za-z0-9_-]{4,32})$/, fn: renderShare, keys: ['token'] },
  { re: /^\/login$/, fn: renderAuth },
  { re: /^\/me$/, fn: renderMe, auth: true },
  { re: /^\/teacher$/, fn: renderTeacher, roles: ['teacher', 'admin'] },
  { re: /^\/admin$/, fn: renderAdmin, roles: ['admin'] },
  { re: /^\/u\/(\d+)$/, fn: renderUser, keys: ['author'] },
];

function renderHeader() {
  const u = state.user;
  const area = document.getElementById('user-area');
  if (u) {
    const consoleLink =
      u.role === 'admin'
        ? `<a href="#/admin">管理后台</a>`
        : u.role === 'teacher'
        ? `<a href="#/teacher">教学中心</a>`
        : `<a href="#/me">我的学习</a>`;
    area.innerHTML = `
      <div class="usermenu" id="usermenu">
        ${avatarHtml(u)}
        <div style="line-height:1.15">
          <div style="font-size:13px;font-weight:700">${esc(u.nickname)}</div>
          <div class="tiny muted">${{ admin: '管理员', teacher: '教师', student: '学生' }[u.role]}</div>
        </div>
        <span class="muted" style="font-size:10px">▾</span>
      </div>`;
    const menu = area.querySelector('#usermenu');
    menu.addEventListener('click', () => {
      modal({
        title: '账号',
        body: `<div class="col">
          <a class="btn ghost" href="#/me" data-close style="justify-content:flex-start">👤 个人中心</a>
          <a class="btn ghost" href="#/teacher" data-close style="justify-content:flex-start">🏫 教学中心</a>
          <a class="btn ghost" href="#/admin" data-close style="justify-content:flex-start">⚙️ 管理后台</a>
          <button class="btn danger" id="do-logout" style="justify-content:flex-start">退出登录</button>
        </div>`,
        cancelText: '',
        okText: '关闭',
        onOk: () => true,
      }).mask.querySelector('#do-logout').addEventListener('click', () => {
        logout();
        location.hash = '#/';
        location.reload();
      });
    });
  } else {
    area.innerHTML = `<div class="row" style="gap:8px"><a class="btn ghost sm" href="#/login">登录</a><a class="btn primary sm" href="#/login?mode=register">注册</a></div>`;
  }

  const { path, query } = parseHash();
  const navKey = path === '/' ? '/' : path === '/explore' && query.type ? `/explore?type=${query.type}` : path;
  document.querySelectorAll('#nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === navKey || (a.dataset.nav === '/explore' && path === '/explore' && !query.type));
  });
}

async function createProject(type) {
  if (!state.user) {
    toast('请先登录后再创作', 'err');
    location.hash = '#/login';
    return;
  }
  try {
    const p = await api('/projects', { method: 'POST', body: { type } });
    location.href = `/studio/${type === 'python' ? 'python' : 'scratch'}.html?id=${p.id}`;
  } catch (e) {
    toast(e.message, 'err');
  }
}

export function openCreateDialog() {
  const m = modal({
    title: '选择创作类型',
    body: `<div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
      <div class="card" data-t="scratch" style="padding:18px;cursor:pointer;text-align:center">
        <div style="font-size:34px">🐱</div>
        <h3 style="margin:8px 0 4px;font-size:15px">Scratch 积木</h3>
        <div class="tiny muted">拖拽积木，让角色动起来</div>
      </div>
      <div class="card" data-t="python" style="padding:18px;cursor:pointer;text-align:center">
        <div style="font-size:34px">🐍</div>
        <h3 style="margin:8px 0 4px;font-size:15px">Python 代码</h3>
        <div class="tiny muted">真实运行，可装第三方库</div>
      </div>
    </div>`,
    cancelText: '取消',
    okText: '',
    onOk: () => true,
  });
  m.mask.querySelectorAll('[data-t]').forEach((el) =>
    el.addEventListener('click', () => {
      m.close();
      createProject(el.dataset.t);
    })
  );
  m.mask.querySelector('[data-ok]').style.display = 'none';
}

document.getElementById('btn-create').addEventListener('click', (e) => {
  e.preventDefault();
  openCreateDialog();
});

/* ---------- 移动端导航 ---------- */
const navToggle = document.getElementById('nav-toggle');
const navScrim = document.getElementById('nav-scrim');
function setMenu(open) {
  document.body.classList.toggle('menu-open', open);
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}
navToggle.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
navScrim.addEventListener('click', () => setMenu(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setMenu(false);
});

function bindSearch(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = el.value.trim();
    setMenu(false);
    el.blur();
    location.hash = q ? `#/explore?q=${encodeURIComponent(q)}` : '#/explore';
  });
}
bindSearch('global-search');
bindSearch('global-search-m');

async function route() {
  const { path, query } = parseHash();
  setMenu(false);
  // 换页时收掉上一页还开着的弹窗，避免遮罩留在新页面
  document.querySelectorAll('.modal-mask').forEach((m) => m.remove());
  // 分享页是给外部访客看的独立页面，隐藏站点导航条
  document.body.classList.toggle('share-mode', /^\/s\//.test(path));
  renderHeader();
  let matched = null;
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      matched = { r, m };
      break;
    }
  }
  if (!matched) {
    view.innerHTML = `<div class="container page"><div class="empty"><div class="icon">🧭</div><h3>页面不存在</h3><a class="btn ghost" href="#/">回到首页</a></div></div>`;
    return;
  }
  const { r, m } = matched;
  const params = {};
  (r.keys || []).forEach((k, i) => (params[k] = m[i + 1]));

  if (r.auth && !state.user) {
    location.hash = '#/login';
    return;
  }
  if (r.roles && (!state.user || !r.roles.includes(state.user.role))) {
    view.innerHTML = `<div class="container page"><div class="empty"><div class="icon">🔒</div><h3>没有访问权限</h3><div class="muted">请使用 ${
      r.roles.includes('admin') ? '管理员' : '教师'
    } 账号登录</div><a class="btn ghost" href="#/login" style="margin-top:12px">去登录</a></div></div>`;
    return;
  }

  window.scrollTo({ top: 0 });
  try {
    await r.fn(view, { params, query });
  } catch (e) {
    view.innerHTML = `<div class="container page"><div class="empty"><div class="icon">💥</div><h3>加载失败</h3><div class="muted">${esc(e.message)}</div></div></div>`;
  }
}

window.addEventListener('hashchange', route);

(async function boot() {
  try {
    const site = await loadSite();
    document.getElementById('site-name').textContent = site.name;
    document.title = site.name;
  } catch {}
  await loadMe();
  await route();
})();

export { createProject, route as rerender };
