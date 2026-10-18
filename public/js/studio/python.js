/* Python 创作工作台：真实服务端执行 + pip 安装第三方库 */
import { api, state, loadMe } from '../api.js';
import { esc, toast } from '../ui.js';
import { mountAssignmentBrief } from './assignment-brief.js';
import { openShareDialog } from '../share.js';

const $ = (s) => document.querySelector(s);
let project = null;
let cm = null;
let dirty = false;
let lastImage = null;
let running = false;

const SAMPLES = [
  {
    title: '👋 你好，世界',
    code: `name = "小同学"
print(f"你好，{name}！")
for i in range(1, 6):
    print("★" * i)
`,
  },
  {
    title: '⭐ turtle 画五角星',
    code: `import turtle

t = turtle.Turtle()
t.pencolor("orange")
t.pensize(4)
for i in range(5):
    t.forward(150)
    t.right(144)

print("五角星画好了")
`,
  },
  {
    title: '🌈 turtle 彩色螺旋',
    code: `import turtle

t = turtle.Turtle()
t.speed(0)
colors = ["#ff5c8a", "#ffb703", "#4cc9f0", "#7ae582", "#b892ff"]
for i in range(90):
    t.pencolor(colors[i % len(colors)])
    t.forward(i * 3)
    t.right(91)
print("完成！")
`,
  },
  {
    title: '❄️ turtle 雪花',
    code: `import turtle

t = turtle.Turtle()
t.speed(0)
for i in range(6):
    for _ in range(3):
        t.forward(90)
        t.backward(90)
        t.right(45)
    t.right(60)
print("雪花生成完毕")
`,
  },
  {
    title: '🎲 随机数 + while 循环',
    code: `import random

numbers = [random.randint(1, 100) for _ in range(10)]
print("随机数：", numbers)
print("最大值：", max(numbers))
print("平均值：", round(sum(numbers) / len(numbers), 2))

count = 0
while count < 3:
    count += 1
    print("第", count, "次循环")
`,
  },
  {
    title: '📊 matplotlib 折线图',
    code: `# 需要先在「依赖管理」安装 matplotlib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

x = [1, 2, 3, 4, 5]
y = [3, 7, 4, 9, 6]
plt.figure(figsize=(5, 3.2), dpi=120)
plt.plot(x, y, marker="o", color="#5b5bd6")
plt.title("我的成绩变化")
plt.xlabel("第几次")
plt.ylabel("分数")
plt.tight_layout()
plt.savefig("chart.png")
print("图表已生成")
`,
  },
];

const setState = (text, tone = '') => {
  const el = $('#save-state');
  el.textContent = text;
  el.className = 'pill ' + tone;
  dirty = text !== '已保存' && text !== '已发布';
};

