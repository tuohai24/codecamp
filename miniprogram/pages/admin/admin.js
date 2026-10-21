const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { num } = require('../../utils/format');

const mb = (bytes) => ((Number(bytes) || 0) / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1) + ' MB';
const dur = (sec) => {
  const s = Number(sec) || 0;
  if (s < 60) return s + ' 秒';
  if (s < 3600) return Math.floor(s / 60) + ' 分钟';
  if (s < 86400) return Math.floor(s / 3600) + ' 小时';
  return Math.floor(s / 86400) + ' 天';
};

Page({
  data: {
    loading: true,
    cards: [],
    sys: null,
    recentUsers: [],
    topProjects: [],
    types: [],
  },

  onShow() {
    if (!auth.isAdmin()) {
      wx.showToast({ title: '只有管理员可以进入后台', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      const [s, sys] = await Promise.all([api.adminStats(), api.adminSystem()]);
      const cards = [
        { k: '用户', v: num(s.users), sub: '学生 ' + num(s.students) + ' · 老师 ' + num(s.teachers) },
        { k: '作品', v: num(s.projects), sub: '已发布 ' + num(s.published) },
        { k: '素材', v: num(s.assets), sub: '角色 ' + num(s.costumes) + ' · 背景 ' + num(s.backdrops) },
        { k: '作业', v: num(s.assignments), sub: '提交 ' + num(s.submissions) },
      ];
      this.setData({
        cards,
        types: s.types || [],
        recentUsers: (s.recentUsers || []).slice(0, 6),
        topProjects: (s.topProjects || []).slice(0, 6),
        sys: {
          version: sys.version,
          node: sys.node,
          platform: sys.platform,
          uptime: dur(sys.uptime),
          rss: mb(sys.memory && sys.memory.rss),
          heap: mb(sys.memory && sys.memory.heapUsed),
          db: mb(sys.db && sys.db.size),
          wal: mb(sys.db && sys.db.wal),
          sb3: mb(sys.db && sys.db.sb3),
          uploads: mb(sys.db && sys.db.uploads),
          comments: num(s.comments),
          classes: num(s.classes),
        },
      });
    } catch (e) {
      this.setData({ sys: null });
    } finally {
      this.setData({ loading: false });
    }
  },

  go(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  },

  openProject(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },
});
