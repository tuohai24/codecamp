/**
 * 主题：跟随系统 / 强制浅色 / 强制深色。
 *
 * 说明：
 *  - <head> 里有一段同步内联脚本先按系统偏好写好 data-theme，避免首屏闪白；
 *  - 这里负责切换、持久化、以及系统主题变化时的跟随；
 *  - 只用 data-theme="light|dark" 一个属性，CSS 里对应一套变量。
 */
const KEY = 'cc_theme';
const ORDER = ['auto', 'light', 'dark'];
const LABEL = { auto: '跟随系统', light: '浅色', dark: '深色' };
const ICON = { auto: '🖥', light: '☀️', dark: '🌙' };

const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getMode() {
  try {
    const v = localStorage.getItem(KEY);
    return ORDER.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function resolveMode(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return mq && mq.matches ? 'dark' : 'light';
}

export function applyMode(mode) {
  const resolved = resolveMode(mode);
  document.documentElement.setAttribute('data-theme', resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0b0b0d' : '#fafafa');
  syncButtons(mode);
  return resolved;
}

export function setMode(mode) {
  try {
    if (mode === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {}
  applyMode(mode);
}

export function cycleMode() {
  const next = ORDER[(ORDER.indexOf(getMode()) + 1) % ORDER.length];
  setMode(next);
  return next;
}

export function themeLabel() {
  return LABEL[getMode()];
}

function syncButtons(mode) {
  document.querySelectorAll('[data-theme-btn]').forEach((btn) => {
    const icon = btn.querySelector('.theme-ico');
    if (icon) icon.textContent = ICON[mode];
    btn.setAttribute('title', `外观：${LABEL[mode]}（点击切换）`);
    btn.setAttribute('aria-label', `外观：${LABEL[mode]}`);
  });
}

/** 在容器里放一个主题切换按钮（站点头部用） */
export function themeButton() {
  const btn = document.createElement('button');
  btn.className = 'icon-btn theme-btn';
  btn.type = 'button';
  btn.dataset.themeBtn = '1';
  btn.innerHTML = `<span class="theme-ico">${ICON[getMode()]}</span>`;
  btn.addEventListener('click', () => {
    const next = cycleMode();
    if (window.__ccToast) window.__ccToast(`外观：${LABEL[next]}`, 'ok');
  });
  return btn;
}

export function initTheme() {
  applyMode(getMode());
  if (mq) {
    const onChange = () => {
      if (getMode() === 'auto') applyMode('auto');
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
}
