import { api, loadMe, state } from '../api.js';
import { avatarHtml, confirmDialog, esc, fileToDataUrl, modal, timeAgo, toast, typeIcon, typeLabel } from '../ui.js';
import { openCreateDialog, rerender } from '../app.js';
import { openShareDialog } from '../share.js';

function tabsHtml(active) {
  return `<div class="tabs">
    <button data-tab="works" class="${active === 'works' ? 'active' : ''}">我的作品</button>
    <button data-tab="homework" class="${active === 'homework' ? 'active' : ''}">班级作业</button>
    <button data-tab="settings" class="${active === 'settings' ? 'active' : ''}">账号设置</button>
  </div>`;
}

export async function render(root, { query }) {
  await loadMe();
  const tab = query.tab || 'works';
  const u = state.user;

  root.innerHTML = `<div class="container page">
    <div class="page-title">
      <div>
        <h1>${esc(u.nickname)} 的学习空间</h1>
        <div class="sub">${{ student: '学生', teacher: '教师', admin: '管理员' }[u.role]} · ${esc(u.className || '暂未加入班级')} · ${u.bio ? esc(u.bio) : '还没有填写简介'}</div>
      </div>
      <div class="row"><button class="btn primary" id="new-work">＋ 新建作品</button></div>
    </div>
    ${tabsHtml(tab)}
    <div id="tab-body"></div>
  </div>`;

  root.querySelector('#new-work').addEventListener('click', () => openCreateDialog());
  root.querySelectorAll('.tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      location.hash = '#/me?tab=' + b.dataset.tab;
    })
  );

  const body = root.querySelector('#tab-body');
  if (tab === 'works') await renderWorks(body);
  else if (tab === 'homework') await renderHomework(body);
  else renderSettings(body);
}

async function renderWorks(body) {
  const works = await api('/projects?mine=1&limit=60');
  if (!works.items.length) {
    body.innerHTML = `<div class="empty"><div class="icon">🎨</div><h3>还没有作品</h3><div>点右上角「新建作品」开始第一个创作</div></div>`;
    return;
  }
  body.innerHTML = `<div class="grid cards">${works.items
    .map(
      (p) => `<article class="work-card">
        <div class="work-thumb" data-goto="${p.id}">
          ${p.thumb ? `<img src="${esc(p.thumb)}" alt="" />` : `<div class="ph">${typeIcon(p.type)}</div>`}
          <span class="type-badge">${typeIcon(p.type)} ${typeLabel(p.type)}</span>
          ${!p.published ? '<span class="type-badge" style="left:auto;right:10px;color:#b45309">草稿</span>' : ''}
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
        location.hash = '#/me?tab=works';
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

async function renderHomework(body) {
  const list = await api('/assignments');
  if (!Array.isArray(list) || !list.length) {
    body.innerHTML = `<div class="empty"><div class="icon">📚</div><h3>暂时没有作业</h3><div>等老师布置后就会出现在这里</div></div>`;
    return;
  }
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
      const desc = a.description || '';
      return `<div class="card" style="padding:16px 18px">
        <div class="row hw-row" style="gap:12px;align-items:flex-start">
          <div style="width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:#eef0ff;font-size:18px;flex:0 0 auto">${typeIcon(a.type)}</div>
          <div class="grow" style="min-width:0">
            <div class="row" style="gap:8px;flex-wrap:wrap"><b>${esc(a.title)}</b><span class="pill ${cls}">${status}</span>${overdue ? '<span class="pill pink">已截止</span>' : ''}</div>
            <div class="tiny muted" style="margin-top:4px">${typeLabel(a.type)} · 截止 ${due} · ${esc(a.teacher_name || '')}</div>
            ${
              desc
                ? `<div class="hw-desc${desc.length > 110 ? ' clamp' : ''}" data-desc>${esc(desc)}</div>
                   ${desc.length > 110 ? '<button class="link-btn" data-expand>展开要求</button>' : ''}`
                : '<div class="tiny muted" style="margin-top:8px">老师没有填写具体要求</div>'
            }
            ${
              hasWork
                ? `<div class="tiny" style="margin-top:8px;color:var(--brand)">↳ 我的作业作品：${esc(a.work_title)} · ${timeAgo(a.work_updated_at)}</div>`
                : ''
            }
          </div>
          <div class="col hw-actions" style="gap:6px;flex:0 0 104px">
            <button class="btn primary sm" data-start="${a.id}" data-title="${esc(a.title)}">▶ ${startLabel}</button>
            <button class="btn ghost sm" data-submit="${a.id}" data-type="${a.type}">${submitted || missing ? '重新提交' : '提交作品'}</button>
          </div>
        </div>
      </div>`;
    })
    .join('')}</div>`;

  body.querySelectorAll('[data-start]').forEach((btn) =>
    btn.addEventListener('click', () => startAssignment(Number(btn.dataset.start), btn))
  );
  body.querySelectorAll('[data-submit]').forEach((btn) =>
    btn.addEventListener('click', () => openSubmitDialog(Number(btn.dataset.submit), btn.dataset.type))
  );
  body.querySelectorAll('[data-expand]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const d = btn.previousElementSibling;
      const collapsed = d.classList.contains('clamp');
      d.classList.toggle('clamp', !collapsed);
      btn.textContent = collapsed ? '收起要求' : '展开要求';
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
      location.hash = '#/me?tab=homework';
      rerender();
      return true;
    },
  });
}

function renderSettings(body) {
  const u = state.user;
  body.innerHTML = `<div class="split-even">
    <div class="panel">
      <h3 style="font-size:15px;margin-bottom:14px">基本资料</h3>
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
      <h3 style="font-size:15px;margin-bottom:14px">修改密码</h3>
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
      await api('/auth/me', { method: 'PATCH', body: { nickname: body.querySelector('#f-nick').value.trim(), bio: body.querySelector('#f-bio').value.trim() } });
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
