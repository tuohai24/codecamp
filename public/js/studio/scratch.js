/* 创作页外壳：编辑能力全部由官方 scratch-gui 提供，这里只负责登录、保存、发布 */
import { api, state, loadMe } from '../api.js';
import { initTheme } from '../theme.js';
import { toast } from '../ui.js';
import { mountAssignmentBrief } from './assignment-brief.js';
import { openShareDialog } from '../share.js';

initTheme();

const $ = (s) => document.querySelector(s);

let project = null;
let frame = null;
let frameReady = false;
let dirty = false;
let saving = null;
let autoTimer = null;
let ignoreChangedUntil = 0;

const HOST_PAGE = '/vendor/scratch-gui/host.html';

function setState(text, tone = '') {
  const el = $('#save-state');
  if (!el) return;
  el.textContent = text;
  el.className = 'pill ' + tone;
  dirty = text !== '已保存' && text !== '已发布';
}

function post(msg) {
  if (!frame || !frame.contentWindow) return;
  frame.contentWindow.postMessage(msg, '*');
}

function requestSave() {
  return new Promise((resolve, reject) => {
    if (!frameReady) return reject(new Error('编辑器还没准备好'));
    saving = { resolve, reject };
    post({ cc: 'save' });
    setTimeout(() => {
      if (saving) {
        saving.reject(new Error('保存超时，请重试'));
        saving = null;
      }
    }, 25000);
  });
}

function onMessage(ev) {
  if (!frame || ev.source !== frame.contentWindow) return;
  const d = ev.data || {};
  if (!d.__cc) return;

  if (d.cc === 'ready') {
    frameReady = true;
    ignoreChangedUntil = Date.now() + 2000;
    $('#frame-mask').classList.add('hide');
    setState(project && project.published ? '已发布' : '已保存');
  } else if (d.cc === 'changed') {
    if (Date.now() < ignoreChangedUntil) return;
    if (!saving) setState('有未保存的修改', 'amber');
  } else if (d.cc === 'saved') {
    const p = saving;
    saving = null;
    if (p) p.resolve(d);
  } else if (d.cc === 'error') {
    const p = saving;
    saving = null;
    const err = new Error(d.message || '编辑器出错了');
    if (p) p.reject(err);
    else toast(err.message, 'err');
  }
}

async function save({ silent = false } = {}) {
  if (!project || !frameReady) return false;
  try {
    setState('保存中…');
    const res = await requestSave();
    const body = { title: $('#title').value.trim() || '未命名作品' };
    if (res.thumb) body.thumb = res.thumb;
    await api('/projects/' + project.id, { method: 'PATCH', body });
    setState(project.published ? '已发布' : '已保存');
    if (!silent) toast('已保存', 'ok');
    return true;
  } catch (e) {
    setState('保存失败', 'pink');
    toast('保存失败：' + e.message, 'err');
    return false;
  }
}

async function publish() {
  const ok = await save({ silent: true });
  if (!ok) return;
  try {
    await api('/projects/' + project.id, { method: 'PATCH', body: { published: 1 } });
    project.published = 1;
    setState('已发布');
    toast('已发布到作品社区', 'ok');
    // 发布完成后直接进入作品页并弹出分享设置，省掉「再找分享按钮」这一步
    setTimeout(() => (location.href = '/#/p/' + project.id + '?share=1'), 800);
  } catch (e) {
    toast(e.message, 'err');
  }
}

function scheduleAutoSave() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    if (dirty && !saving) save({ silent: true });
  }, 45000);
}

/* ---------- 页面初始化 ---------- */
async function init() {
  await loadMe();
  if (!state.user) {
    location.href = '/#/login';
    return;
  }

  const id = new URLSearchParams(location.search).get('id');
  try {
    if (id) {
      project = await api('/projects/' + String(Number(id)));
      if (!project.isOwner && state.user.role !== 'admin') {
        document.body.innerHTML = `<div class="empty" style="padding-top:120px"><div class="icon">🔒</div><h3>不能编辑别人的作品</h3><a class="btn ghost" href="/#/p/${Number(id)}">查看作品</a></div>`;
        return;
      }
    } else {
      project = await api('/projects', { method: 'POST', body: { type: 'scratch' } });
      history.replaceState(null, '', '/studio/scratch.html?id=' + project.id);
    }
  } catch (e) {
    document.body.innerHTML = `<div class="empty" style="padding-top:120px"><div class="icon">💥</div><h3>${e.message}</h3><a class="btn ghost" href="/">返回首页</a></div>`;
    return;
  }

  $('#title').value = project.title || '未命名作品';

  // 从作业入口进入时展示作业要求；普通入口不会渲染任何东西
  mountAssignmentBrief({ projectId: project.id, onSave: () => save({ silent: true }) }).catch(() => {});

  frame = $('#gui');
  window.addEventListener('message', onMessage);
  // 官方 GUI 支持 ?locale= 参数，用它把界面语言固定成简体中文
  frame.src = HOST_PAGE + '?id=' + project.id + '&locale=zh-cn&v=20261018b';

  // 官方 GUI 首次加载体积较大，超时后给出提示但保留界面
  setTimeout(() => {
    const mask = $('#frame-mask');
    if (mask && !frameReady) {
      mask.innerHTML = '<div>编辑器加载较慢，请稍候…</div>';
    }
  }, 15000);

  $('#btn-save').addEventListener('click', () => save());
  $('#btn-publish').addEventListener('click', publish);
  $('#btn-share').addEventListener('click', async () => {
    if (!project) return;
    // 分享页只对已发布作品开放：没发布就先保存并发布一次
    if (!project.published) {
      const ok = await save({ silent: true });
      if (!ok) return;
      try {
        await api('/projects/' + project.id, { method: 'PATCH', body: { published: 1 } });
        project.published = 1;
        setState('已发布');
        toast('作品已发布，可以分享啦', 'ok');
      } catch (e) {
        return toast(e.message, 'err');
      }
    }
    openShareDialog(project.id);
  });
  $('#title').addEventListener('input', () => {
    setState('有未保存的修改', 'amber');
    scheduleAutoSave();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

init().catch((e) => {
  console.error('创作页初始化失败', e);
  toast('页面初始化失败：' + e.message, 'err');
});
