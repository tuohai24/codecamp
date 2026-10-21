const { H5_BASE } = require('./config');

/** H5 是否已经配置成真实域名（占位符视为未配置） */
function ready() {
  return /^https:\/\//i.test(H5_BASE) && H5_BASE.indexOf('example.com') < 0;
}

/** Scratch 编辑器地址（web-view 打开） */
function studioUrl(id) {
  return H5_BASE + '/studio/scratch.html?id=' + id + '&embed=1';
}

/** 未配置域名时的统一提示 */
function tip() {
  wx.showModal({
    title: '需要配置域名',
    content:
      'Scratch 编辑器依赖浏览器环境，本小程序通过 web-view 打开。请把 miniprogram/utils/config.js 里的 H5_BASE 改成已备案的 HTTPS 域名，并在小程序后台「开发管理 → 业务域名」里加入该域名。',
    showCancel: false,
  });
}

/** 打开 web-view 页面 */
function open(url, title) {
  wx.navigateTo({
    url: '/pages/webview/webview?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(title || ''),
  });
}

module.exports = { ready, studioUrl, tip, open, H5_BASE };
