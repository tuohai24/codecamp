import { api, state } from '../api.js';
import { rerender } from '../app.js';
import { confirmDialog, esc, fmtDate, modal, timeAgo, toast, typeIcon, typeLabel } from '../ui.js';

const TABS = [
  ['assign', '布置作业'],
  ['grade', '作业批改'],
  ['class', '班级管理'],
];

export async function render(root, { query }) {
  const tab = query.tab || 'assign';
  const [classes, assignments] = await Promise.all([api('/classes'), api('/assignments')]);

  root.innerHTML = `<div class="container page">
    <div class="page-title">
      <div><h1>教学中心</h1><div class="sub">${esc(state.user.nickname)} · 共 ${classes.length} 个班级 · ${assignments.length} 份作业</div></div>
    </div>
    <div class="tabs">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div id="tab-body"></div>
  </div>`;

  root.querySelectorAll('.tabs button').forEach((b) =>
    b.addEventListener('click', () => (location.hash = '#/teacher?tab=' + b.dataset.tab))
  );

  const body = root.querySelector('#tab-body');
  if (tab === 'assign') renderAssign(body, classes, assignments);
  else if (tab === 'grade') renderGrade(body, assignments);
  else renderClass(body, classes);
}

/* ---------- 布置作业 ---------- */
function renderAssign(body, classes, assignments) {
  body.innerHTML = `<div class="split-2">
    <div class="panel">
      <h3 style="font-size:15px;margin-bottom:14px">新建作业</h3>
      <div class="field"><label>标题</label><input id="a-title" placeholder="例如：第 3 课 · 让角色动起来" maxlength="60" /></div>
      <div class="field"><label>类型</label>
        <select id="a-type"><option value="scratch">🐱 Scratch 作品</option><option value="python">🐍 Python 作品</option></select>
      </div>
      <div class="field"><label>布置到班级</label>
        <select id="a-class">${classes.length ? classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('') : '<option value="">请先创建班级</option>'}</select>
      </div>
      <div class="field"><label>截止日期</label><input id="a-due" type="date" /></div>
      <div class="field"><label>作业要求</label><textarea id="a-desc" placeholder="分条写清要求，学生点「去完成」后会在编辑器里看到" style="min-height:120px"></textarea></div>
      <div class="field" id="a-starter-wrap" style="display:none"><label>起始代码（可选）</label>
        <textarea id="a-starter" placeholder="学生点「去完成」时，编辑器里会预填这段代码" style="min-height:96px;font-family:ui-monospace,Consolas,monospace;font-size:12.5px"></textarea>
      </div>
      <button class="btn primary" id="a-create" style="width:100%">布置作业</button>
      <div class="tiny muted" style="margin-top:10px">提示：学生会从「班级作业 → 去完成」直接进入对应编辑器；在编辑器里发布作品后就能提交。</div>
    </div>
    <div>
      <div class="row" style="justify-content:space-between;margin-bottom:10px">
        <h3 style="font-size:15px">已布置的作业</h3>
        <span class="tiny muted">共 ${assignments.length} 份</span>
      </div>
      ${
        assignments.length
          ? assignments
              .map(
                (a) => `<div class="card" style="padding:14px 16px;margin-bottom:10px">
          <div class="row" style="align-items:flex-start;gap:10px">
            <div style="width:34px;height:34px;border-radius:9px;background:#eef0ff;display:grid;place-items:center">${typeIcon(a.type)}</div>
            <div class="grow">
              <div class="row" style="gap:8px"><b>${esc(a.title)}</b><span class="pill">${esc(a.class_name || '')}</span><span class="pill ${a.submitted === a.total ? 'green' : ''}">${a.submitted}/${a.total || 0} 已交</span><span class="pill ${a.graded ? 'green' : 'amber'}">${a.graded || 0} 已批</span></div>
              <div class="tiny muted" style="margin-top:4px">${typeLabel(a.type)} · 截止 ${a.due_at ? fmtDate(a.due_at) : '未设置'} · 创建于 ${timeAgo(a.created_at)}</div>
            </div>
            <button class="btn sm ghost" data-grade="${a.id}">批改</button>
            <button class="btn sm danger" data-del="${a.id}">删除</button>
          </div>
        </div>`
              )
              .join('')
          : `<div class="empty"><div class="icon">📝</div><h3>还没有布置作业</h3><div>在左侧填写表单即可发布</div></div>`
      }
    </div>
  </div>`;

  const typeSel = body.querySelector('#a-type');
  const starterWrap = body.querySelector('#a-starter-wrap');
  const syncStarter = () => (starterWrap.style.display = typeSel.value === 'python' ? '' : 'none');
  typeSel.addEventListener('change', syncStarter);
  syncStarter();

  body.querySelector('#a-create').addEventListener('click', async () => {
    const type = body.querySelector('#a-type').value;
    const body_ = {
      title: body.querySelector('#a-title').value.trim(),
      type,
      classId: Number(body.querySelector('#a-class').value),
      dueAt: body.querySelector('#a-due').value,
      description: body.querySelector('#a-desc').value.trim(),
      starter: type === 'python' ? body.querySelector('#a-starter').value : '',
    };
    if (!body_.title) return toast('请填写标题', 'err');
    if (!body_.classId) return toast('请先创建班级', 'err');
    try {
      await api('/assignments', { method: 'POST', body: body_ });
      toast('作业已布置', 'ok');
      rerender();
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  body.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmDialog('删除这份作业？学生的提交记录也会一并删除。'))) return;
      try {
        await api('/assignments/' + b.dataset.del, { method: 'DELETE' });
        toast('已删除', 'ok');
        rerender();
      } catch (e) {
        toast(e.message, 'err');
      }
    })
  );
  body.querySelectorAll('[data-grade]').forEach((b) => b.addEventListener('click', () => openGrade(Number(b.dataset.grade))));
}

