const api = require('../../utils/api');
const { imgUrl, timeAgo, roleName, initial } = require('../../utils/format');

Page({
  data: {
    id: 0,
    u: null,
    items: [],
    loading: true,
    avatar: '',
    initial: '?',
    roleText: '',
    joined: '',
  },

  onLoad(query) {
    this.setData({ id: Number(query.id || 0) });
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    const id = this.data.id;
    if (!id) return;
    this.setData({ loading: true });
    try {
      const [u, res] = await Promise.all([
        api.user(id),
        api.projects({ author: id, limit: 30 }).catch(() => ({ items: [] })),
      ]);
      this.setData({
        u,
        avatar: imgUrl(u.avatar),
        initial: initial(u.nickname),
        roleText: roleName(u.role),
        joined: timeAgo(u.created_at),
        items: (res && res.items) || [],
      });
      wx.setNavigationBarTitle({ title: u.nickname || '个人主页' });
    } catch (e) {
      this.setData({ u: null });
    } finally {
      this.setData({ loading: false });
    }
  },

  openWork(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },
});
