const { BASE_URL, H5_BASE } = require('../../utils/config');
const { getBase } = require('../../utils/request');

const hostOf = (u) => {
  const m = /^https:\/\/([^/?#]+)/i.exec(String(u || ''));
  return m ? m[1].toLowerCase() : '';
};

/** 只允许打开本站域名，避免这个小程序被当作任意网页容器 */
function allowed(url) {
  if (!/^https:\/\//i.test(url)) return false;
  const host = hostOf(url);
  if (!host) return false;
  const allowedHosts = [BASE_URL, H5_BASE, getBase()].map(hostOf).filter(Boolean);
  return allowedHosts.indexOf(host) >= 0;
}

Page({
  data: { url: '' },

  onLoad(query) {
    const url = decodeURIComponent(query.url || '');
    const title = decodeURIComponent(query.title || '');
    if (title) wx.setNavigationBarTitle({ title });
    if (!url || !allowed(url)) {
      wx.showModal({
        title: '无法打开',
        content: '链接不属于本站域名。Scratch 创作需要配置「业务域名」，请检查 miniprogram/utils/config.js 里的 H5_BASE。',
        showCancel: false,
      });
      this.setData({ url: '' });
      return;
    }
    this.setData({ url });
  },

  copy() {
    wx.setClipboardData({
      data: this.data.url,
      success: () => wx.showToast({ title: '链接已复制，可在浏览器打开', icon: 'none' }),
    });
  },
});
