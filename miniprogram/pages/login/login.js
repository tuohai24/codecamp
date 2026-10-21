const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    mode: 'login',
    username: '',
    nickname: '',
    password: '',
    loading: false,
    site: {},
    wxEnabled: false,
    needBind: false,
    errMsg: '',
  },

  onLoad(query) {
    const app = getApp();
    this.setData({ site: (app && app.globalData.site) || {} });
    if (query && query.mode === 'register') this.setData({ mode: 'register' });
    api
      .wxConfig()
      .then((c) => this.setData({ wxEnabled: !!(c && c.enabled) }))
      .catch(() => {});
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.k]: e.detail.value, errMsg: '' });
  },

  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode, errMsg: '' });
  },

  async submit() {
    const { mode, username, password, nickname } = this.data;
    if (!username || !/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      this.setData({ errMsg: '用户名需 3-20 位字母、数字或下划线' });
      return;
    }
    if (!password || password.length < 6) {
      this.setData({ errMsg: '密码至少 6 位' });
      return;
    }
    this.setData({ loading: true, errMsg: '' });
    try {
      if (mode === 'login') await auth.loginWithPassword(username, password);
      else await auth.register({ username, password, nickname: nickname || username });
      // 之前点微信登录但未绑定：登录成功后顺手把当前微信绑上，失败不影响登录
      if (this.data.needBind) {
        try {
          await auth.bindWechat(username, password);
        } catch (e) {}
      }
      wx.showToast({ title: mode === 'login' ? '登录成功' : '注册成功', icon: 'success' });
      setTimeout(() => this.back(), 600);
    } catch (e) {
      this.setData({ errMsg: e.message || '操作失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async wechatLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true, errMsg: '' });
    try {
      const res = await auth.loginWithWechat();
      if (res && res.token) {
        wx.showToast({ title: res.isNew ? '已创建账号' : '登录成功', icon: 'success' });
        setTimeout(() => this.back(), 600);
        return;
      }
      if (res && res.needBind) {
        this.setData({ needBind: true, errMsg: '站点已关闭自动注册，请用已有账号登录，登录后会自动绑定当前微信' });
      }
    } catch (e) {
      this.setData({ errMsg: e.message || '微信登录失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /** 有上一页就返回，否则回首页（tab 页只能用 switchTab） */
  back() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: '/pages/index/index' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  onShareAppMessage() {
    return { title: (this.data.site.name || 'CodeCamp') + ' · 少儿编程学堂', path: '/pages/index/index' };
  },
});
