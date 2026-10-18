/* 分享页：#/s/<token> —— 对外展示单个作品，页面按钮由作者在分享设置里挑选 */
import { api, state } from '../api.js';
import { avatarHtml, esc, timeAgo, toast, typeIcon, typeLabel } from '../ui.js';
import { mountPlayer } from '../scratch/player.js';
import { nativeShare, openShareDialog } from '../share.js';

const BTN_META = {
  run: { icon: '▶', label: '立即运行' },
  like: { icon: '❤', label: '点赞' },
  comment: { icon: '💬', label: '写留言' },
  remix: { icon: '🎬', label: '一起改编' },
  download: { icon: '⬇', label: '下载作品' },
  fullscreen: { icon: '⛶', label: '全屏试玩' },
  explore: { icon: '🏠', label: '作品社区' },
  author: { icon: '👤', label: '作者主页' },
};

export async function render(root, { params }) {
  const token = String(params.token || '');
  let data;
  try {
    data = await api(`/share/${token}`);
  } catch (e) {
    root.innerHTML = `<div class="container page"><div class="empty" style="padding-top:80px">
      <div class="icon">🔗</div><h3>这个分享链接打不开了</h3>
      <div class="muted">${esc(e.message)}</div>
      <a class="btn ghost" href="#/explore" style="margin-top:14px">去作品社区看看</a>
    </div></div>`;
    return;
  }

  const { share, project: p, isOwner } = data;
  const isPython = p.type === 'python';
  const comments = await api(`/projects/${p.id}/comments`).catch(() => []);
  const buttons = (share.buttons || []).filter((k) => BTN_META[k]);
  const canRun = buttons.includes('run');

  document.title = `${share.title || p.title} · 作品分享`;

  root.innerHTML = `
  <div class="share-page">
    <div class="share-head">
      <a class="share-brand" href="#/"><span class="logo">CC</span><span>作品分享</span></a>
      <div class="grow"></div>
      ${isOwner ? `<button class="btn ghost sm" id="share-edit">⚙️ 分享设置</button>` : ''}
      <a class="btn ghost sm" href="#/p/${p.id}">作品详情</a>
    </div>

    <div class="share-body">
      <div class="share-stage-wrap">
        <div class="share-stage" id="share-stage">
          ${
            isPython
              ? `<pre class="code-view share-code" id="share-code">${esc(p.data ? p.data.code || '' : '')}</pre>`
              : `<div class="share-player" id="share-player"><div class="muted tiny" style="padding:56px 0">正在加载作品…</div></div>`
          }
          ${
            canRun
              ? `<div class="share-stage-bar">
                   ${
                     isPython
                       ? `<button class="btn primary sm" id="stage-run">▶ 运行代码</button>`
                       : `<button class="btn primary sm" id="stage-run">🏳 运行</button><button class="btn ghost sm" id="stage-stop">⏹ 停止</button>`
                   }
                   <div class="grow"></div>
                   <button class="btn ghost sm" id="stage-full">⛶ 全屏</button>
                 </div>`
              : ''
          }
        </div>
        <div id="py-out" class="console share-console" style="display:none"></div>
        ${
          share.note
            ? `<div class="share-note">${esc(share.note)}</div>`
            : ''
        }
      </div>

      <aside class="share-side">
        <div class="share-title-row">
          <span class="pill brand">${typeIcon(p.type)} ${typeLabel(p.type)}</span>
          ${!p.published ? '<span class="pill amber">未发布</span>' : ''}
        </div>
        <h1 class="share-title">${esc(share.title || p.title)}</h1>

        <a class="share-author" href="#/u/${p.user_id}">
          ${avatarHtml({ nickname: p.nickname, avatar: p.avatar }, 'lg')}
          <span>
            <b>${esc(p.nickname)}</b>
            <i>创作者 · ${timeAgo(p.updated_at)}更新</i>
          </span>
        </a>

        <div class="share-desc">${esc(p.description || '作者还没有写简介。')}</div>

        <div class="share-stats">
          <span>👁 <b>${p.views}</b></span>
          <span>❤ <b id="like-count">${p.likes}</b></span>
          <span>💬 <b id="cmt-count">${comments.length}</b></span>
        </div>

        <div class="share-btns" id="share-btns">
          ${buttons
            .map(
              (k) => `<button class="share-btn ${k === 'run' ? 'primary' : ''}" data-act="${k}">
                <span class="ico">${BTN_META[k].icon}</span><span>${BTN_META[k].label}</span>
              </button>`
            )
            .join('')}
        </div>

        <button class="btn ghost sm share-copy-inline" id="copy-link">🔗 复制分享链接</button>
      </aside>
    </div>

    <section class="share-comments" id="share-comments">
      <div class="share-sec-head"><h2>留言 ${comments.length}</h2><span class="tiny muted">说点鼓励的话，作者会看到</span></div>
      ${
        state.user
          ? `<div class="share-cmt-form">
              ${avatarHtml(state.user)}
              <textarea id="share-cmt-input" maxlength="300" placeholder="说点什么鼓励一下…"></textarea>
              <button class="btn primary sm" id="share-cmt-send">发送</button>
            </div>`
          : `<div class="tiny muted share-login-tip"><a href="#/login">登录</a> 后可以留言</div>`
      }
      <div id="share-cmt-list">
        ${
          comments.length
            ? comments
                .map(
                  (c) => `<div class="comment">
                    ${avatarHtml({ nickname: c.nickname, avatar: c.avatar })}
                    <div class="grow">
                      <div class="meta"><b style="color:var(--text)">${esc(c.nickname)}</b><span>${timeAgo(c.created_at)}</span></div>
                      <div class="content">${esc(c.content)}</div>
                    </div>
                  </div>`
                )
                .join('')
            : '<div class="muted tiny" style="padding:8px 0">还没有留言，来抢沙发～</div>'
        }
      </div>
    </section>

    <div class="share-foot">
      <a href="#/explore">作品社区</a><span>·</span><a href="#/">返回首页</a>
      <div class="grow"></div>
      <span class="tiny">分享链接 ${share.views} 次访问</span>
    </div>
  </div>`;

  /* ---------- 播放器 ---------- */
  let player = null;
  const runBtn = root.querySelector('#stage-run');
  const stopBtn = root.querySelector('#stage-stop');

  if (!isPython) {
    const slot = root.querySelector('#share-player');
    try {
      player = await mountPlayer(slot, { projectId: p.id, maxWidth: 880 });
      if (canRun) setTimeout(() => player.start(), 600);
    } catch (e) {
      slot.innerHTML = `<div class="empty" style="padding:44px 16px"><div class="icon">🎬</div>
        <div style="font-size:13px">${esc(e.message)}</div>
        <div class="tiny muted" style="margin-top:6px">作者可能还没有保存作品工程文件</div></div>`;
    }
  }

  const runPython = async (btn) => {
    const code = p.data ? p.data.code || '' : '';
    const out = root.querySelector('#py-out');
    out.style.display = 'block';
    out.innerHTML = '<span class="muted">正在执行…</span>';
    btn && (btn.disabled = true);
    try {
      const res = await api('/python/run', { method: 'POST', body: { code } }).catch((e) => {
        throw new Error(e.message.includes('登录') ? '登录后可以运行代码' : e.message);
      });
      const imgs = (res.images || [])
        .map((im) => `<img src="data:${im.mime};base64,${im.data}" style="max-width:100%;background:#fff;border-radius:8px;margin-top:8px" />`)
        .join('');
      out.innerHTML =
        (res.stdout ? `<span style="color:#7bdcb5">${esc(res.stdout)}</span>` : '') +
        (res.stderr ? `<span style="color:#ff8fa3">${esc(res.stderr)}</span>` : '') +
        (res.stdout || res.stderr ? '' : '<span class="muted">（没有输出）</span>') +
        `<div style="color:#64748b;font-size:11.5px;margin-top:6px">${res.ok ? '✅ 运行成功' : '⚠️ 有错误'} · ${res.ms} ms</div>` +
        imgs;
    } catch (err) {
      out.innerHTML = `<span style="color:#ff8fa3">${esc(err.message)}</span>`;
    } finally {
      btn && (btn.disabled = false);
    }
  };

  runBtn &&
    runBtn.addEventListener('click', () => {
      if (isPython) return runPython(runBtn);
      player ? player.start() : toast('作品还在加载，请稍候', 'err');
    });
  stopBtn && stopBtn.addEventListener('click', () => player && player.stop());

  /* ---------- 页面按键 ---------- */
  const stage = root.querySelector('#share-stage');

  root.querySelector('#copy-link')?.addEventListener('click', () => nativeShare({ token, project: p }));

  root.querySelectorAll('[data-act]').forEach((btn) => {
    const act = btn.dataset.act;
    if (act === 'run') btn.setAttribute('hidden', 'hidden'); // 运行按钮在舞台上，这里不重复
    btn.addEventListener('click', async () => {
      if (act === 'run') {
        if (isPython) runPython(btn);
        else player?.start();
        return;
      }
      if (act === 'like') {
        if (!state.user) return (location.hash = '#/login');
        try {
          const res = await api(`/projects/${p.id}/like`, { method: 'POST' });
          root.querySelector('#like-count').textContent = res.likes;
          btn.querySelector('.ico').textContent = res.liked ? '💔' : '❤';
          toast(res.liked ? '已点赞' : '已取消点赞', 'ok');
        } catch (e) {
          toast(e.message, 'err');
        }
        return;
      }
      if (act === 'comment') {
        root.querySelector('#share-comments').scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => root.querySelector('#share-cmt-input')?.focus(), 300);
        return;
      }
      if (act === 'remix') {
        if (!state.user) return (location.hash = '#/login');
        try {
          const res = await api(`/share/${token}/remix`, { method: 'POST' });
          toast('已复制到你的作品里，开始改编吧', 'ok');
          setTimeout(() => (location.href = `/studio/${res.type === 'python' ? 'python' : 'scratch'}.html?id=${res.projectId}`), 700);
        } catch (e) {
          toast(e.message, 'err');
        }
        return;
      }
      if (act === 'download') {
        if (isPython) {
          const blob = new Blob([p.data ? p.data.code || '' : ''], { type: 'text/x-python;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${p.title}.py`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        } else {
          location.href = `/api/projects/${p.id}/sb3`;
        }
        return;
      }
      if (act === 'fullscreen') {
        if (!stage) return;
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await stage.requestFullscreen();
        } catch {
          toast('当前浏览器不支持全屏', 'err');
        }
        return;
      }
      if (act === 'explore') return (location.hash = '#/explore');
      if (act === 'author') return (location.hash = '#/u/' + p.user_id);
    });
  });

  const fullBtn = root.querySelector('#stage-full');
  fullBtn &&
    fullBtn.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await stage.requestFullscreen();
      } catch {
        toast('当前浏览器不支持全屏', 'err');
      }
    });

  /* ---------- 留言 ---------- */
  const send = root.querySelector('#share-cmt-send');
  if (send) {
    send.addEventListener('click', async () => {
      const input = root.querySelector('#share-cmt-input');
      const content = input.value.trim();
      if (!content) return;
      send.disabled = true;
      try {
        await api(`/projects/${p.id}/comments`, { method: 'POST', body: { content } });
        input.value = '';
        await render(root, { params });
      } catch (e) {
        toast(e.message, 'err');
        send.disabled = false;
      }
    });
  }

  root.querySelector('#share-edit')?.addEventListener('click', async () => {
    await openShareDialog(p.id);
    render(root, { params });
  });
}
