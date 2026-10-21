const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { num } = require('../../utils/format');

Page({
  data: {
    site: {},
    user: null,
    works: [],
    loading: true,
    stats: { works: 0, students: 0, teachers: 0, assets: 0 },
    entries: [],
  },

  onShow() {
    this.load();
  },

  async load() {
    const app = getApp();
    try {
      await app.whenReady();
    } catch (e) {}
    const user = auth.current();
    const site = (app && app.globalData.site) || {};
    const s = site.stats || {};
    this.setData({
      site,
      user,
      stats: {
        works: num(s.works),
        students: num(s.students),
        teachers: num(s.teachers),
        assets: num(s.assets),
      },
      entries: this.buildEntries(user),
    });
    try {
      const res = await api.projects({ limit: 6 });
      this.setData({ works: (res && res.items) || [] });
    } catch (e) {
      this.setData({ works: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  buildEntries(user) {
    const list = [
      { key: 'explore', icon: '🧭', title: '作品广场', url: '/pages/explore/explore', tab: true },
      { key: 'py', icon: '🐍', title: 'Python 创作', url: '/pages/edit-py/edit-py' },
      { key: 'works', icon: '🎨', title: '我的作品', url: '/pages/works/works' },
      { key: 'assign', icon: '📚', title: '我的作业', url: '/pages/assignments/assignments', tab: true },
    ];
    if (user && (user.role === 'teacher' || user.role === 'admin')) {
      list.push({ key: 'teacher', icon: '🧑‍🏫', title: '教师工作台', url: '/pages/teacher/teacher' });
      list.push({ key: 'classes', icon: '👥', title: '班级管理', url: '/pages/classes/classes' });
    }
    if (user && user.role === 'admin') {
      list.push({ key: 'admin', icon: '⚙️', title: '管理后台', url: '/pages/admin/admin' });
    }
    return list;
  },

  go(e) {
    const { url, tab } = e.currentTarget.dataset;
    if (!url) return;
    if (tab) wx.switchTab({ url });
    else wx.navigateTo({ url });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  goExplore() {
    wx.switchTab({ url: '/pages/explore/explore' });
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  onShareAppMessage() {
    return { title: (this.data.site.name || 'CodeCamp') + ' · 让每个孩子都能创造自己的作品', path: '/pages/index/index' };
  },
});
