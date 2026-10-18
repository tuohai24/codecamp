import { api, loadMe, state } from '../api.js';
import { avatarHtml, confirmDialog, esc, fileToDataUrl, modal, timeAgo, toast, typeIcon, typeLabel } from '../ui.js';
import { openCreateDialog, rerender } from '../app.js';
import { openShareDialog } from '../share.js';
import { dashShell, navItem, panelTitle } from '../dash.js';
import { mdToText, renderMarkdown } from '../md.js';

const BASE = '#/student';
const TABS = [
  ['overview', '概览', '📊'],
  ['works', '我的作品', '🎨'],
  ['homework', '班级作业', '📚'],
  ['grades', '成绩单', '🏅'],
  ['settings', '账号设置', '⚙️'],
];

export async function render(root, { query }) {
  await loadMe();
  const tab = TABS.some(([k]) => k === query.tab) ? query.tab : 'overview';
  const u = state.user;

  const body = dashShell(root, {
    title: '学生后台',
    sub: `<span class="muted">${esc(u.className || '暂未加入班级')} · ${esc(u.bio || '还没有填写简介')}</span>`,
    nav: TABS.map(([key, label, icon]) => navItem(key, label, icon, BASE)),
    active: tab,
    actions: `<button class="btn primary" id="new-work">＋ 新建作品</button>`,
  });
  body.parentElement.querySelector('#new-work').addEventListener('click', () => openCreateDialog());

  if (tab === 'overview') await overview(body);
  else if (tab === 'works') await renderWorks(body);
  else if (tab === 'homework') await renderHomework(body);
  else if (tab === 'grades') await renderGrades(body);
  else renderSettings(body);
}

/* ---------------- 概览 ---------------- */
async function overview(body) {
  const s = await api('/student/overview');
  const pending = Math.max(0, s.assignments - s.submitted);
  body.innerHTML = `<div class="stat-grid">
      ${[
        ['我的作品', s.works, `已发布 ${s.published}`],
        ['收到的赞', s.likes, '来自同学与老师'],
        ['班级作业', s.assignments, s.inClass ? `已完成 ${s.submitted}` : '还未加入班级'],
        ['待完成', pending, pending ? '继续加油' : '都完成啦', pending ? 'accent' : ''],
        ['已批改', s.graded, '份'],
        ['平均分', s.avgScore == null ? '—' : s.avgScore, '分'],
      ]
        .map(
          ([l, v, f, cls]) =>
            `<div class="stat-card ${cls || ''}"><div class="label">${l}</div><div class="value">${v}</div><div class="foot">${f}</div></div>`
        )
        .join('')}
    </div>

    <div class="split-even" style="margin-top:18px">
      <div class="panel">
        ${panelTitle('最近成绩', `<a class="link-btn" href="${BASE}?tab=grades">全部成绩 →</a>`)}
        ${
          s.recent.length
            ? `<table class="table"><tbody>${s.recent
                .map(
                  (r) => `<tr>
                  <td><b>${esc(r.assignment_title)}</b><div class="tiny muted">${r.type === 'python' ? 'Python' : 'Scratch'} · ${timeAgo(r.updated_at)}</div></td>
                  <td>${r.status === 'graded' ? `<span class="pill green">${r.score ?? '-'} 分</span>` : '<span class="pill amber">已提交</span>'}</td>
                </tr>`
                )
                .join('')}</tbody></table>`
            : '<div class="empty" style="padding:26px"><div>还没有提交记录</div></div>'
        }
      </div>
      <div class="panel">
        ${panelTitle('接下来做什么')}
        <div class="col" style="gap:8px">
          <a class="btn ghost" href="${BASE}?tab=homework" style="justify-content:flex-start">📚 看看班级作业（${pending} 份待完成）</a>
          <a class="btn ghost" href="${BASE}?tab=works" style="justify-content:flex-start">🎨 继续完善我的作品（${s.works} 个）</a>
          <a class="btn ghost" href="#/explore" style="justify-content:flex-start">🌍 逛逛作品社区，找点灵感</a>
        </div>
        <div class="dash-tip" style="margin-top:14px">
          小提示：作品发布后可以在作品卡片上生成分享链接，发给同学一起改编。
        </div>
      </div>
    </div>`;
}

