/**
 * 轻量 Markdown 渲染器（零依赖，约 6KB）。
 *
 * 面向「老师写作业要求」这个场景：标题、列表、粗斜体、行内代码、
 * 代码块、引用、表格、分割线、链接、图片。
 *
 * 安全策略：先整体 HTML 转义，再解析 Markdown 语法，
 * 因此任何原始 HTML 都只会被当成文字显示；链接只允许
 * http(s) / 站内绝对路径 / 锚点 / mailto，杜绝 javascript: 注入。
 */

// 允许：http(s)、站内绝对路径（单个 /，排除 //protocol-relative 外链）、锚点、mailto
const URL_OK = /^(https?:\/\/|\/(?!\/)|#|mailto:)/i;

function safeUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return '';
  return URL_OK.test(u) ? u : '';
}

/** 行内解析（输入必须已经过 HTML 转义） */
function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`\n]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });

  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (m, alt, url) => {
    const href = safeUrl(url);
    if (!href) return m;
    return `<img src="${href}" alt="${alt}" loading="lazy" />`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const href = safeUrl(url);
    if (!href) return m;
    const ext = /^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${href}"${ext}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const LIST_RE = /^\s*([-*+]|\d+[.)])\s+/;
const isTableSep = (line) => /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-');
/** 拆单元格：`|` 在行内代码里不当分隔符，避免 `a|b` 把表格拆断 */
function splitRow(line) {
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cur = '';
  let inCode = false;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === '`') {
      inCode = !inCode;
      cur += ch;
    } else if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

/**
 * @param {string} src Markdown 原文
 * @returns {string} 安全的 HTML
 */
export function renderMarkdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    const fence = /^\s*```([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++; // 跳过结束 ```
      const lang = fence[1] ? ` class="lang-${esc(fence[1])}"` : '';
      out.push(`<pre class="md-code"><code${lang}>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    // 分割线
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      out.push('<hr />');
      i++;
      continue;
    }

    // 标题
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = Math.min(h[1].length + 1, 6); // # 用 h2，避免和页面 h1 打架
      out.push(`<h${level}>${inline(esc(h[2].trim()))}</h${level}>`);
      i++;
      continue;
    }

    // 引用
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }

    // 表格
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
      out.push(
        `<div class="md-table-wrap"><table class="md-table"><thead><tr>${head
          .map((c) => `<th>${inline(esc(c))}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(esc(c))}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      );
      continue;
    }

    // 列表（含一级缩进嵌套）
    if (LIST_RE.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && LIST_RE.test(lines[i])) {
        const content = lines[i].replace(LIST_RE, '');
        const indented = /^\s{2,}/.test(lines[i]);
        items.push({ content, indented });
        i++;
      }
      out.push(renderList(items, ordered));
      continue;
    }

    // 段落：直到空行或另一个块级元素
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|>|```|([-*_])\s*\2\s*\2)/.test(lines[i]) && !LIST_RE.test(lines[i])) {
      buf.push(lines[i++]);
    }
    out.push(`<p>${inline(esc(buf.join('\n')).replace(/\n/g, '<br />'))}</p>`);
  }

  return out.join('\n');
}

function renderList(items, ordered) {
  const tag = ordered ? 'ol' : 'ul';
  let html = `<${tag}>`;
  let nested = false;
  for (const it of items) {
    if (it.indented) {
      if (!nested) {
        html += `<${tag} class="md-sub">`;
        nested = true;
      }
      html += `<li>${inline(esc(it.content))}</li>`;
    } else {
      if (nested) {
        html += `</${tag}>`;
        nested = false;
      }
      html += `<li>${inline(esc(it.content))}</li>`;
    }
  }
  if (nested) html += `</${tag}>`;
  return html + `</${tag}>`;
}

/** 去掉 Markdown 标记，用于列表里的纯文本摘要 */
export function mdToText(src, max = 120) {
  const text = String(src || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~`|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}
