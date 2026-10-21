const api = require('../../utils/api');
const auth = require('../../utils/auth');

const TEMPLATE = `# 试试修改数字，看看输出有什么变化
for i in range(1, 6):
    print("*" * i)

print("Hello, CodeCamp!")
`;

Page({
  data: {
    id: 0,
    title: '',
    code: '',
    loading: false,
    saving: false,
    running: false,
    dirty: false,
    published: false,
    result: null,
    images: [],
    snippetIndex: -1,
  },

  snippets: [
    {
      name: '打印星星',
      code: 'for i in range(1, 6):\n    print("*" * i)\n',
    },
    {
      name: '计算平均分',
      code: 'scores = [88, 92, 79, 95]\nprint("平均分：", sum(scores) / len(scores))\nprint("最高分：", max(scores))\n',
    },
    {
      name: '猜数字',
      code: `import random
answer = random.randint(1, 10)
for guess in [5, 3, 7]:
    print("猜", guess, "→", "大了" if guess > answer else ("小了" if guess < answer else "对了"))
print("答案是", answer)
`,
    },
    {
      name: '画折线图',
      code: `import matplotlib.pyplot as plt
x = [1, 2, 3, 4, 5]
y = [2, 4, 3, 7, 6]
plt.plot(x, y, marker="o")
plt.title("我的折线图")
plt.show()
`,
    },
  ],

  onLoad(query) {
    if (!auth.ensureLogin()) return;
    if (query && query.id) {
      this.setData({ id: Number(query.id) });
      this.load();
    } else {
      this.setData({ code: TEMPLATE, title: '未命名 Python 作品' });
    }
  },

  async load() {
    this.setData({ loading: true });
    try {
      const p = await api.project(this.data.id);
      const code = (p.data && p.data.code) || TEMPLATE;
      this.setData({
        title: p.title || '',
        code,
        published: !!p.published,
        dirty: false,
      });
      wx.setNavigationBarTitle({ title: p.title || 'Python 创作' });
    } catch (e) {
      wx.showToast({ title: '作品读取失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onTitle(e) {
    this.setData({ title: e.detail.value });
  },

  onCode(e) {
    this.setData({ code: e.detail.value, dirty: true });
  },

  pickSnippet() {
    wx.showActionSheet({
      itemList: this.snippets.map((s) => s.name),
      success: (r) => {
        const s = this.snippets[r.tapIndex];
        this.setData({ code: s.code, dirty: true });
      },
    });
  },

  async ensureProject() {
    if (this.data.id) return this.data.id;
    const p = await api.createProject({
      type: 'python',
      title: String(this.data.title || '未命名 Python 作品').slice(0, 40),
      code: this.data.code,
    });
    this.setData({ id: p.id });
    return p.id;
  },

  async save(silent) {
    if (this.data.saving) return false;
    this.setData({ saving: true });
    try {
      const id = await this.ensureProject();
      await api.updateProject(id, {
        title: String(this.data.title || '未命名 Python 作品').slice(0, 40),
        data: { code: this.data.code },
      });
      this.setData({ dirty: false });
      if (!silent) wx.showToast({ title: '已保存', icon: 'success' });
      return true;
    } catch (e) {
      return false;
    } finally {
      this.setData({ saving: false });
    }
  },

  async run() {
    if (this.data.running) return;
    if (!this.data.code.trim()) {
      wx.showToast({ title: '代码为空', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '运行中', mask: true });
    this.setData({ running: true, result: null, images: [] });
    try {
      const res = await api.runPython(this.data.code);
      this.setData({
        result: res,
        images: (res.images || []).map((img) => 'data:' + img.mime + ';base64,' + img.data),
      });
    } catch (e) {
      this.setData({ result: { ok: false, stdout: '', stderr: e.message || '运行失败', ms: 0 } });
    } finally {
      wx.hideLoading();
      this.setData({ running: false });
    }
  },

  async publish() {
    const ok = await this.save(true);
    if (!ok) return;
    try {
      await api.updateProject(this.data.id, { published: 1 });
      this.setData({ published: true });
      wx.showToast({ title: '已发布到广场', icon: 'success' });
    } catch (e) {}
  },

  async saveAndBack() {
    if (this.data.dirty) {
      const ok = await this.save(true);
      if (!ok) return;
    }
    wx.navigateBack();
  },

  onUnload() {
    // 离开页面时静默保存一次，避免丢代码
    if (this.data.dirty && this.data.id) {
      api.updateProject(this.data.id, { data: { code: this.data.code } }).catch(() => {});
    }
  },
});
