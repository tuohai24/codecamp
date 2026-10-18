export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function timeAgo(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const d = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (d < 60) return '刚刚';
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

export const fmtDate = (iso) => (iso ? String(iso).slice(0, 10) : '');
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('zh-CN', { hour12: false }).slice(0, 16) : '');

export function toast(msg, type = '') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span>${type === 'err' ? '⚠️' : type === 'ok' ? '✅' : '💡'}</span><span>${esc(msg)}</span>`;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = '0.25s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(16px)';
    setTimeout(() => el.remove(), 260);
  }, 2600);
}

export function avatarHtml(user, size = '') {
  if (!user) return `<span class="avatar ${size}">?</span>`;
  const name = user.nickname || user.username || '?';
  if (user.avatar) return `<img class="avatar ${size}" src="${esc(user.avatar)}" alt="${esc(name)}" />`;
  return `<span class="avatar ${size}">${esc(name.slice(0, 1))}</span>`;
}

export const typeLabel = (t) => (t === 'python' ? 'Python' : 'Scratch');
export const typeIcon = (t) => (t === 'python' ? '🐍' : '🐱');
export function typeBadge(t) {
  return `<span class="type-badge ${t === 'python' ? 'py' : 'sc'}">${typeIcon(t)} ${typeLabel(t)}</span>`;
}

export function modal({ title, body, okText = '确定', cancelText = '取消', onOk, width, danger = false }) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal" ${width ? `style="max-width:${width}px"` : ''}>
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close>✕</button></div>
      <div class="modal-body"></div>
      <div class="modal-foot">
        ${cancelText ? `<button class="btn ghost" data-close>${esc(cancelText)}</button>` : ''}
        <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okText)}</button>
      </div>
    </div>`;
  const bodyEl = mask.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);
  document.body.appendChild(mask);
  const close = () => mask.remove();
  mask.addEventListener('click', (e) => {
    if (e.target === mask || e.target.hasAttribute('data-close')) close();
  });
  mask.querySelector('[data-ok]').addEventListener('click', async (e) => {
    if (!onOk) return close();
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const r = await onOk(mask);
      if (r !== false) close();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });
  const input = mask.querySelector('input, textarea');
  if (input) setTimeout(() => input.focus(), 50);
  return { mask, close, body: bodyEl };
}

export function confirmDialog(text, { okText = '确定删除', danger = true } = {}) {
  return new Promise((resolve) => {
    const m = modal({
      title: '请确认',
      body: `<p class="muted" style="margin:0">${esc(text)}</p>`,
      okText,
      danger,
      onOk: () => {
        resolve(true);
        return true;
      },
      cancelText: '取消',
    });
    m.mask.addEventListener('click', (e) => {
      if (e.target === m.mask || e.target.hasAttribute('data-close')) resolve(false);
    });
  });
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

export function workCard(p) {
  const thumb = p.thumb
    ? `<img src="${esc(p.thumb)}" alt="${esc(p.title)}" loading="lazy" />`
    : `<div class="ph">${typeIcon(p.type)}</div>`;
  return `
  <article class="work-card" data-id="${p.id}">
    <div class="work-thumb">${thumb}${typeBadge(p.type)}</div>
    <div class="work-body">
      <h3>${esc(p.title)}</h3>
      <div class="desc">${esc(p.description || '这个作品还没有简介')}</div>
      <div class="work-meta">
        <span>${avatarHtml({ nickname: p.nickname, avatar: p.avatar }, 'sm')}</span>
        <span>${esc(p.nickname || '匿名')}</span>
        <span class="dot">·</span>
        <span>❤ ${p.likes ?? 0}</span>
        <span class="grow"></span>
        <span>👁 ${p.views ?? 0}</span>
      </div>
    </div>
  </article>`;
}

export function bindCards(root) {
  root.querySelectorAll('.work-card[data-id]').forEach((el) => {
    el.addEventListener('click', () => {
      location.hash = '#/p/' + el.dataset.id;
    });
  });
}

export function loading(root, text = '加载中...') {
  root.innerHTML = `<div class="empty"><div class="icon">⏳</div><div>${esc(text)}</div></div>`;
}

export function empty(title, desc = '', action = '') {
  return `<div class="empty"><div class="icon">🫧</div><h3>${esc(title)}</h3><div>${esc(desc)}</div>${action}</div>`;
}