/* ---------------- 我的作品 ---------------- */
async function renderWorks(body) {
  const works = await api('/projects?mine=1&limit=60');
  if (!works.items.length) {
    body.innerHTML = `<div class="empty"><div class="icon">🎨</div><h3>还没有作品</h3><div>点右上角「新建作品」开始第一个创作</div><button class="btn primary" id="go-new" style="margin-top:14px">＋ 新建作品</button></div>`;
    body.querySelector('#go-new').addEventListener('click', () => openCreateDialog());
    return;
  }
  body.innerHTML = `<div class="grid cards">${works.items
    .map(
      (p) => `<article class="work-card">
        <div class="work-thumb" data-goto="${p.id}">
          ${p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy" />` : `<div class="ph">${typeIcon(p.type)}</div>`}
          <span class="type-badge">${typeIcon(p.type)} ${typeLabel(p.type)}</span>
          ${!p.published ? '<span class="pill amber" style="position:absolute;right:10px;top:10px">草稿</span>' : ''}
        </div>
        <div class="work-body">
          <h3 data-goto="${p.id}">${esc(p.title)}</h3>
          <div class="work-meta"><span>${timeAgo(p.updated_at)}</span><span class="dot">·</span><span>❤ ${p.likes}</span><span class="grow"></span><span>👁 ${p.views}</span></div>
          <div class="row" style="gap:6px;margin-top:8px">
            <a class="btn sm primary grow" href="/studio/${p.type === 'python' ? 'python' : 'scratch'}.html?id=${p.id}">继续编辑</a>
            ${p.published ? `<button class="btn sm ghost" data-share="${p.id}" title="创建分享链接">🔗</button>` : ''}
            <button class="btn sm ghost" data-del="${p.id}">删除</button>
          </div>
        </div>
      </article>`
    )
    .join('')}</div>`;

  body.querySelectorAll('[data-goto]').forEach((el) =>
    el.addEventListener('click', () => (location.hash = '#/p/' + el.dataset.goto))
  );
  body.querySelectorAll('[data-del]').forEach((el) =>
    el.addEventListener('click', async () => {
      if (!(await confirmDialog('删除这个作品？删除后无法恢复，如需彻底收回请先取消发布。'))) return;
      try {
        await api('/projects/' + el.dataset.del, { method: 'DELETE' });
        toast('已删除', 'ok');
        rerender();
      } catch (e) {
        toast(e.message, 'err');
      }
    })
  );
  body.querySelectorAll('[data-share]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openShareDialog(Number(el.dataset.share));
    })
  );
}

