/* 作品分享：创建分享链接、挑选分享页上的常用按键 */
import { api } from './api.js';
import { esc, modal, toast } from './ui.js';

export const SHARE_BUTTONS = [
  { key: 'run', icon: '▶', label: '立即运行', desc: '一键播放作品' },
  { key: 'like', icon: '❤', label: '点赞', desc: '给作者一个赞' },
  { key: 'comment', icon: '💬', label: '写留言', desc: '跳到评论区' },
  { key: 'remix', icon: '🎬', label: '一起改编', desc: '复制到自己账号' },
  { key: 'download', icon: '⬇', label: '下载作品', desc: '保存 sb3 / 源码' },
  { key: 'fullscreen', icon: '⛶', label: '全屏试玩', desc: '沉浸式播放' },
  { key: 'explore', icon: '🏠', label: '作品社区', desc: '看更多作品' },
  { key: 'author', icon: '👤', label: '作者主页', desc: 'TA 的其他作品' },
];

export const shareUrl = (token) => `${location.origin}/#/s/${token}`;

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function copyShareLink(token) {
  const url = shareUrl(token);
  if (await copyText(url)) {
    toast('分享链接已复制', 'ok');
    return true;
  }
  toast('复制失败，请手动复制：' + url, 'err');
  return false;
}

