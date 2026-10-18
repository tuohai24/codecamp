import { api, state } from '../api.js';
import { rerender } from '../app.js';
import { confirmDialog, esc, fileToDataUrl, modal, timeAgo, toast } from '../ui.js';
import { dashShell, fmtBytes, fmtUptime, navItem, panelTitle } from '../dash.js';
import { renderMarkdown } from '../md.js';

const BASE = '#/admin';
const TABS = [
  ['overview', '数据概览', '📊'],
  ['users', '用户管理', '👥'],
  ['classes', '班级管理', '🏫'],
  ['assignments', '作业总览', '📝'],
  ['assets', '素材库', '🎨'],
  ['settings', '站点设置', '⚙️'],
  ['system', '系统状态', '🩺'],
];

export async function render(root, { query }) {
  const tab = TABS.some(([k]) => k === query.tab) ? query.tab : 'overview';
  const sub = {
    overview: '平台运营、账号与素材库统一管理',
    users: '账号、角色、班级与状态',
    classes: '班级、班主任与班级码',
    assignments: '全站作业与提交情况',
    assets: '角色 / 背景 / 声音素材与官方镜像',
    settings: '站点名称、注册与运行策略',
    system: '进程、内存与磁盘占用',
  }[tab];
  const body = dashShell(root, {
    title: '管理员后台',
    sub: `<span class="muted">${esc(state.user.nickname)} · ${sub}</span>`,
    nav: TABS.map(([key, label, icon]) => navItem(key, label, icon, BASE)),
    active: tab,
  });

  if (tab === 'overview') await overview(body);
  else if (tab === 'users') await users(body);
  else if (tab === 'classes') await classes(body);
  else if (tab === 'assignments') await assignments(body);
  else if (tab === 'assets') await assets(body);
  else if (tab === 'settings') await settings(body);
  else await system(body);
}

/* ---------------- 概览 ---------------- */
async function overview(body) {
  const s = await api('/admin/stats');
  body.innerHTML = `
  <div class="stat-grid">
    ${[
      ['用户总数', s.users, `${s.students} 学生 · ${s.teachers} 教师`, 'accent'],
      ['作品总数', s.projects, `已发布 ${s.published}`],
      ['Scratch 作品', s.scratchProjects, '图形化编程'],
      ['Python 作品', s.pyProjects, '代码编程'],
      ['素材库', s.assets, `角色 ${s.costumes} · 背景 ${s.backdrops} · 声音 ${s.sounds || 0}`],
      ['作业 / 提交', s.assignments + ' / ' + s.submissions, `${s.classes} 个班级`],
    ]
      .map(
        ([l, v, f, cls]) =>
          `<div class="stat-card ${cls || ''}"><div class="label">${l}</div><div class="value">${v}</div><div class="foot">${f}</div></div>`
      )
      .join('')}
  </div>

  <div class="split-even" style="margin-top:18px">
    <div class="panel">
      ${panelTitle('最近注册')}
      <table class="table"><tbody>
        ${s.recentUsers
          .map(
            (u) =>
              `<tr><td>${esc(u.nickname)}<div class="tiny muted">@${esc(u.username)}</div></td>
               <td><span class="pill">${{ admin: '管理员', teacher: '教师', student: '学生' }[u.role]}</span></td>
               <td class="tiny muted">${(u.created_at || '').slice(0, 10)}</td></tr>`
          )
          .join('')}
      </tbody></table>
    </div>
    <div class="panel">
      ${panelTitle('浏览量最高的作品')}
      <table class="table"><tbody>
        ${s.topProjects
          .map(
            (p) =>
              `<tr><td><a href="#/p/${p.id}" style="color:var(--brand)">${esc(p.title)}</a></td>
               <td><span class="pill">${p.type === 'python' ? '🐍' : '🐱'}</span></td>
               <td class="tiny muted">👁 ${p.views}</td>
               <td class="tiny muted">${p.published ? '已发布' : '草稿'}</td></tr>`
          )
          .join('')}
      </tbody></table>
    </div>
  </div>`;
}

