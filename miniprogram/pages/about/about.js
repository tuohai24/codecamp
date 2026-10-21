const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { APP_VERSION, BASE_URL } = require('../../utils/config');
const { getBase, setBase } = require('../../utils/request');

Page({
  data: {
    appVersion: APP_VERSION,
    server: '',
    base: '',
    siteName: '',
    allowRegister: false,
    editing: false,
    baseInput: '',
    wxBound: false,
  },

  onShow() {
    this.load();
  },

  async load() {
    const user = auth.current();
    this.setData({
      base: getBase(),
      wxBound: !!(user && user.wxBound),
    });
    try {
      const s = await api.site();
      this.setData({
        server: (s && s.version) || '-',
        siteName: (s && s.name) || '',
        allowRegister: !!(s && s.allowRegister),
      });
    } catch (e) {}
  },

  openEdit() {
    this.setData({ editing: true, baseInput: this.data.base });
  },
  closeEdit() {
    this.setData({ editing: false });
  },
  onBaseInput(e) {
    this.setData({ baseInput: e.detail.value });
  },
  saveBase() {
    const v = String(this.data.baseInput || '').trim();
    if (v && !/^https?:\/\//.test(v)) {
      wx.showToast({ title: '需要以 http(s):// 开头', icon: 'none' });
      return;
    }
    setBase(v === BASE_URL ? '' : v);
    wx.showToast({ title: '已切换服务器', icon: 'success' });
    this.setData({ editing: false, base: getBase() });
    this.load();
  },

  clearCache() {
    wx.showModal({
      title: '清除本地数据',
      content: '会清除登录状态与本地设置，需要重新登录（服务器上的作品和作业不受影响）',
      success: (r) => {
        if (!r.confirm) return;
        auth.logout();
        setBase('');
        wx.showToast({ title: '已清除', icon: 'success' });
        this.load();
      },
    });
  },

  copyBase() {
    wx.setClipboardData({ data: this.data.base, success: () => wx.showToast({ title: '已复制', icon: 'none' }) });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },
});