/** 系统分享（手机端优先调用，不支持时回退成复制链接） */
export async function nativeShare({ token, project }) {
  const url = shareUrl(token);
  if (navigator.share) {
    try {
      await navigator.share({ title: project?.title || '我的作品', text: project?.description || '来看看我的作品', url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  await copyShareLink(token);
}

/**
 * 分享设置弹窗：
 * - 没有链接时先创建；已有链接时可以直接改标题 / 留言 / 按钮，或停止分享
 */
export async function openShareDialog(projectId) {
  let data;
  try {
    data = await api(`/projects/${projectId}/share`);
  } catch (e) {
    return toast(e.message, 'err');
  }
  let share = data.share;
  let selected = share ? share.buttons.slice() : ['run', 'like', 'comment', 'remix', 'explore'];
  let title = share ? share.title : '';
  let note = share ? share.note : '';

  const pickerHtml = () =>
    SHARE_BUTTONS.map(
      (b) => `<button type="button" class="btn-chip ${selected.includes(b.key) ? 'on' : ''}" data-key="${b.key}">
        <span class="ico">${b.icon}</span>
        <span class="txt"><b>${b.label}</b><i>${b.desc}</i></span>
        <span class="tick">✓</span>
      </button>`
    ).join('');

  const m = modal({
    title: '分享作品',
    width: 560,
    cancelText: '关闭',
    okText: '',
    body: `
      <div class="share-dlg">
        <div class="share-hint" id="share-hint">${
          data.published
            ? '生成一条分享链接，发给同学或家长就能直接打开试玩。页面上的按键由你来挑。'
            : '作品还没有发布，发布后才能生成对外可见的分享链接。'
        }</div>
        <div id="share-empty" ${share ? 'hidden' : ''}>
          <button class="btn primary lg" id="share-create" style="width:100%" ${data.published ? '' : 'disabled'}>
            🔗 生成分享链接
          </button>
          ${data.published ? '' : '<div class="tiny muted" style="margin-top:10px;text-align:center">先在编辑器里点「发布」再回来分享</div>'}
        </div>
        <div id="share-main" ${share ? '' : 'hidden'}>
          <div class="field">
            <label>分享链接</label>
            <div class="copy-row">
              <input id="share-url" readonly value="${share ? esc(shareUrl(share.token)) : ''}" />
              <button class="btn primary sm" id="share-copy">复制</button>
            </div>
            <div class="help">链接长期有效，随时可以回到这里修改页面按钮。</div>
          </div>
          <div class="field">
            <label>页面标题（可选）</label>
            <input id="share-title" maxlength="60" placeholder="默认使用作品标题" value="${esc(title)}" />
          </div>
          <div class="field">
            <label>给同学的话（可选）</label>
            <textarea id="share-note" maxlength="300" style="min-height:64px" placeholder="例如：用方向键控制小猫，走出迷宫试试看！">${esc(note)}</textarea>
          </div>
          <div class="field">
            <label>分享页上的常用按键 <span class="tiny muted">最多选 6 个</span></label>
            <div class="btn-picker" id="share-picker">${pickerHtml()}</div>
          </div>
          <div class="share-actions">
            <button class="btn primary sm" id="share-save">保存设置</button>
            <a class="btn ghost sm" id="share-open" target="_blank" rel="noopener">打开分享页</a>
            <div class="grow"></div>
            <button class="btn danger sm" id="share-del">停止分享</button>
          </div>
        </div>
      </div>`,
    onOk: () => true,
  });
  m.mask.querySelector('[data-ok]').style.display = 'none';

  const $ = (s) => m.mask.querySelector(s);
  const renderPicker = () => {
    $('#share-picker').innerHTML = pickerHtml();
    $('#share-picker')
      .querySelectorAll('[data-key]')
      .forEach((b) =>
        b.addEventListener('click', () => {
          const k = b.dataset.key;
          if (selected.includes(k)) selected = selected.filter((x) => x !== k);
          else {
            if (selected.length >= 6) return toast('最多选 6 个按键', 'err');
            selected.push(k);
          }
          renderPicker();
        })
      );
  };

  const fillShare = (s) => {
    share = s;
    title = s.title;
    note = s.note;
    selected = s.buttons.slice();
    $('#share-empty').hidden = true;
    $('#share-main').hidden = false;
    $('#share-url').value = shareUrl(s.token);
    $('#share-title').value = s.title || '';
    $('#share-note').value = s.note || '';
    $('#share-open').href = shareUrl(s.token);
    renderPicker();
  };

  if (share) {
    $('#share-title').value = share.title || '';
    $('#share-note').value = share.note || '';
    $('#share-open').href = shareUrl(share.token);
    renderPicker();
  }

  const create = async () => {
    const btn = $('#share-create');
    btn.disabled = true;
    btn.textContent = '生成中…';
    try {
      const res = await api(`/projects/${projectId}/share`, {
        method: 'POST',
        body: { buttons: selected, note, title },
      });
      fillShare(res.share);
      toast('分享链接已生成', 'ok');
    } catch (e) {
      toast(e.message, 'err');
      btn.disabled = false;
      btn.textContent = '🔗 生成分享链接';
    }
  };
  if ($('#share-create')) $('#share-create').addEventListener('click', create);

  $('#share-copy').addEventListener('click', () => copyShareLink(share.token));
  $('#share-open').addEventListener('click', () => m.close());

  $('#share-save').addEventListener('click', async () => {
    if (!share) return;
    const btn = $('#share-save');
    btn.disabled = true;
    try {
      const res = await api(`/shares/${share.id}`, {
        method: 'PATCH',
        body: { title: $('#share-title').value.trim(), note: $('#share-note').value.trim(), buttons: selected },
      });
      share = res.share;
      toast('分享设置已保存', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });

  $('#share-del').addEventListener('click', async () => {
    if (!share) return;
    if (!confirm('停止分享后，这条链接会立刻失效，确定继续？')) return;
    try {
      await api(`/shares/${share.id}`, { method: 'DELETE' });
      share = null;
      selected = ['run', 'like', 'comment', 'remix', 'explore'];
      $('#share-main').hidden = true;
      $('#share-empty').hidden = false;
      toast('已停止分享', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  return m;
} 

/** 编辑器里发布后直接调用的快捷入口：有链接就直接复制，没有就创建 */
export async function quickShare(projectId, project) {
  try {
    const data = await api(`/projects/${projectId}/share`);
    if (!data.share) return openShareDialog(projectId);
    return nativeShare({ token: data.share.token, project });
  } catch (e) {
    toast(e.message, 'err');
  }
}
