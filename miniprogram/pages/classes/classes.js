const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { initial } = require('../../utils/format');

Page({
  data: {
    list: [],
    loading: true,
    creating: false,
    name: '',
    saving: false,
    viewing: null,
    students: [],
  },

  onShow() {
    if (!auth.isTeacher()) {
      wx.showToast({ title: '只有老师和管理员可以管理班级', icon: 'none' });
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
      const list = await api.classes();
      this.setData({ list: list || [] });
    } catch (e) {
      this.setData({ list: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  openCreate() {
    this.setData({ creating: true, name: '' });
  },
  closeCreate() {
    this.setData({ creating: false });
  },
  onName(e) {
    this.setData({ name: e.detail.value });
  },

  async create() {
    const name = String(this.data.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写班级名称', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      await api.createClass({ name });
      wx.showToast({ title: '已创建', icon: 'success' });
      this.setData({ creating: false });
      this.load();
    } catch (e) {
    } finally {
      this.setData({ saving: false });
    }
  },

  async viewStudents(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showLoading({ title: '加载中', mask: true });
    try {
      const rows = await api.classStudents(id);
      this.setData({
        viewing: { id, name },
        students: (rows || []).map((s) => ({ ...s, initial: initial(s.nickname) })),
      });
    } catch (err) {
    } finally {
      wx.hideLoading();
    }
  },

  closeStudents() {
    this.setData({ viewing: null, students: [] });
  },

  copyCode(e) {
    const code = e.currentTarget.dataset.code;
    if (!code) return;
    wx.setClipboardData({ data: code, success: () => wx.showToast({ title: '班级码已复制', icon: 'none' }) });
  },

  remove(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除班级',
      content: '删除「' + name + '」后，该班的作业也会一并删除，学生不会被删除但会脱离班级。',
      confirmColor: '#dc2626',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.deleteClass(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.load();
        } catch (err) {}
      },
    });
  },
});