/* ---------- 批改 ---------- */
function renderGrade(body, assignments) {
  body.innerHTML = `<div class="panel">
    <h3 style="font-size:15px;margin-bottom:12px">选择作业进行批改</h3>
    ${
      assignments.length
        ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">${assignments
            .map(
              (a) => `<button class="card" data-grade="${a.id}" style="padding:14px;text-align:left;cursor:pointer;border:1px solid var(--border)">
          <div class="row" style="gap:8px"><span>${typeIcon(a.type)}</span><b style="font-size:13.5px">${esc(a.title)}</b></div>
          <div class="tiny muted" style="margin-top:6px">${esc(a.class_name || '')} · ${a.submitted}/${a.total || 0} 已提交 · ${a.graded || 0} 已批改</div>
        </button>`
            )
            .join('')}</div>`
        : `<div class="empty"><div class="icon">📭</div><h3>还没有作业</h3><div>先到「布置作业」创建一份</div></div>`
    }
  </div>`;
  body.querySelectorAll('[data-grade]').forEach((b) => b.addEventListener('click', () => openGrade(Number(b.dataset.grade))));
}

async function openGrade(id) {
  const a = await api('/assignments/' + id);
  const subs = a.submissions || [];
  const map = new Map(subs.map((s) => [s.student_id, s]));
  const students = a.students || [];

  const m = modal({
    title: '批改：' + a.title,
    width: 760,
    cancelText: '关闭',
    okText: '',
    body: `<div class="tiny muted" style="margin-bottom:12px">${esc(a.class_name || '')} · ${typeLabel(a.type)} · 共 ${students.length} 名学生</div>
      <div style="max-height:52vh;overflow:auto">
      <table class="table">
        <thead><tr><th>学生</th><th>作品</th><th style="width:90px">分数</th><th style="width:180px">评语</th><th></th></tr></thead>
        <tbody>
        ${students
          .map((s) => {
            const sub = map.get(s.id);
            return `<tr data-sid="${s.id}" data-sub="${sub ? sub.id : ''}">
              <td>${esc(s.nickname)}<div class="tiny muted">@${esc(s.username)}</div></td>
              <td>${
                sub
                  ? `<a href="#/p/${sub.project_id}" target="_blank" style="color:var(--brand)">${esc(sub.project_title || '作品 #' + sub.project_id)}</a><div class="tiny muted">${timeAgo(sub.updated_at)}</div>`
                  : '<span class="pill">未提交</span>'
              }</td>
              <td><input class="score" type="number" min="0" max="100" value="${sub && sub.score != null ? sub.score : ''}" style="height:32px" ${sub ? '' : 'disabled'} /></td>
              <td><input class="fb" value="${esc(sub ? sub.feedback || '' : '')}" style="height:32px" ${sub ? '' : 'disabled'} placeholder="写点评语" /></td>
              <td><button class="btn sm primary save-row" ${sub ? '' : 'disabled'}>保存</button></td>
            </tr>`;
          })
          .join('')}
        </tbody>
      </table></div>`,
    onOk: () => true,
  });
  m.mask.querySelector('[data-ok]').style.display = 'none';

  m.mask.querySelectorAll('.save-row').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const tr = btn.closest('tr');
      const subId = tr.dataset.sub;
      if (!subId) return;
      btn.disabled = true;
      try {
        await api('/submissions/' + subId, {
          method: 'PATCH',
          body: { score: tr.querySelector('.score').value, feedback: tr.querySelector('.fb').value },
        });
        btn.textContent = '已保存';
        toast('评分已保存', 'ok');
        setTimeout(() => (btn.textContent = '保存'), 1200);
      } catch (e) {
        toast(e.message, 'err');
      } finally {
        btn.disabled = false;
      }
    })
  );
}

/* ---------- 班级 ---------- */
function renderClass(body, classes) {
  body.innerHTML = `<div class="split-2">
    <div class="panel">
      <h3 style="font-size:15px;margin-bottom:14px">新建班级</h3>
      <div class="field"><label>班级名称</label><input id="c-name" placeholder="例如：2026 春季 Scratch 提高班" maxlength="40" /></div>
      <div class="field"><label>班级码（学生加入用）</label><input id="c-code" placeholder="留空自动生成" maxlength="12" /></div>
      <button class="btn primary" id="c-create" style="width:100%">创建班级</button>
    </div>
    <div>
      <h3 style="font-size:15px;margin-bottom:10px">我的班级</h3>
      ${classes
        .map(
          (c) => `<div class="card" style="padding:14px 16px;margin-bottom:10px">
        <div class="row">
          <div class="grow"><b>${esc(c.name)}</b><div class="tiny muted">班级码 ${esc(c.code)} · ${c.students || 0} 名学生</div></div>
          <button class="btn sm ghost" data-students="${c.id}" data-name="${esc(c.name)}">学生名单</button>
          <button class="btn sm danger" data-delc="${c.id}">删除</button>
        </div>
      </div>`
        )
        .join('') || '<div class="empty"><div class="icon">🏫</div><h3>还没有班级</h3></div>'}
    </div>
  </div>`;

  body.querySelector('#c-create').addEventListener('click', async () => {
    const name = body.querySelector('#c-name').value.trim();
    if (!name) return toast('请填写班级名称', 'err');
    try {
      await api('/classes', { method: 'POST', body: { name, code: body.querySelector('#c-code').value.trim() } });
      toast('班级已创建', 'ok');
      rerender();
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  body.querySelectorAll('[data-delc]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmDialog('删除班级？该班级的作业会一起删除，学生将变为未分班状态。'))) return;
      try {
        await api('/classes/' + b.dataset.delc, { method: 'DELETE' });
        rerender();
      } catch (e) {
        toast(e.message, 'err');
      }
    })
  );

  body.querySelectorAll('[data-students]').forEach((b) =>
    b.addEventListener('click', async () => {
      const list = await api(`/classes/${b.dataset.students}/students`);
      modal({
        title: b.dataset.name + ' · 学生名单',
        body: list.length
          ? `<table class="table"><thead><tr><th>昵称</th><th>用户名</th><th>注册时间</th></tr></thead><tbody>${list
              .map((s) => `<tr><td>${esc(s.nickname)}</td><td class="muted">@${esc(s.username)}</td><td class="muted">${(s.created_at || '').slice(0, 10)}</td></tr>`)
              .join('')}</tbody></table>`
          : '<div class="empty" style="padding:24px"><div>还没有学生，可在管理后台把学生分配到班级</div></div>',
        cancelText: '关闭',
        okText: '',
        onOk: () => true,
      }).mask.querySelector('[data-ok]').style.display = 'none';
    })
  );
}
