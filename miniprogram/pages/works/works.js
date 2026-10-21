const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { imgUrl, timeAgo, typeName } = require('../../utils/format');
const h5 = require('../../utils/h5');

Page({
  data: {
    items: [],
    loading: true,
    logged: false,
    type: '',
    types: [
      { key: '', name: '全部' },
      { key: 'python', name: 'Python' },
      { key: 'scratch', name: 'Scratch' },
    ],
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    const logged = !!auth.current();
    this.setData({ logged });
    if (!logged) {
      this.setData({ items: [], loading: false });
      return;
    }
    try {
      const res = await api.projects({ mine: 1, type: this.data.type, limit: 60 });
      const items = ((res && res.items) || []).map((p) => ({
        id: p.id,
        title: p.title || '未命名作品',
        type: p.type,
        typeText: typeName(p.type),
        thumb: imgUrl(p.thumb),
        published: !!p.published,
        time: timeAgo(p.updated_at || p.created_at),
        likes: p.likes || 0,
        views: p.views || 0,
      }));
      this.setData({ items });
    } catch (e) {
      this.setData({ items: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  pickType(e) {
    const type = e.currentTarget.dataset.key;
    if (type === this.data.type) return;
    this.setData({ type, loading: true });
    this.load();
  },

  open(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  edit(e) {
    const { id, type } = e.currentTarget.dataset;
    if (type === 'python') {
      wx.navigateTo({ url: '/pages/edit-py/edit-py?id=' + id });
      return;
    }
    if (!h5.ready()) {
      h5.tip();
      return;
    }
    h5.open(h5.studioUrl(id), 'Scratch 创作');
  },

  async togglePublish(e) {
    const { id, published } = e.currentTarget.dataset;
    const next = Number(published) ? 0 : 1;
    try {
      await api.updateProject(id, { published: next });
      wx.showToast({ title: next ? '已发布' : '已取消发布', icon: 'success' });
      this.load();
    } catch (err) {}
  },

  remove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除作品',
      content: '删除后不可恢复',
      confirmColor: '#dc2626',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.deleteProject(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.load();
        } catch (err) {}
      },
    });
  },

  create() {
    if (!auth.ensureLogin()) return;
    wx.showActionSheet({
      itemList: ['新建 Python 作品', '新建 Scratch 作品'],
      success: async (r) => {
        if (r.tapIndex === 0) {
          wx.navigateTo({ url: '/pages/edit-py/edit-py' });
          return;
        }
        if (!h5.ready()) {
          h5.tip();
          return;
        }
        try {
          const p = await api.createProject({ type: 'scratch', title: '未命名 Scratch 作品' });
          h5.open(h5.studioUrl(p.id), 'Scratch 创作');
        } catch (e) {}
      },
    });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },
});
