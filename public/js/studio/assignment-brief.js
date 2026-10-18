/* 作业要求浮层：只有「从作业入口进入」的创作页才会展示
 *
 * 入口条件（两个都满足）：
 *   1. URL 带 ?assignment=<作业 id>（作业界面点「去完成」时自动带上）
 *   2. 服务端确认当前作品就是这名学生在这份作业下的草稿
 * 其他方式打开编辑器（新建作品、我的作品里继续编辑、手改 URL）都不会显示。
 */
import { api } from '../api.js';
import { toast } from '../ui.js';

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pad = (n) => String(n).padStart(2, '0');
function fmtDate(v) {
  if (!v) return '未设置';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '未设置';
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

function statusOf(sub) {
  if (!sub) return { text: '未提交', cls: 'amber' };
  if (sub.status === 'graded') return { text: sub.score == null ? '已批改' : `已批改 ${sub.score} 分`, cls: 'green' };
  if (sub.status === 'missing') return { text: '作品已删除', cls: 'pink' };
  return { text: '已提交', cls: 'green' };
}

/**
 * @param {{ projectId:number, variant?:'python'|'scratch', onSave?:()=>Promise<boolean> }} opts
 * @returns {Promise<object|null>} 作业信息（未通过校验时返回 null）
 */
export async function mountAssignmentBrief({ projectId, variant = 'scratch', onSave = null }) {
  const assignmentId = Number(new URLSearchParams(location.search).get('assignment') || 0);
  if (!assignmentId || !projectId) return null; // 普通入口：完全不请求、不渲染

  let brief;
  try {
    brief = await api(`/assignments/${assignmentId}/brief?project=${Number(projectId)}`);
  } catch {
    return null; // 不是从作业入口来的，或作品对不上，静默不展示
  }
  if (!brief) return null;

  const sub = statusOf(brief.submission);
  const wrap = document.createElement('div');
  wrap.className = 'hw-brief' + (variant === 'python' ? ' hw-brief--py' : '');
  wrap.id = 'hw-brief';
  wrap.innerHTML = `
    <div class="hw-brief-head">
      <span class="hw-brief-tag">📚 作业</span>
      <b class="hw-brief-title">${esc(brief.title)}</b>
      <button class="icon-btn" id="hw-brief-close" title="收起作业要求">✕</button>
    </div>
    <div class="hw-brief-meta">
      <span class="pill ${brief.type === 'python' ? 'brand' : ''}">${brief.type === 'python' ? '🐍 Python' : '🐱 Scratch'}</span>
      <span>截止 ${esc(fmtDate(brief.dueAt))}</span>
      <span>·</span>
      <span>${esc(brief.teacherName || '老师')}</span>
    </div>
    <div class="hw-brief-body">
      <div class="hw-brief-sub">作业要求</div>
      ${brief.description ? `<div class="hw-brief-desc">${esc(brief.description)}</div>` : '<div class="hw-brief-desc muted">老师没有填写具体要求。</div>'}
      ${
        brief.submission && brief.submission.feedback
          ? `<div class="hw-brief-sub" style="margin-top:14px">老师评语</div><div class="hw-brief-desc">${esc(brief.submission.feedback)}</div>`
          : ''
      }
    </div>
    <div class="hw-brief-foot">
      <span class="pill ${sub.cls}" id="hw-brief-status">${esc(sub.text)}</span>
      <span class="grow"></span>
      <a class="btn ghost sm" href="/#/me?tab=homework">全部作业</a>
      <button class="btn primary sm" id="hw-brief-submit">${sub.text === '未提交' ? '提交作业' : '重新提交'}</button>
    </div>`;
  document.body.appendChild(wrap);

  const fab = document.createElement('button');
  fab.className = 'hw-brief-fab' + (variant === 'python' ? ' hw-brief-fab--py' : '');
  fab.id = 'hw-brief-fab';
  fab.innerHTML = '📚 作业要求';
  fab.hidden = true;
  document.body.appendChild(fab);

  const storeKey = `cc_brief_hidden_${assignmentId}_${projectId}`;
  const open = () => {
    wrap.classList.remove('hide');
    fab.hidden = true;
    try {
      localStorage.removeItem(storeKey);
    } catch {}
  };
  const close = () => {
    wrap.classList.add('hide');
    fab.hidden = false;
    try {
      localStorage.setItem(storeKey, '1');
    } catch {}
  };

  // 同一份作业里收起过，就不要再自动弹出来打扰（稿子还会自动保存）
  try {
    if (localStorage.getItem(storeKey) === '1') {
      wrap.classList.add('hide');
      fab.hidden = false;
    }
  } catch {}

  wrap.querySelector('#hw-brief-close').addEventListener('click', close);
  fab.addEventListener('click', open);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !wrap.classList.contains('hide')) close();
  });

  // 就地提交：先保存当前作品，再登记到这份作业
  const submitBtn = wrap.querySelector('#hw-brief-submit');
  const statusEl = wrap.querySelector('#hw-brief-status');
  submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    const label = submitBtn.textContent;
    submitBtn.textContent = '提交中…';
    try {
      if (onSave) {
        const ok = await onSave();
        if (ok === false) throw new Error('保存失败，请稍后再提交');
      }
      await api(`/assignments/${assignmentId}/submit`, { method: 'POST', body: { projectId: Number(projectId) } });
      statusEl.className = 'pill green';
      statusEl.textContent = '已提交';
      submitBtn.textContent = '重新提交';
      toast('作业已提交，老师可以批改了', 'ok');
    } catch (e) {
      submitBtn.textContent = label;
      toast(e.message, 'err');
    } finally {
      submitBtn.disabled = false;
    }
  });

  // 拖动标题栏可把浮层挪开，避免挡住舞台 / 代码
  const head = wrap.querySelector('.hw-brief-head');
  let drag = null;
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = wrap.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    wrap.style.left = r.left + 'px';
    wrap.style.top = r.top + 'px';
    wrap.style.right = 'auto';
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const w = wrap.offsetWidth;
    const h = wrap.offsetHeight;
    wrap.style.left = clamp(e.clientX - drag.dx, 4, Math.max(4, innerWidth - w - 4)) + 'px';
    wrap.style.top = clamp(e.clientY - drag.dy, 56, Math.max(56, innerHeight - h - 4)) + 'px';
  });
  const endDrag = () => (drag = null);
  head.addEventListener('pointerup', endDrag);
  head.addEventListener('pointercancel', endDrag);

  document.title = `${brief.title} · ${brief.type === 'python' ? 'Python' : 'Scratch'} 创作`;
  return brief;
}