/* ---------------- 用户 ---------------- */
async function users(body) {
  const [list, classes] = await Promise.all([api('/admin/users'), api('/classes')]);
  const roleLabel = { admin: '管理员', teacher: '教师', student: '学生' };

  body.innerHTML = `<div class="panel">
    <div class="row wrap" style="margin-bottom:14px;gap:8px">
      <input id="u-q" placeholder="搜索昵称 / 用户名" style="max-width:240px" />
      <select id="u-role" style="max-width:140px"><option value="">全部角色</option><option value="student">学生</option><option value="teacher">教师</option><option value="admin">管理员</option></select>
      <div class="grow"></div>
      <button class="btn primary" id="u-new">＋ 新建用户</button>
    </div>
    <div id="u-table"></div>
  </div>`;

  const paint = (rows) => {
    body.querySelector('#u-table').innerHTML = rows.length
      ? `<table class="table">
      <thead><tr><th>用户</th><th>角色</th><th>班级</th><th>状态</th><th>注册</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (u) => `<tr>
        <td><b>${esc(u.nickname)}</b><div class="tiny muted">@${esc(u.username)}</div></td>
        <td><span class="pill ${u.role === 'admin' ? 'pink' : u.role === 'teacher' ? 'brand' : ''}">${roleLabel[u.role]}</span></td>
        <td class="tiny muted">${esc(u.class_name || '-')}</td>
        <td>${u.status ? '<span class="pill green">正常</span>' : '<span class="pill pink">已禁用</span>'}</td>
        <td class="tiny muted">${(u.created_at || '').slice(0, 10)}</td>
        <td><div class="actions">
          <button class="btn sm ghost" data-edit="${u.id}">编辑</button>
          <button class="btn sm ${u.status ? 'ghost' : 'primary'}" data-toggle="${u.id}" data-status="${u.status}">${u.status ? '禁用' : '启用'}</button>
          <button class="btn sm danger" data-del="${u.id}">删除</button>
        </div></td></tr>`
        )
        .join('')}</tbody></table>`
      : '<div class="empty"><div class="icon">🔍</div><h3>没有匹配的用户</h3></div>';

    body.querySelectorAll('[data-toggle]').forEach((b) =>
      b.addEventListener('click', async () => {
        await api('/admin/users/' + b.dataset.toggle, { method: 'PATCH', body: { status: b.dataset.status === '1' ? 0 : 1 } });
        refresh();
      })
    );
    body.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!(await confirmDialog('删除该用户？其作品与评论不会被自动清理。'))) return;
        try {
          await api('/admin/users/' + b.dataset.del, { method: 'DELETE' });
          toast('已删除', 'ok');
          refresh();
        } catch (e) {
          toast(e.message, 'err');
        }
      })
    );
    body.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const u = list.find((x) => x.id === Number(b.dataset.edit));
        const m = modal({
          title: '编辑用户：' + u.nickname,
          body: `<div class="field"><label>昵称</label><input id="e-nick" value="${esc(u.nickname)}" /></div>
            <div class="field"><label>角色</label><select id="e-role">${['student', 'teacher', 'admin'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${roleLabel[r]}</option>`).join('')}</select></div>
            <div class="field"><label>班级</label><select id="e-class"><option value="">未分班</option>${classes.map((c) => `<option value="${c.id}" ${u.class_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
            <div class="field"><label>重置密码（留空不改）</label><input id="e-pwd" placeholder="至少 6 位" /></div>`,
          onOk: async (mask) => {
            await api('/admin/users/' + u.id, {
              method: 'PATCH',
              body: {
                nickname: mask.querySelector('#e-nick').value.trim(),
                role: mask.querySelector('#e-role').value,
                classId: mask.querySelector('#e-class').value ? Number(mask.querySelector('#e-class').value) : 0,
                password: mask.querySelector('#e-pwd').value || undefined,
              },
            });
            toast('已保存', 'ok');
            refresh();
            return true;
          },
        });
        m.body.querySelector('input')?.focus();
      })
    );
  };

  const refresh = async () => {
    const q = body.querySelector('#u-q').value.trim();
    const role = body.querySelector('#u-role').value;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (role) params.set('role', role);
    paint(await api('/admin/users?' + params));
  };

  paint(list);
  body.querySelector('#u-q').addEventListener('keydown', (e) => e.key === 'Enter' && refresh());
  body.querySelector('#u-role').addEventListener('change', refresh);

  body.querySelector('#u-new').addEventListener('click', () => {
    modal({
      title: '新建用户',
      body: `<div class="field"><label>用户名</label><input id="n-user" placeholder="3-20 位字母数字下划线" /></div>
        <div class="field"><label>昵称</label><input id="n-nick" placeholder="展示名称" /></div>
        <div class="field"><label>初始密码</label><input id="n-pwd" value="123456" /></div>
        <div class="form-row">
          <div class="field"><label>角色</label><select id="n-role"><option value="student">学生</option><option value="teacher">教师</option><option value="admin">管理员</option></select></div>
          <div class="field"><label>班级</label><select id="n-class"><option value="">未分班</option>${classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
        </div>`,
      onOk: async (mask) => {
        await api('/admin/users', {
          method: 'POST',
          body: {
            username: mask.querySelector('#n-user').value.trim(),
            nickname: mask.querySelector('#n-nick').value.trim(),
            password: mask.querySelector('#n-pwd').value,
            role: mask.querySelector('#n-role').value,
            classId: mask.querySelector('#n-class').value ? Number(mask.querySelector('#n-class').value) : null,
          },
        });
        toast('用户已创建', 'ok');
        refresh();
        return true;
      },
    });
  });
}