/* ---------------- 班级作业 ---------------- */
async function renderHomework(body) {
  const list = await api('/assignments');
  if (!Array.isArray(list) || !list.length) {
    body.innerHTML = `<div class="empty"><div class="icon">📚</div><h3>暂时没有作业</h3><div>等老师布置后就会出现在这里</div></div>`;
    return;
  }
  const byId = new Map(list.map((a) => [a.id, a]));
  body.innerHTML = `<div class="col" style="gap:12px">${list
    .map((a) => {
      const graded = a.submit_status === 'graded';
      const missing = a.submit_status === 'missing';
      const submitted = !!a.submitted && !missing;
      const status = graded ? '已批改' : submitted ? '已提交' : missing ? '作品已删除' : '待完成';
      const cls = graded || submitted ? 'green' : missing ? 'pink' : 'amber';
      const due = a.due_at ? new Date(a.due_at).toLocaleDateString('zh-CN') : '未设置';
      const overdue = a.due_at && !submitted && new Date(a.due_at) < new Date();
      const hasWork = !!a.work_project_id && !!a.work_title;
      const startLabel = submitted ? '继续完善' : hasWork ? '继续完成' : '去完成';
      const desc = mdToText(a.description || '', 130);
      return `<div class="card" style="padding:16px 18px">
        <div class="row hw-row" style="gap:12px;align-items:flex-start">
          <div style="width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:var(--brand-soft);font-size:18px;flex:0 0 auto">${typeIcon(a.type)}</div>
          <div class="grow" style="min-width:0">
            <div class="row wrap" style="gap:8px"><b>${esc(a.title)}</b><span class="pill ${cls}">${status}</span>${overdue ? '<span class="pill pink">已截止</span>' : ''}</div>
            <div class="tiny muted" style="margin-top:4px">${typeLabel(a.type)} · 截止 ${due} · ${esc(a.teacher_name || '')}</div>
            ${
              desc
                ? `<div class="hw-desc">${esc(desc)}</div>`
                : '<div class="tiny muted" style="margin-top:8px">老师没有填写具体要求</div>'
            }
            ${a.description ? '<button class="link-btn" data-viewhwk="' + a.id + '">查看完整要求（含图片）</button>' : ''}
            ${hasWork ? `<div class="tiny" style="margin-top:8px;color:var(--brand)">↳ 我的作业作品：${esc(a.work_title)} · ${timeAgo(a.work_updated_at)}</div>` : ''}
          </div>
          <div class="col hw-actions" style="gap:6px;flex:0 0 104px">
            <button class="btn primary sm" data-start="${a.id}">▶ ${startLabel}</button>
            <button class="btn ghost sm" data-submit="${a.id}" data-type="${a.type}">${submitted || missing ? '重新提交' : '提交作品'}</button>
          </div>
        </div>
      </div>`;
    })
    .join('')}</div>`;

  body.querySelectorAll('[data-start]').forEach((btn) => btn.addEventListener('click', () => startAssignment(Number(btn.dataset.start), btn)));
  body.querySelectorAll('[data-submit]').forEach((btn) =>
    btn.addEventListener('click', () => openSubmitDialog(Number(btn.dataset.submit), btn.dataset.type))
  );
  body.querySelectorAll('[data-viewhwk]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const a = byId.get(Number(btn.dataset.viewhwk));
      modal({
        title: a.title,
        width: 680,
        cancelText: '关闭',
        okText: '',
        onOk: () => true,
        body: `<div class="row wrap" style="gap:6px;margin-bottom:12px">
            <span class="pill">${typeLabel(a.type)}</span>
            <span class="pill">截止 ${a.due_at ? new Date(a.due_at).toLocaleDateString('zh-CN') : '未设置'}</span>
            <span class="pill">${esc(a.teacher_name || '')}</span>
          </div>
          <div class="md-body">${renderMarkdown(a.description || '_老师没有填写具体要求_')}</div>`,
      }).mask.querySelector('[data-ok]').style.display = 'none';
    })
  );
}

/** 去完成：准备（或复用）这份作业的创作草稿，然后打开对应编辑器 */
async function startAssignment(assignmentId, btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = '准备中…';
  try {
    const res = await api(`/assignments/${assignmentId}/start`, { method: 'POST' });
    const page = res.type === 'python' ? 'python' : 'scratch';
    location.href = `/studio/${page}.html?id=${res.projectId}&assignment=${assignmentId}`;
  } catch (e) {
    btn.disabled = false;
    btn.textContent = label;
    toast(e.message, 'err');
  }
}

async function openSubmitDialog(assignmentId, type) {
  const works = await api('/projects?mine=1&type=' + type + '&limit=60');
  const list = works.items.filter((w) => w.type === type);
  const m = modal({
    title: '选择要提交的作品',
    width: 560,
    body: list.length
      ? `<div class="col" style="gap:8px">${list
          .map(
            (w) => `<label class="card" style="padding:10px 12px;display:flex;gap:10px;align-items:center;cursor:pointer">
              <input type="radio" name="pid" value="${w.id}" style="width:auto" />
              <span style="font-size:20px">${typeIcon(w.type)}</span>
              <span class="grow"><b style="font-size:13.5px">${esc(w.title)}</b><div class="tiny muted">更新于 ${timeAgo(w.updated_at)}</div></span>
            </label>`
          )
          .join('')}</div><div class="tiny muted" style="margin-top:10px">提交后老师就能在批改页打开这份作品；想让同学也看到，可以再点「发布」。</div>`
      : `<div class="empty" style="padding:24px"><div class="icon">📝</div><h3>还没有 ${typeLabel(type)} 作品</h3><div>先去创作一个再来提交吧</div></div>`,
    okText: '提交',
    onOk: async (mask) => {
      const sel = mask.querySelector('input[name="pid"]:checked');
      if (!sel) {
        toast('请选择一个作品', 'err');
        return false;
      }
      await api(`/assignments/${assignmentId}/submit`, { method: 'POST', body: { projectId: Number(sel.value) } });
      toast('提交成功', 'ok');
      rerender();
      return true;
    },
  });
  if (!list.length) m.mask.querySelector('[data-ok]').style.display = 'none';
}

