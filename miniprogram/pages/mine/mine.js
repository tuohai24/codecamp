const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { imgUrl, num, roleName, initial } = require('../../utils/format');

Page({
  data: {
    user: null,
    site: {},
    avatar: '',
    initial: '?',
    roleText: '',
    stats: [],
    editing: false,
    form: { nickname: '', bio: '' },
    saving: false,
    menus: [],
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    const app = getApp();
    try {
      await app.whenReady();
    } catch (e) {}
    const user = auth.current();
    if (!user) {
      this.setData({ user: null, stats: [], menus: [] });
      return;
    }
    this.setData({
      user,
      site: (app && app.globalData.site) || {},
      avatar: imgUrl(user.avatar),
      initial: initial(user.nickname),
      roleText: roleName(user.role),
      menus: this.buildMenus(user),
    });
    if (user.role === 'student') {
      try {
        const o = await api.studentOverview();
        this.setData({
          stats: [
            { k: '作品', v: num(o.works) },
            { k: '获赞', v: num(o.likes) },
            { k: '已交作业', v: num(o.submitted) },
          ],
        });
      } catch (e) {}
    } else {
      try {
        const o = await api.teacherOverview();
        this.setData({
          stats: [
            { k: '班级', v: num(o.classes) },
            { k: '学生', v: num(o.students) },
            { k: '待批改', v: num(o.pending) },
          ],
        });
      } catch (e) {}
    }
  },

  buildMenus(user) {
    const list = [
      { key: 'works', icon: '🎨', name: '我的作品', url: '/pages/works/works' },
      { key: 'create', icon: '🐍', name: 'Python 创作', url: '/pages/edit-py/edit-py' },
      { key: 'assign', icon: '📚', name: '我的作业', url: '/pages/assignments/assignments', tab: true },
    ];
    if (user.role === 'teacher' || user.role === 'admin') {
      list.push({ key: 'teacher', icon: '🧑‍🏫', name: '教师工作台', url: '/pages/teacher/teacher' });
      list.push({ key: 'classes', icon: '👥', name: '班级管理', url: '/pages/classes/classes' });
    }
    if (user.role === 'admin') {
      list.push({ key: 'admin', icon: '⚙️', name: '管理后台', url: '/pages/admin/admin' });
    }
    list.push({ key: 'about', icon: 'ℹ️', name: '关于与帮助', url: '/pages/about/about' });
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

  /* ---------------- 编辑资料 ---------------- */
  openEdit() {
    const u = this.data.user || {};
    this.setData({ editing: true, form: { nickname: u.nickname || '', bio: u.bio || '' } });
  },
  closeEdit() {
    this.setData({ editing: false });
  },
  onForm(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value });
  },

  async saveProfile() {
    const { nickname, bio } = this.data.form;
    if (!nickname || !String(nickname).trim()) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      const user = await api.updateMe({ nickname: String(nickname).trim(), bio: String(bio || '') });
      auth.setCurrent(user);
      this.setData({
        user,
        editing: false,
        avatar: imgUrl(user.avatar),
        initial: initial(user.nickname),
      });
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (e) {
    } finally {
      this.setData({ saving: false });
    }
  },

  /** 头像：微信头像选择器 → base64 → 后端存文件 */
  async onChooseAvatar(e) {
    const path = e.detail.avatarUrl;
    if (!path) return;
    wx.showLoading({ title: '上传中', mask: true });
    try {
      const base64 = await new Promise((resolve, reject) => {
        wx.getFileSystemManager().readFile({
          filePath: path,
          encoding: 'base64',
          success: (r) => resolve(r.data),
          fail: reject,
        });
      });
      const ext = (/\.(\w+)$/.exec(path) || [])[1] || 'jpeg';
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const user = await api.updateMe({ avatar: 'data:' + mime + ';base64,' + base64 });
      auth.setCurrent(user);
      this.setData({ user, avatar: imgUrl(user.avatar) });
      wx.hideLoading();
      wx.showToast({ title: '头像已更新', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '上传失败', icon: 'none' });
    }
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新登录才能创作和提交作业',
      confirmText: '退出',
      success: (r) => {
        if (!r.confirm) return;
        auth.logout();
        this.setData({ user: null, stats: [], menus: [] });
        wx.showToast({ title: '已退出', icon: 'none' });
      },
    });
  },

  onShareAppMessage() {
    return { title: 'CodeCamp 少儿编程学堂', path: '/pages/index/index' };
  },
});