/* ---------------- 班级 ---------------- */
async function classes(body) {
  const [list, teachers] = await Promise.all([api('/classes'), api('/admin/users?role=teacher')]);
  body.innerHTML = `<div class="split-2">
    <div class="panel">
      ${panelTitle('新建班级')}
      <div class="field"><label>班级名称</label><input id="c-name" maxlength="40" placeholder="例如：Scratch 入门 A 班" /></div>
      <div class="field"><label>班级码</label><input id="c-code" maxlength="12" placeholder="留空自动生成" /></div>
      <div class="field"><label>班主任</label><select id="c-teacher"><option value="">未指定</option>${teachers
        .map((t) => `<option value="${t.id}">${esc(t.nickname)}</option>`)
        .join('')}</select></div>
      <button class="btn primary block" id="c-create">创建</button>
    </div>
    <div class="panel">
      ${panelTitle('全部班级', `<span class="tiny muted">共 ${list.length} 个</span>`)}
      <table class="table"><thead><tr><th>班级</th><th>班级码</th><th>班主任</th><th>人数</th><th></th></tr></thead><tbody>
        ${list
          .map(
            (c) => `<tr><td><b>${esc(c.name)}</b><div class="tiny muted">创建于 ${(c.created_at || '').slice(0, 10)}</div></td>
          <td><span class="pill">${esc(c.code)}</span></td>
          <td class="tiny">${esc(c.teacher_name || '-')}</td>
          <td>${c.students || 0}</td>
          <td><div class="actions"><button class="btn sm ghost" data-students="${c.id}">名单</button><button class="btn sm danger" data-del="${c.id}">删除</button></div></td></tr>`
          )
          .join('') || '<tr><td colspan="5" class="muted">还没有班级</td></tr>'}
      </tbody></table>
    </div>
  </div>`;

  body.querySelector('#c-create').addEventListener('click', async () => {
    const name = body.querySelector('#c-name').value.trim();
    if (!name) return toast('请填写班级名称', 'err');
    try {
      await api('/classes', {
        method: 'POST',
        body: { name, code: body.querySelector('#c-code').value.trim(), teacherId: body.querySelector('#c-teacher').value || null },
      });
      toast('已创建', 'ok');
      rerender();
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  body.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmDialog('删除班级？学生将变为未分班状态。'))) return;
      await api('/classes/' + b.dataset.del, { method: 'DELETE' });
      rerender();
    })
  );

  body.querySelectorAll('[data-students]').forEach((b) =>
    b.addEventListener('click', async () => {
      const rows = await api(`/classes/${b.dataset.students}/students`);
      const m = modal({
        title: '班级学生名单',
        body: rows.length
          ? `<table class="table"><thead><tr><th>昵称</th><th>用户名</th><th>注册</th></tr></thead><tbody>${rows
              .map(
                (s) =>
                  `<tr><td>${esc(s.nickname)}</td><td class="muted">@${esc(s.username)}</td><td class="tiny muted">${(s.created_at || '').slice(0, 10)}</td></tr>`
              )
              .join('')}</tbody></table>`
          : '<div class="empty" style="padding:24px"><div>暂无学生</div></div>',
        cancelText: '关闭',
        okText: '',
        onOk: () => true,
      });
      m.mask.querySelector('[data-ok]').style.display = 'none';
    })
  );
}

