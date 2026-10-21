const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    loading: true,
    saving: false,
    form: {
      site_name: '',
      site_slogan: '',
      allow_register: true,
      allow_pip: true,
      pip_index: '',
    },
    raw: {},
  },

  onLoad() {
    if (!auth.isAdmin()) {
      wx.showToast({ title: '只有管理员可以修改站点设置', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.load();
  },

  async load() {
    try {
      const s = (await api.adminSettings()) || {};
      this.setData({
        raw: s,
        form: {
          site_name: s.site_name || '',
          site_slogan: s.site_slogan || '',
          allow_register: s.allow_register !== '0',
          allow_pip: s.allow_pip !== '0',
          pip_index: s.pip_index || '',
        },
      });
    } catch (e) {
    } finally {
      this.setData({ loading: false });
    }
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value });
  },

  onSwitch(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value });
  },

  async save() {
    const f = this.data.form;
    this.setData({ saving: true });
    try {
      await api.adminSaveSettings({
        site_name: f.site_name,
        site_slogan: f.site_slogan,
        allow_register: f.allow_register ? '1' : '0',
        allow_pip: f.allow_pip ? '1' : '0',
        pip_index: f.pip_index,
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (e) {
    } finally {
      this.setData({ saving: false });
    }
  },
});
