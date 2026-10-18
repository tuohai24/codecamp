/**
 * 后台骨架：左侧导航 + 右侧内容。
 * 管理员、老师、学生三套后台共用，只是 nav 与内容不同。
 */
import { state } from './api.js';
import { avatarHtml, esc } from './ui.js';

const ROLE_LABEL = { admin: '管理员', teacher: '教师', student: '学生' };
const ROLE_TAG = { admin: '平台管理', teacher: '教学工作台', student: '学习空间' };

export function dashShell(root, { title, sub = '', nav = [], active = '', actions = '', user }) {
  const u = user || state.user;
  const items = nav
    .map(
      ([key, label, icon, badge]) =>
        `<a href="${key.href}" class="${key.tab === active ? 'active' : ''}">
           <span class="ico">${icon}</span>${esc(label)}
           ${badge ? `<span class="badge">${badge}</span>` : ''}
         </a>`
    )
    .join('');

  root.innerHTML = `<div class="container page">
    <div class="dash">
      <aside class="dash-side">
        <div class="dash-who">
          ${avatarHtml(u)}
          <div class="grow" style="min-width:0">
            <b>${esc(u.nickname)}</b>
            <div class="tiny muted">${ROLE_LABEL[u.role] || '用户'} · ${ROLE_TAG[u.role] || ''}</div>
          </div>
        </div>
        <nav class="dash-nav">${items}</nav>
      </aside>
      <div class="dash-main">
        <div class="dash-head">
          <div>
            <h1>${esc(title)}</h1>
            ${sub ? `<div class="sub">${sub}</div>` : ''}
          </div>
          <div class="grow"></div>
          ${actions}
        </div>
        <div id="dash-body"></div>
      </div>
    </div>
  </div>`;
  return root.querySelector('#dash-body');
}

/** 生成一个导航项 */
export const navItem = (tab, label, icon, base, badge) => [{ href: `${base}?tab=${tab}`, tab }, label, icon, badge];

/** 统一的小标题 */
export const panelTitle = (text, extra = '') =>
  `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h3 class="panel-title" style="margin:0">${esc(text)}</h3>${extra}</div>`;

export function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
  if (v < 1024 * 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB';
  return (v / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

export function fmtUptime(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} 天 ${h} 小时`;
  if (h) return `${h} 小时 ${m} 分`;
  return `${m} 分钟`;
}