/* ---------------- 作业总览 ---------------- */
async function assignments(body) {
  const list = await api('/assignments');
  body.innerHTML = `<div class="panel">
    ${panelTitle('全站作业', `<span class="tiny muted">共 ${list.length} 份</span>`)}
    <table class="table">
      <thead><tr><th>作业</th><th>班级</th><th>类型</th><th>截止</th><th>提交</th><th>要求</th><th></th></tr></thead>
      <tbody>${list
        .map(
          (a) => `<tr>
          <td><b>${esc(a.title)}</b><div class="tiny muted">创建于 ${timeAgo(a.created_at)}</div></td>
          <td class="tiny">${esc(a.class_name || '-')}</td>
          <td><span class="pill">${a.type === 'python' ? '🐍 Python' : '🐱 Scratch'}</span></td>
          <td class="tiny muted">${a.due_at ? String(a.due_at).slice(0, 10) : '未设置'}</td>
          <td class="tiny">${a.submitted || 0}/${a.total || 0}</td>
          <td><button class="btn sm ghost" data-view="${a.id}">查看</button></td>
          <td><button class="btn sm danger" data-del="${a.id}">删除</button></td>
        </tr>`
        )
        .join('') || '<tr><td colspan="7" class="muted">还没有作业</td></tr>'}</tbody>
    </table>
  </div>`;

  body.querySelectorAll('[data-view]').forEach((b) =>
    b.addEventListener('click', () => {
      const a = list.find((x) => x.id === Number(b.dataset.view));
      modal({
        title: a.title,
        width: 640,
        cancelText: '关闭',
        okText: '',
        onOk: () => true,
        body: `<div class="row wrap" style="gap:6px;margin-bottom:10px">
            <span class="pill">${esc(a.class_name || '')}</span>
            <span class="pill">${a.type === 'python' ? '🐍 Python' : '🐱 Scratch'}</span>
            <span class="pill">截止 ${a.due_at ? String(a.due_at).slice(0, 10) : '未设置'}</span>
          </div>
          <div class="md-body">${renderMarkdown(a.description || '_老师没有填写具体要求_')}</div>`,
      }).mask.querySelector('[data-ok]').style.display = 'none';
    })
  );

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
}

/* ---------------- 素材库 ---------------- */
const ASSET_KINDS = {
  sprite: { label: '角色', icon: '🐱', lib: '角色库', accept: 'image/png,image/jpeg,image/svg+xml', hint: 'PNG / JPG / SVG' },
  backdrop: { label: '背景', icon: '🖼', lib: '背景库', accept: 'image/png,image/jpeg,image/svg+xml', hint: 'PNG / JPG / SVG' },
  sound: { label: '声音', icon: '🔊', lib: '声音库', accept: 'audio/wav,audio/mpeg,audio/mp3,.wav,.mp3', hint: 'WAV / MP3' },
};

function fmtDuration(sec) {
  const s = Number(sec) || 0;
  if (s < 10) return s.toFixed(1) + 's';
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.round(s - m * 60)).padStart(2, '0');
}

