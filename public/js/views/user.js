import { api } from '../api.js';
import { avatarHtml, bindCards, esc, workCard } from '../ui.js';

export async function render(root, { params }) {
  const [u, works] = await Promise.all([api('/users/' + params.author), api('/projects?author=' + params.author + '&limit=60')]);
  const roleLabel = { admin: '管理员', teacher: '教师', student: '学生' };

  root.innerHTML = `<div class="container page">
    <div class="card" style="padding:26px;display:flex;gap:18px;align-items:center;flex-wrap:wrap">
      ${avatarHtml(u, 'lg')}
      <div class="grow">
        <h1 style="font-size:20px">${esc(u.nickname)}</h1>
        <div class="muted" style="font-size:13px;margin-top:4px">${roleLabel[u.role] || '用户'} · 加入于 ${(u.created_at || '').slice(0, 10)}</div>
        ${u.bio ? `<div style="margin-top:8px;font-size:13px;color:#4a4d63">${esc(u.bio)}</div>` : ''}
      </div>
      <div class="center">
        <div style="font-size:22px;font-weight:800">${works.total}</div>
        <div class="tiny muted">已发布作品</div>
      </div>
    </div>
    <div class="section-title"><h2>TA 的作品</h2></div>
    ${
      works.items.length
        ? `<div class="grid cards" id="grid">${works.items.map(workCard).join('')}</div>`
        : `<div class="empty"><div class="icon">🫧</div><h3>还没有公开作品</h3></div>`
    }
  </div>`;
  bindCards(root);
}
