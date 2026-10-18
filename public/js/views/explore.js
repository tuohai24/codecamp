import { api, state } from '../api.js';
import { bindCards, esc, workCard } from '../ui.js';

export async function render(root, { query }) {
  const type = query.type || '';
  const q = query.q || '';
  const sort = query.sort || 'new';
  let offset = 0;
  const limit = 24;
  let items = [];
  let total = 0;

  root.innerHTML = `
  <div class="container page">
    <div class="page-title">
      <div>
        <h1>作品社区</h1>
        <div class="sub">看看同学们都在创造什么，点开就能玩</div>
      </div>
      <div class="row">
        ${state.user ? `<a class="btn primary" href="/studio/scratch.html">＋ 我也要创作</a>` : `<a class="btn primary" href="#/login?mode=register">注册开始创作</a>`}
      </div>
    </div>
    <div class="card" style="padding:10px 14px;margin-bottom:18px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div class="row" id="type-filter">
        ${[['', '全部'], ['scratch', '🐱 Scratch'], ['python', '🐍 Python']]
          .map(([v, l]) => `<button class="btn sm ${type === v ? 'primary' : 'ghost'}" data-type="${v}">${l}</button>`)
          .join('')}
      </div>
      <div class="grow"></div>
      <div class="row" id="sort-filter">
        ${[['new', '最新'], ['hot', '最热']].map(([v, l]) => `<button class="btn sm ${sort === v ? 'primary' : 'ghost'}" data-sort="${v}">${l}</button>`).join('')}
      </div>
      ${q ? `<span class="pill brand">搜索：${esc(q)}</span>` : ''}
    </div>
    <div id="list"></div>
    <div style="text-align:center;margin-top:24px"><button class="btn ghost hidden" id="more">加载更多</button></div>
  </div>`;

  const list = root.querySelector('#list');
  const moreBtn = root.querySelector('#more');

  async function load() {
    const params = new URLSearchParams({ limit, offset, sort });
    if (type) params.set('type', type);
    if (q) params.set('q', q);
    const res = await api('/projects?' + params);
    total = res.total;
    items = items.concat(res.items);
    renderList();
  }

  function renderList() {
    if (!items.length) {
      list.innerHTML = `<div class="empty"><div class="icon">🔍</div><h3>没有找到作品</h3><div>换个关键词或类型试试</div></div>`;
      moreBtn.classList.add('hidden');
      return;
    }
    list.innerHTML = `<div class="grid cards">${items.map(workCard).join('')}</div>`;
    bindCards(list);
    moreBtn.classList.toggle('hidden', items.length >= total);
    moreBtn.textContent = `加载更多（已显示 ${items.length} / ${total}）`;
  }

  moreBtn.addEventListener('click', async () => {
    offset += limit;
    moreBtn.disabled = true;
    await load();
    moreBtn.disabled = false;
  });

  root.querySelectorAll('#type-filter button').forEach((b) =>
    b.addEventListener('click', () => {
      const t = b.dataset.type;
      location.hash = `#/explore${t ? '?type=' + t : ''}${q ? (t ? '&' : '?') + 'q=' + encodeURIComponent(q) : ''}`;
    })
  );
  root.querySelectorAll('#sort-filter button').forEach((b) =>
    b.addEventListener('click', () => {
      const p = new URLSearchParams();
      if (type) p.set('type', type);
      if (q) p.set('q', q);
      p.set('sort', b.dataset.sort);
      location.hash = '#/explore?' + p.toString();
    })
  );

  await load();
}