// 用浏览器解码音频，拿到真实采样率与时长（官方声音库需要 sampleCount / rate）
async function audioMeta(file) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return {};
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    const out = { rate: audio.sampleRate, duration: audio.duration };
    ctx.close();
    return out;
  } catch {
    return {};
  }
}

async function assets(body) {
  let kind = 'sprite';
  body.innerHTML = `<div class="panel">
    <div class="row wrap asset-toolbar" style="margin-bottom:6px">
      <span class="tiny muted" style="font-weight:700">上传到</span>
      <div class="seg" id="asset-kinds">
        ${Object.entries(ASSET_KINDS)
          .map(([k, v]) => `<button data-kind="${k}" class="${k === kind ? 'active' : ''}">${v.icon} ${v.label}</button>`)
          .join('')}
      </div>
      <div class="grow"></div>
      <span class="tiny muted" id="asset-hint">上传后直接出现在 Scratch 的${ASSET_KINDS[kind].lib}里</span>
    </div>
    <div class="upload-zone" id="drop"></div>
    <div class="mirror-bar">
      <span class="tiny" style="font-weight:700">官方素材镜像</span>
      <span class="tiny muted" id="mirror-text">读取中…</span>
      <div class="grow"></div>
      <button class="btn sm ghost" id="mirror-sync">同步官方素材</button>
    </div>
    <div style="margin-top:16px" id="asset-list"></div>
  </div>`;

  const paintZone = () => {
    const meta = ASSET_KINDS[kind];
    body.querySelectorAll('#asset-kinds button').forEach((b) => {
      b.className = b.dataset.kind === kind ? 'active' : '';
    });
    body.querySelector('#drop').innerHTML = `点击或拖拽${meta.label}${kind === 'sound' ? '文件' : '图片'}到此处，上传到 <b>${meta.lib}</b>
      <div class="tiny muted" style="margin-top:6px">支持 ${meta.hint}，单文件 ≤ 8MB</div>`;
    body.querySelector('#asset-hint').textContent = `上传后直接出现在 Scratch 的${meta.lib}里`;
  };

  const thumbOf = (a) => {
    if (a.kind === 'sound') {
      return `<div class="thumb sound">
        <span class="snd-icon">🔊</span>
        <audio controls preload="none" src="${esc(a.url)}"></audio>
      </div>`;
    }
    return `<div class="thumb"><img src="${esc(a.url)}" alt="${esc(a.name)}" loading="lazy" /></div>`;
  };

  const metaOf = (a) => {
    const bits = [];
    if (a.kind === 'sound') {
      bits.push(String(a.format || '').toUpperCase());
      if (a.duration) bits.push(fmtDuration(a.duration));
    } else {
      bits.push(String(a.format || '').toUpperCase());
      if (a.width && a.height) bits.push(`${a.width}×${a.height}`);
    }
    if (a.bytes) bits.push(fmtBytes(a.bytes));
    return bits.filter(Boolean).join(' · ');
  };

  const loadList = async () => {
    const list = await api('/assets?kind=' + kind);
    body.querySelector('#asset-list').innerHTML = list.length
      ? `<div class="asset-grid">${list
          .map(
            (a) => `<div class="asset-card">
          ${thumbOf(a)}
          <div class="info">
            <div class="row" style="gap:6px"><b style="font-size:12.5px" class="grow">${esc(a.name)}</b><button class="icon-btn" data-del="${a.id}" title="删除素材">✕</button></div>
            <div class="tiny muted">${esc(metaOf(a))}</div>
          </div>
        </div>`
          )
          .join('')}</div>`
      : `<div class="empty"><div class="icon">${ASSET_KINDS[kind].icon}</div><h3>${ASSET_KINDS[kind].lib}暂为空</h3><div>上传后会自动出现在 Scratch 的${ASSET_KINDS[kind].lib}中</div></div>`;

    body.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!(await confirmDialog('删除该素材？已使用它的作品区不会受影响。'))) return;
        await api('/assets/' + b.dataset.del, { method: 'DELETE' });
        toast('已删除', 'ok');
        loadList();
      })
    );
  };

  const uploadFiles = async (files) => {
    const meta = ASSET_KINDS[kind];
    const accepted = files.filter((f) =>
      kind === 'sound' ? /^audio\//.test(f.type) || /\.(wav|mp3)$/i.test(f.name) : /^image\//.test(f.type)
    );
    if (!accepted.length) return toast(`请选择${meta.hint}格式的${meta.label}文件`, 'err');
    let ok = 0;
    for (const file of accepted) {
      if (file.size > 8 * 1024 * 1024) {
        toast(`${file.name} 超过 8MB，已跳过`, 'err');
        continue;
      }
      const dataUrl = await fileToDataUrl(file);
      const extra = kind === 'sound' ? await audioMeta(file) : {};
      try {
        await api('/assets', {
          method: 'POST',
          body: {
            kind,
            name: file.name.replace(/\.[^.]+$/, '').slice(0, 20) || meta.label,
            dataUrl,
            tags: '管理员上传',
            ...extra,
          },
        });
        ok++;
      } catch (e) {
        toast(`${file.name}：${e.message}`, 'err');
      }
    }
    if (ok) toast(`已上传 ${ok} 个${meta.label}到${meta.lib}`, 'ok');
    loadList();
  };

  const drop = body.querySelector('#drop');
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  const syncAccept = () => {
    input.accept = ASSET_KINDS[kind].accept;
  };
  syncAccept();
  input.onchange = () => uploadFiles([...input.files]);
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    uploadFiles([...e.dataTransfer.files]);
  });

  body.querySelectorAll('#asset-kinds button').forEach((b) =>
    b.addEventListener('click', () => {
      kind = b.dataset.kind;
      paintZone();
      syncAccept();
      loadList();
    })
  );

  const mirrorText = body.querySelector('#mirror-text');
  const mirrorBtn = body.querySelector('#mirror-sync');
  let mirrorTimer = null;

  const paintMirror = (s) => {
    const total = s.total || 0;
    if (s.running) {
      const pct = total ? Math.round((s.done / total) * 100) : 0;
      mirrorText.textContent = `同步中 ${s.done}/${total}（${pct}%）· 失败 ${s.failed} · 已占用 ${fmtBytes(s.bytes)}`;
      mirrorBtn.disabled = true;
      mirrorBtn.textContent = '同步中…';
      clearTimeout(mirrorTimer);
      mirrorTimer = setTimeout(loadMirror, 1500);
    } else {
      mirrorText.textContent = total
        ? `本地已缓存 ${s.files} 个 / ${fmtBytes(s.bytes)}，官方库共 ${total} 个文件`
        : `本地已缓存 ${s.files} 个 / ${fmtBytes(s.bytes)}`;
      mirrorBtn.disabled = false;
      mirrorBtn.textContent = '同步官方素材';
      clearTimeout(mirrorTimer);
    }
  };

  const loadMirror = async () => {
    try {
      paintMirror(await api('/scratch/mirror'));
    } catch {
      mirrorText.textContent = '状态读取失败';
    }
  };

  mirrorBtn.addEventListener('click', async () => {
    try {
      paintMirror(await api('/scratch/mirror/sync', { method: 'POST' }));
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  paintZone();
  await loadList();
  loadMirror();
}

/* ---------------- 站点设置 ---------------- */
async function settings(body) {
  const s = await api('/admin/settings');
  body.innerHTML = `<div class="panel" style="max-width:660px">
    ${panelTitle('站点设置')}
    <div class="field"><label>站点名称</label><input id="s-name" value="${esc(s.site_name || '')}" /></div>
    <div class="field"><label>首页标语</label><input id="s-slogan" value="${esc(s.site_slogan || '')}" /></div>
    <div class="field"><label>开放注册</label>
      <select id="s-register"><option value="1" ${s.allow_register !== '0' ? 'selected' : ''}>允许任何人注册</option><option value="0" ${s.allow_register === '0' ? 'selected' : ''}>关闭注册（仅管理员建号）</option></select>
    </div>
    <div class="field"><label>学生安装第三方库</label>
      <select id="s-pip"><option value="1" ${s.allow_pip !== '0' ? 'selected' : ''}>允许</option><option value="0" ${s.allow_pip === '0' ? 'selected' : ''}>禁止</option></select>
      <div class="help">Python 运行环境为服务端共享 venv，pip 安装真实生效</div>
    </div>
    <div class="field"><label>pip 镜像源</label><input id="s-index" value="${esc(s.pip_index || '')}" /></div>
    <button class="btn primary" id="s-save">保存设置</button>
    <div class="tiny muted" style="margin-top:18px;line-height:1.8">
      提示：修改后会立即对全站生效。站点名称会显示在浏览器标题和页头。
    </div>
  </div>`;

  body.querySelector('#s-save').addEventListener('click', async () => {
    try {
      await api('/admin/settings', {
        method: 'PATCH',
        body: {
          site_name: body.querySelector('#s-name').value.trim(),
          site_slogan: body.querySelector('#s-slogan').value.trim(),
          allow_register: body.querySelector('#s-register').value,
          allow_pip: body.querySelector('#s-pip').value,
          pip_index: body.querySelector('#s-index').value.trim(),
        },
      });
      toast('设置已保存', 'ok');
      const site = await api('/site');
      document.getElementById('site-name').textContent = site.name;
      if (state.site) state.site.name = site.name;
    } catch (e) {
      toast(e.message, 'err');
    }
  });
}

/* ---------------- 系统状态 ---------------- */
async function system(body) {
  const s = await api('/admin/system');
  const pct = (n, total) => Math.round((n / Math.max(1, total)) * 100);
  body.innerHTML = `<div class="stat-grid">
      ${[
        ['常驻内存 RSS', fmtBytes(s.memory.rss), '进程实际占用'],
        ['堆内存', fmtBytes(s.memory.heapUsed), `已分配 ${fmtBytes(s.memory.heapTotal)}（${pct(s.memory.heapUsed, s.memory.heapTotal)}%）`],
        ['数据库', fmtBytes(s.db.size), `WAL ${fmtBytes(s.db.wal)}`],
        ['素材文件', fmtBytes(s.db.uploads), `Scratch 工程 ${fmtBytes(s.db.sb3)}`],
        ['运行时长', fmtUptime(s.uptime), `Node ${s.node}`],
        ['运行平台', s.platform, '单进程 + SQLite'],
      ]
        .map(
          ([l, v, f]) => `<div class="stat-card"><div class="label">${l}</div><div class="value" style="font-size:19px">${v}</div><div class="foot">${f}</div></div>`
        )
        .join('')}
    </div>
    <div class="panel" style="margin-top:16px">
      ${panelTitle('这个版本做了哪些优化')}
      <div class="md-body">
        <ul>
          <li><b>数据库</b>：单文件 SQLite + WAL，18 条覆盖索引，SQL 语句编译结果复用（不再每次 prepare）。</li>
          <li><b>写入</b>：浏览量在内存累加、每 5 秒合并成一次事务，磁盘 fsync 次数下降两个数量级。</li>
          <li><b>读取</b>：站点统计缓存 20 秒、素材库 JSON 缓存到素材变更、鉴权用户缓存 10 秒。</li>
          <li><b>传输</b>：静态资源带 ETag（命中返回 304），JS/CSS 自动 gzip，首屏体积约为原来的 1/4。</li>
          <li><b>进程</b>：优雅退出（先落库再关库）、长连接复用，避免响应式状态下反复建连。</li>
        </ul>
        <p class="muted">当前进程 RSS ${fmtBytes(s.memory.rss)}，其中堆使用 ${fmtBytes(s.memory.heapUsed)}；SQLite 页缓存在进程外，不占 V8 堆。</p>
      </div>
    </div>`;
}
