const api = require('./utils/api');
const auth = require('./utils/auth');

App({
  globalData: {
    site: null,
    user: null,
    ready: null,
    // Scratch / 分享页走 web-view，域名在 config.js 里配置
    h5Base: '',
  },

  onLaunch() {
    const { H5_BASE } = require('./utils/config');
    this.globalData.h5Base = H5_BASE;
    this.globalData.ready = this.bootstrap();
  },

  /** 启动时并行拉站点信息与当前用户，失败不阻塞页面渲染 */
  async bootstrap() {
    const [site, user] = await Promise.all([
      api.site().catch(() => null),
      auth.fetchMe().catch(() => null),
    ]);
    this.globalData.site = site;
    this.globalData.user = user;
    return { site, user };
  },

  /** 等待启动数据就绪（页面 onLoad 里 await） */
  whenReady() {
    return this.globalData.ready || this.bootstrap();
  },

  async refreshUser() {
    const user = await auth.fetchMe().catch(() => null);
    this.globalData.user = user;
    return user;
  },

  async refreshSite() {
    const site = await api.site().catch(() => null);
    this.globalData.site = site;
    return site;
  },
});
