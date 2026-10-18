import { api, state } from '../api.js';
import { bindCards, esc, workCard } from '../ui.js';
import { openCreateDialog } from '../app.js';

export async function render(root) {
  const [site, latest, hot] = await Promise.all([
    api('/site'),
    api('/projects?limit=8&sort=new'),
    api('/projects?limit=4&sort=hot'),
  ]);
  const user = state.user;

  root.innerHTML = `
  <div class="container">
    <section class="hero">
      <h1>${esc(site.slogan || '让每个孩子都能创造自己的作品')}</h1>
      <p>拖拽积木做动画，敲 Python 写程序，作品一键发布到社区；老师可以布置作业、在线批改，管理员统一管理素材库。</p>
      <div class="actions">
        <button class="btn lg white" id="hero-create">开始创作</button>
        <a class="btn lg outline" href="#/explore">逛逛作品社区</a>
      </div>
      <div class="stats">
        <div><b>${site.stats.works}</b><span>社区作品</span></div>
        <div><b>${site.stats.students}</b><span>在读学生</span></div>
        <div><b>${site.stats.teachers}</b><span>授课教师</span></div>
        <div><b>${site.stats.assets}</b><span>角色 / 背景素材</span></div>
      </div>
    </section>

    <div class="section-title"><h2>两种创作方式</h2><span class="hint">点开就能用，作品自动保存</span></div>
    <div class="split-even home-modes">
      <a class="card" href="/studio/scratch.html" style="padding:22px;display:flex;gap:16px;align-items:center">
        <div class="mode-ico" style="background:var(--amber-soft)">🐱</div>
        <div>
          <h3 style="font-size:16px;margin-bottom:4px">Scratch 图形化编程</h3>
          <div class="muted" style="font-size:13px">8 类积木、实时舞台预览，支持角色库与背景库素材</div>
        </div>
      </a>
      <a class="card" href="/studio/python.html" style="padding:22px;display:flex;gap:16px;align-items:center">
        <div class="mode-ico" style="background:var(--green-soft)">🐍</div>
        <div>
          <h3 style="font-size:16px;margin-bottom:4px">Python 代码编程</h3>
          <div class="muted" style="font-size:13px">服务端真实运行、turtle 绘图、一键安装第三方库</div>
        </div>
      </a>
    </div>

    ${hot.items.length ? `<div class="section-title"><h2>🔥 热门作品</h2><span class="hint">按点赞与浏览排序</span></div>
    <div class="grid cards">${hot.items.map(workCard).join('')}</div>` : ''}

    <div class="section-title"><h2>✨ 最新发布</h2><a class="hint" href="#/explore" style="margin-left:auto">查看全部 →</a></div>
    <div class="grid cards" id="latest-grid">
      ${latest.items.length ? latest.items.map(workCard).join('') : '<div class="empty"><div class="icon">🫧</div><h3>还没有作品</h3><div>成为第一个发布作品的人吧</div></div>'}
    </div>

    <div class="section-title"><h2>平台能力</h2></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px">
      ${[
        ['📚', '作业全流程', '教师布置作业 → 学生提交作品 → 在线评分与评语，进度一目了然'],
        ['🎨', '自定义素材库', '管理员上传角色与背景，创作页即时可用，也可继续扩展'],
        ['🏫', '班级与权限', '管理员 / 教师 / 学生三种角色，数据隔离，各自独立后台'],
        ['💬', '作品社区', '发布、点赞、评论，学生的成果被看见才有持续动力'],
      ]
        .map(
          ([i, t, d]) => `<div class="card" style="padding:18px">
            <div style="font-size:22px">${i}</div>
            <h3 style="font-size:14.5px;margin:8px 0 4px">${t}</h3>
            <div class="muted" style="font-size:12.5px;line-height:1.65">${d}</div>
          </div>`
        )
        .join('')}
    </div>
    <div style="height:40px"></div>
  </div>`;

  bindCards(root);
  root.querySelectorAll('a[href^="/studio/"]').forEach((a) => {
    if (!user) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        location.hash = '#/login';
      });
    }
  });
  root.querySelector('#hero-create').addEventListener('click', () => openCreateDialog());
}
