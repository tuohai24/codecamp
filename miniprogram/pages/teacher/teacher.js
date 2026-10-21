const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { timeAgo, subStatus, num } = require('../../utils/format');

Page({
  data: {
    o: null,
    loading: true,
    isAdmin: false,
    recent: [],
    cards: [],
    entries: [],
  },

  onShow() {
    if (!auth.isTeacher()) {
      wx.showToast({ title: '只有老师可以进入工作台', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ isAdmin: auth.isAdmin() });
    try {
      const o = await api.teacherOverview();
      const cards = [
        { k: '班级', v: num(o.classes) },
        { k: '学生', v: num(o.students) },
        { k: '作业', v: num(o.assignments) },
        { k: '待批改', v: num(o.pending) },
      ];
      this.setData({
        o,
        cards,
        avgScore: o.avgScore === null || o.avgScore === undefined ? '-' : o.avgScore,
        graded: num(o.graded),
        recent: (o.recent || []).map((s) => ({
          ...s,
          time: timeAgo(s.updated_at),
          statusText: subStatus(s.status),
        })),
        entries: [
          { key: 'new', icon: '📝', name: '布置作业', url: '/pages/assignment-edit/assignment-edit' },
          { key: 'assign', icon: '📚', name: '作业列表', url: '/pages/assignments/assignments', tab: true },
          { key: 'classes', icon: '👥', name: '班级管理', url: '/pages/classes/classes' },
          { key: 'users', icon: '🧑‍🎓', name: '学生账号', url: '/pages/admin-users/admin-users' },
        ],
      });
    } catch (e) {
      this.setData({ o: null });
    } finally {
      this.setData({ loading: false });
    }
  },

  go(e) {
    const { url, tab } = e.currentTarget.dataset;
    if (!url) return;
    if (tab) wx.switchTab({ url });
    else wx.navigateTo({ url });
  },

  openAssignment(e) {
    wx.navigateTo({ url: '/pages/assignment/assignment?id=' + e.currentTarget.dataset.id });
  },
});
