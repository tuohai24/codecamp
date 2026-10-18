/**
 * 作业要求编辑器：Markdown 工具条 + 实时预览 + 图片上传（按钮 / 粘贴 / 拖拽）。
 * 返回值：{ el, getValue, setValue, focus }
 */
import { api } from './api.js';
import { renderMarkdown } from './md.js';
import { fileToDataUrl, toast } from './ui.js';

export function createMdEditor({ value = '', placeholder = '支持 Markdown：**加粗**、- 列表、## 标题、`代码`，也可以直接粘贴截图', minHeight = 190 } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'md-edit';
  wrap.innerHTML = `
    <div class="md-bar">
      <button type="button" data-cmd="h" title="小标题">H</button>
      <button type="button" data-cmd="b" title="加粗"><b>B</b></button>
      <button type="button" data-cmd="i" title="斜体"><i>I</i></button>
      <span class="sep"></span>
      <button type="button" data-cmd="ul" title="无序列表">• 列表</button>
      <button type="button" data-cmd="ol" title="有序列表">1. 列表</button>
      <button type="button" data-cmd="quote" title="引用">❝</button>
      <button type="button" data-cmd="code" title="行内代码">&lt;/&gt;</button>
      <button type="button" data-cmd="link" title="链接">🔗</button>
      <span class="sep"></span>
      <button type="button" data-cmd="img" title="插入图片">🖼 图片</button>
      <span class="grow"></span>
      <span class="md-switch">
        <button type="button" data-mode="edit" class="on">编辑</button>
        <button type="button" data-mode="preview">预览</button>
      </span>
    </div>
    <textarea placeholder="${placeholder}" style="min-height:${minHeight}px"></textarea>
    <div class="md-preview md-body" hidden></div>`;

  const ta = wrap.querySelector('textarea');
  const preview = wrap.querySelector('.md-preview');
  const switchBtns = wrap.querySelectorAll('.md-switch button');
  ta.value = value;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';

  /* ---------- 选区工具 ---------- */
  const replaceRange = (text, selStart, selEnd) => {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    if (selStart !== undefined) {
      ta.selectionStart = selStart;
      ta.selectionEnd = selEnd;
    }
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  };

  const surround = (before, after = before, fallback = '文字') => {
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || fallback;
    replaceRange(before + sel + after, s + before.length, s + before.length + sel.length);
  };

  const prefixLines = (prefix, numbered = false) => {
    const s = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let e = ta.value.indexOf('\n', ta.selectionEnd);
    if (e === -1) e = ta.value.length;
    const block = ta.value.slice(s, e) || '';
    const lines = block.split('\n').length ? block.split('\n') : [''];
    const out = lines.map((line, i) => (numbered ? `${i + 1}. ${line}` : `${prefix}${line}`)).join('\n');
    ta.setRangeText(out, s, e, 'end');
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  };

  const insertBlock = (text) => {
    const s = ta.selectionStart;
    const before = s > 0 && ta.value[s - 1] !== '\n' ? '\n' : '';
    replaceRange(`${before}${text}\n`, undefined, undefined);
  };

  /* ---------- 图片上传 ---------- */
  async function uploadImage(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast('图片不要超过 8MB', 'err');
    const note = document.createElement('span');
    note.className = 'md-uploading';
    note.textContent = '图片上传中…';
    wrap.querySelector('.md-bar').appendChild(note);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await api('/uploads/image', { method: 'POST', body: { dataUrl } });
      const name = (file.name || '图片').replace(/\.[^.]+$/, '');
      insertBlock(`![${name}](${res.url})`);
      toast('图片已插入', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      note.remove();
    }
  }

  fileInput.onchange = () => uploadImage(fileInput.files[0]);

  ta.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) {
        e.preventDefault();
        uploadImage(it.getAsFile());
        return;
      }
    }
  });
  ta.addEventListener('dragover', (e) => {
    if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault();
  });
  ta.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /^image\//.test(f.type)) {
      e.preventDefault();
      uploadImage(f);
    }
  });

  /* ---------- 工具条 ---------- */
  wrap.querySelector('.md-bar').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-cmd]');
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    if (cmd === 'h') prefixLines('## ');
    else if (cmd === 'b') surround('**');
    else if (cmd === 'i') surround('*');
    else if (cmd === 'ul') prefixLines('- ');
    else if (cmd === 'ol') prefixLines('', true);
    else if (cmd === 'quote') prefixLines('> ');
    else if (cmd === 'code') surround('`', '`', '代码');
    else if (cmd === 'link') surround('[', '](https://)', '链接文字');
    else if (cmd === 'img') fileInput.click();
  });

  switchBtns.forEach((b) =>
    b.addEventListener('click', () => {
      const mode = b.dataset.mode;
      switchBtns.forEach((x) => x.classList.toggle('on', x === b));
      if (mode === 'preview') {
        preview.innerHTML = renderMarkdown(ta.value) || '<div class="muted">还没有内容</div>';
        preview.hidden = false;
        ta.hidden = true;
      } else {
        preview.hidden = true;
        ta.hidden = false;
        ta.focus();
      }
    })
  );

  return {
    el: wrap,
    getValue: () => ta.value,
    setValue: (v) => {
      ta.value = v || '';
    },
    focus: () => ta.focus(),
  };
}
