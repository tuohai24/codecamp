import { api, state } from '../api.js';
import { avatarHtml, esc, timeAgo, toast, typeIcon, typeLabel } from '../ui.js';
import { mountPlayer } from '../scratch/player.js';
import { copyText, openShareDialog } from '../share.js';

export async function render(root, { params, query = {} }) {
  const id = Number(params.id);
  const p = await api('/projects/' + id);
  const comments = await api(`/projects/${id}/comments`);
  const isPython = p.type === 'python';
  const code = isPython ? (p.data.code || '') : '';

  root.innerHTML = `
  <div class="container page">
    <div class="row wrap" style="margin-bottom:14px;gap:8px">
      <a class="btn ghost sm" href="#/explore">← 返回社区</a>
      ${p.isOwner || (state.user && state.user.role === 'admin') ? `<a class="btn ghost sm" href="/studio/${isPython ? 'python' : 'scratch'}.html?id=${p.id}">✏️ 编辑作品</a><button class="btn ghost sm" data-share>🔗 分享</button>` : ''}
      ${!p.published ? '<span class="pill amber">未发布</span>' : ''}
    </div>
    <div class="detail-grid">
      <div>
        <div class="player-box">
          <div class="player-toolbar">
            <span class="pill brand">${typeIcon(p.type)} ${typeLabel(p.type)}</span>
            ${
              isPython
                ? `<button class="btn primary sm" id="run-py">▶ 运行代码</button>`
                : `<button class="btn primary sm" id="run-sc">🏳 运行</button><button class="btn ghost sm" id="stop-sc">⏹ 停止</button>`
            }
            <div class="grow"></div>
            <span class="tiny muted">${isPython ? '在服务端真实执行' : '点击舞台可与作品互动'}</span>
          </div>
          ${isPython ? `<pre class="code-view" id="code">${esc(code)}</pre><div id="py-out" class="console" style="max-height:240px"></div>` : `<div id="player-slot" class="player-slot"><div class="muted tiny" style="padding:60px 0">正在加载 Scratch 作品…</div></div>`}
        </div>

        <div class="panel" style="margin-top:18px">
          <h1 style="font-size:19px;margin-bottom:8px">${esc(p.title)}</h1>
          <div class="row" style="gap:16px;color:var(--muted);font-size:12.5px;margin-bottom:14px">
            <span>👁 ${p.views} 次浏览</span>
            <span>❤ <b id="like-count">${p.likes}</b> 赞</span>
            <span>💬 ${comments.length} 条评论</span>
            <span>更新于 ${timeAgo(p.updated_at)}</span>
          </div>
          <div style="white-space:pre-wrap;font-size:13.5px;line-height:1.8;color:#33354a">${esc(p.description || '作者还没有写简介。')}</div>
        </div>

        <div class="panel" style="margin-top:18px">
          <h2 style="font-size:15px;margin-bottom:8px">评论 ${comments.length}</h2>
          ${
            state.user
              ? `<div class="row" style="margin-bottom:14px;align-items:flex-start">
                  ${avatarHtml(state.user)}
                  <div style="flex:1"><textarea id="comment-input" placeholder="说点什么鼓励一下…" maxlength="300" style="min-height:64px"></textarea></div>
                  <button class="btn primary sm" id="send-comment" style="margin-top:6px">发送</button>
                </div>`
              : `<div class="muted tiny" style="margin-bottom:12px"><a href="#/login" style="color:var(--brand)">登录</a> 后可以评论</div>`
          }
          <div id="comment-list">
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
                : '<div class="muted tiny">还没有评论，来抢沙发～</div>'
            }
          </div>
        </div>
      </div>

      <aside>
        <div class="card" style="padding:18px">
          <div class="row">
            <a href="#/u/${p.user_id}">${avatarHtml({ nickname: p.nickname, avatar: p.avatar }, 'lg')}</a>
            <div>
              <a href="#/u/${p.user_id}" style="font-weight:700">${esc(p.nickname)}</a>
              <div class="tiny muted">创作者</div>
            </div>
          </div>
          <div class="row" style="margin-top:16px;gap:8px">
            <button class="btn ${p.liked ? 'danger' : 'ghost'} grow" id="like-btn">${p.liked ? '❤ 已点赞' : '🤍 点赞'}</button>
            <button class="btn ghost" data-share>🔗 分享</button>
          </div>
          <div class="tiny muted" style="margin-top:14px;line-height:1.7">
            作品 ID：${p.id}<br>
            类型：${typeLabel(p.type)}<br>
            发布时间：${(p.created_at || '').slice(0, 10)}
          </div>
        </div>
        <div class="card" style="padding:18px;margin-top:16px">
          <h3 style="font-size:14px;margin-bottom:8px">🎯 试一试</h3>
          <div class="tiny muted" style="line-height:1.8">
            ${isPython ? '点「运行代码」可以看真实的运行结果，包括 turtle 绘图。' : '点「运行」然后按方向键、点角色，看看会发生什么。'}
          </div>
        </div>
      </aside>
    </div>
  </div>`;

  // 点赞
  root.querySelector('#like-btn').addEventListener('click', async (e) => {
    if (!state.user) return (location.hash = '#/login');
    try {
      const res = await api(`/projects/${id}/like`, { method: 'POST' });
      e.currentTarget.textContent = res.liked ? '❤ 已点赞' : '🤍 点赞';
      e.currentTarget.className = 'btn grow ' + (res.liked ? 'danger' : 'ghost');
      root.querySelector('#like-count').textContent = res.likes;
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  root.querySelectorAll('[data-share]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (p.isOwner || (state.user && state.user.role === 'admin')) {
        await openShareDialog(p.id);
        return;
      }
      const ok = await copyText(location.href);
      toast(ok ? '链接已复制' : '复制失败，请手动复制地址栏链接', ok ? 'ok' : 'err');
    })
  );

  const sendBtn = root.querySelector('#send-comment');
  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      const input = root.querySelector('#comment-input');
      const content = input.value.trim();
      if (!content) return;
      try {
        await api(`/projects/${id}/comments`, { method: 'POST', body: { content } });
        input.value = '';
        await render(root, { params });
      } catch (e) {
        toast(e.message, 'err');
      }
    });
  }

  // Scratch 运行（官方 VM 播放 sb3）
  if (!isPython) {
    const slot = root.querySelector('#player-slot');
    try {
      const player = await mountPlayer(slot, { projectId: id });
      root.querySelector('#run-sc').addEventListener('click', () => player.start());
      root.querySelector('#stop-sc').addEventListener('click', () => player.stop());
      setTimeout(() => player.start(), 500);
    } catch (e) {
      slot.innerHTML = `<div class="empty" style="padding:48px 16px">
        <div class="icon">🎬</div>
        <div style="font-size:13px">${esc(e.message)}</div>
        <div class="tiny muted" style="margin-top:6px">如果这是旧版作品，请作者打开创作页重新保存一次。</div>
      </div>`;
    }
  } else {
    root.querySelector('#run-py').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '运行中…';
      const out = root.querySelector('#py-out');
      out.innerHTML = '<span class="muted">正在执行…</span>';
      try {
        const res = await api('/python/run', { method: 'POST', body: { code } });
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
        btn.disabled = false;
        btn.textContent = '▶ 运行代码';
      }
    });
  }

  // 刚发布完跳到详情页时直接把分享设置弹出来
  if (query.share === '1' && (p.isOwner || (state.user && state.user.role === 'admin'))) {
    setTimeout(() => openShareDialog(p.id), 500);
  }
}