/* ---------------- 成绩单 ---------------- */
async function renderGrades(body) {
  const list = await api('/submissions');
  body.innerHTML = `<div class="panel">
    ${panelTitle('我的成绩', `<span class="tiny muted">共 ${list.length} 次提交</span>`)}
    ${
      list.length
        ? `<table class="table">
        <thead><tr><th>作业</th><th>类型</th><th>提交时间</th><th>状态</th><th style="width:80px">分数</th><th>评语</th></tr></thead>
        <tbody>${list
          .map(
            (s) => `<tr>
            <td><b>${esc(s.assignment_title || '')}</b><div class="tiny muted">${esc(s.project_title || '')}</div></td>
            <td><span class="pill">${s.type === 'python' ? '🐍' : '🐱'}</span></td>
            <td class="tiny muted">${timeAgo(s.updated_at)}</td>
            <td>${s.status === 'graded' ? '<span class="pill green">已批改</span>' : '<span class="pill amber">待批改</span>'}</td>
            <td><b>${s.score == null ? '—' : s.score}</b></td>
            <td class="tiny">${esc(s.feedback || '—')}</td>
          </tr>`
          )
          .join('')}</tbody></table>`
        : `<div class="empty"><div class="icon">🏅</div><h3>还没有成绩</h3><div>完成并提交作业后，老师批改完就会显示在这里</div></div>`
    }
  </div>`;
}

/* ---------------- 账号设置 ---------------- */
function renderSettings(body) {
  const u = state.user;
  body.innerHTML = `<div class="split-even">
    <div class="panel">
      ${panelTitle('基本资料')}
      <div class="row" style="margin-bottom:16px">
        ${avatarHtml(u, 'lg')}
        <div>
          <div style="font-weight:700">${esc(u.nickname)}</div>
          <div class="tiny muted">@${esc(u.username)}</div>
          <button class="btn sm ghost" id="up-avatar" style="margin-top:6px">更换头像</button>
        </div>
      </div>
      <div class="field"><label>昵称</label><input id="f-nick" value="${esc(u.nickname)}" maxlength="20" /></div>
      <div class="field"><label>个人简介</label><textarea id="f-bio" maxlength="200" placeholder="写一句话介绍自己">${esc(u.bio || '')}</textarea></div>
      <button class="btn primary" id="save-profile">保存资料</button>
    </div>
    <div class="panel">
      ${panelTitle('修改密码')}
      <div class="field"><label>原密码</label><input id="f-old" type="password" autocomplete="current-password" /></div>
      <div class="field"><label>新密码</label><input id="f-new" type="password" placeholder="至少 6 位" autocomplete="new-password" /></div>
      <button class="btn primary" id="save-pwd">更新密码</button>
      <div class="tiny muted" style="margin-top:16px;line-height:1.8">
        账号类型：${{ student: '学生', teacher: '教师', admin: '管理员' }[u.role]}<br>
        所属班级：${esc(u.className || '未加入班级')}<br>
        注册时间：${(u.createdAt || '').slice(0, 10)}
      </div>
    </div>
  </div>`;

  body.querySelector('#save-profile').addEventListener('click', async () => {
    try {
      await api('/auth/me', {
        method: 'PATCH',
        body: { nickname: body.querySelector('#f-nick').value.trim(), bio: body.querySelector('#f-bio').value.trim() },
      });
      await loadMe();
      toast('已保存', 'ok');
      rerender();
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  body.querySelector('#save-pwd').addEventListener('click', async () => {
    const oldPassword = body.querySelector('#f-old').value;
    const password = body.querySelector('#f-new').value;
    if (!oldPassword || !password) return toast('请填写完整', 'err');
    try {
      await api('/auth/me', { method: 'PATCH', body: { oldPassword, password } });
      toast('密码已更新', 'ok');
      body.querySelector('#f-old').value = '';
      body.querySelector('#f-new').value = '';
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  body.querySelector('#up-avatar').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) return toast('头像不超过 2MB', 'err');
      const dataUrl = await fileToDataUrl(f);
      try {
        await api('/auth/me', { method: 'PATCH', body: { avatar: dataUrl } });
        await loadMe();
        toast('头像已更新', 'ok');
        rerender();
      } catch (e) {
        toast(e.message, 'err');
      }
    };
    input.click();
  });
}