function showTab(name) {
  document.querySelectorAll('.tab-strip button[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  ['console', 'canvas', 'deps', 'tips'].forEach((k) => ($('#pane-' + k).style.display = k === name ? (k === 'console' ? 'flex' : 'block') : 'none'));
  if (name === 'deps') loadPackages();
}

function renderConsole(stdout, stderr, ms, ok) {
  const parts = [];
  if (stdout) parts.push(`<span class="ok">${esc(stdout)}</span>`);
  if (stderr) parts.push(`<span class="err">${esc(stderr)}</span>`);
  if (!parts.length) parts.push('<span class="muted">（没有输出）</span>');
  parts.push(`<div style="color:#64748b;margin-top:8px;font-size:11.5px">${ok ? '✅ 运行成功' : '⚠️ 运行结束（有错误）'} · ${ms} ms</div>`);
  const el = $('#console');
  el.innerHTML = parts.join('\n');
  el.scrollTop = el.scrollHeight;
}

async function run() {
  if (running) return;
  running = true;
  const btn = $('#btn-run');
  const btnLabel = btn.querySelector('.t') || btn;
  btn.disabled = true;
  btnLabel.textContent = '运行中…';
  $('#console').innerHTML = '<span class="muted">正在执行…</span>';
  showTab('console');
  try {
    const res = await api('/python/run', { method: 'POST', body: { code: cm.getValue(), projectId: project.id } });
    renderConsole(res.stdout, res.stderr, res.ms, res.ok);
    const pane = $('#pane-canvas');
    if (res.images && res.images.length) {
      lastImage = res.images[0];
      pane.innerHTML = res.images
        .map((im) => `<div><div class="tiny muted" style="margin-bottom:4px">${esc(im.name)}</div><img src="data:${im.mime};base64,${im.data}" alt="${esc(im.name)}" /></div>`)
        .join('');
      showTab('canvas');
    } else {
      pane.innerHTML = '<div class="tiny muted">本次运行没有生成图片。使用 turtle 绘图或 matplotlib 保存图片后会显示在这里。</div>';
    }
  } catch (e) {
    renderConsole('', e.message, 0, false);
  } finally {
    running = false;
    btn.disabled = false;
    btnLabel.textContent = '▶ 运行';
  }
}

async function loadPackages() {
  const list = $('#pkg-list');
  list.innerHTML = '<span class="tiny muted">读取中…</span>';
  try {
    const res = await api('/python/packages');
    $('#py-info').textContent = res.python ? '🐍 ' + res.python.split(/[\\/]/).pop() : '🐍 未检测到 Python';
    $('#pkg-count').textContent = res.items.length;
    list.innerHTML = res.items.length
      ? res.items.map((p) => `<span class="pill">${esc(p.name)} ${esc(p.version)}</span>`).join('')
      : '<span class="tiny muted">暂无第三方库</span>';
  } catch (e) {
    list.innerHTML = `<span class="tiny muted">${esc(e.message)}</span>`;
  }
}

async function install() {
  const input = $('#pkg-name');
  const val = input.value.trim();
  if (!val) return;
  const btn = $('#btn-install');
  btn.disabled = true;
  btn.textContent = '安装中…';
  const log = $('#pip-log');
  log.style.display = 'block';
  log.textContent = '正在执行 pip install ' + val;
  try {
    const res = await api('/python/packages', { method: 'POST', body: { packages: val.split(/[\s,]+/).filter(Boolean) } });
    log.textContent = res.log || '';
    if (res.ok) {
      toast('安装成功', 'ok');
      input.value = '';
      loadPackages();
    } else toast('安装失败，请看日志', 'err');
  } catch (e) {
    log.textContent = e.message;
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '安装';
  }
}

async function save({ silent = false } = {}) {
  const body = { title: $('#title').value.trim() || '未命名作品', data: { code: cm.getValue() } };
  if (lastImage) body.thumb = `data:${lastImage.mime};base64,${lastImage.data}`;
  try {
    await api('/projects/' + project.id, { method: 'PATCH', body });
    setState('已保存');
    if (!silent) toast('已保存', 'ok');
    return true;
  } catch (e) {
    toast('保存失败：' + e.message, 'err');
    return false;
  }
}

async function publish() {
  await save({ silent: true });
  try {
    await api('/projects/' + project.id, { method: 'PATCH', body: { published: 1 } });
    toast('已发布到作品社区', 'ok');
    // 发布完成后直接进入作品页并弹出分享设置，省掉「再找分享按钮」这一步
    setTimeout(() => (location.href = '/#/p/' + project.id + '?share=1'), 600);
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function init() {
  await loadMe();
  if (!state.user) {
    location.href = '/#/login';
    return;
  }
  const id = new URLSearchParams(location.search).get('id');
  try {
    if (id) {
      project = await api('/projects/' + id);
      if (!project.isOwner && state.user.role !== 'admin') {
        document.body.innerHTML = `<div class="empty" style="padding-top:120px"><div class="icon">🔒</div><h3>不能编辑别人的作品</h3><a class="btn ghost" href="/#/p/${id}">查看作品</a></div>`;
        return;
      }
    } else {
      project = await api('/projects', { method: 'POST', body: { type: 'python' } });
      history.replaceState(null, '', '/studio/python.html?id=' + project.id);
    }
  } catch (e) {
    document.body.innerHTML = `<div class="empty" style="padding-top:120px"><div class="icon">💥</div><h3>${esc(e.message)}</h3><a class="btn ghost" href="/">返回首页</a></div>`;
    return;
  }

  $('#title').value = project.title || '未命名作品';
  const code = (project.data && project.data.code) || 'print("Hello, CodeCamp!")\n';

  // 从作业入口进入时展示作业要求；普通入口不会渲染任何东西
  mountAssignmentBrief({ projectId: project.id, variant: 'python', onSave: () => save({ silent: true }) }).catch(() => {});

  cm = CodeMirror(document.getElementById('editor'), {
    value: code,
    mode: 'python',
    theme: 'material-darker',
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    smartIndent: true,
    autoCloseBrackets: true,
    lineWrapping: true,
    extraKeys: {
      'Ctrl-Enter': run,
      'Cmd-Enter': run,
      Tab: (c) => c.execCommand('indentMore'),
      'Shift-Tab': (c) => c.execCommand('indentLess'),
    },
  });
  cm.on('change', () => setState('有未保存的修改', 'amber'));
  setTimeout(() => cm.refresh(), 60);

  const samples = $('#samples');
  samples.innerHTML = SAMPLES.map((s, i) => `<button class="btn ghost" data-i="${i}" style="justify-content:flex-start">${s.title}</button>`).join('');
  samples.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      const s = SAMPLES[Number(b.dataset.i)];
      cm.setValue(s.code);
      showTab('console');
    })
  );

  document.querySelectorAll('.tab-strip button[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#btn-run').addEventListener('click', run);
  $('#btn-save').addEventListener('click', () => save());
  $('#btn-publish').addEventListener('click', publish);
  $('#btn-share').addEventListener('click', async () => {
    if (!project) return;
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
  $('#btn-install').addEventListener('click', install);
  $('#pkg-name').addEventListener('keydown', (e) => e.key === 'Enter' && install());
  $('#title').addEventListener('input', () => setState('有未保存的修改', 'amber'));

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
  setInterval(() => {
    if (dirty) save({ silent: true });
  }, 45000);

  loadPackages();
  setState(project.published ? '已发布' : '已保存');
}

init();
