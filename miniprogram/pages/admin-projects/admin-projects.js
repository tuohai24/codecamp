const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { timeAgo, typeName } = require('../../utils/format');

Page({
  data: {
    list: [],
    loading: true,
    keyword: '',
    filter: 'all',
    filters: [
      { key: 'all', name: '全部' },
      { key: 'published', name: '已发布' },
      { key: 'draft', name: '未发布' },
    ],
    shown: [],
  },

  onShow() {
    if (!auth.isAdmin()) {
      wx.showToast({ title: '只有管理员可以管理作品', icon: 'none' });
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
      const rows = await api.adminProjects();
      const list = (rows || []).map((p) => ({
        ...p,
        typeText: typeName(p.type),
        time: timeAgo(p.updated_at),
      }));
      this.setData({ list });
      this.apply();
    } catch (e) {
      this.setData({ list: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  apply() {
    const { list, filter, keyword } = this.data;
    const kw = String(keyword || '').trim().toLowerCase();
    const shown = list.filter((p) => {
      if (filter === 'published' && !p.published) return false;
      if (filter === 'draft' && p.published) return false;
      if (kw && (String(p.title || '') + String(p.nickname || '')).toLowerCase().indexOf(kw) < 0) return false;
      return true;
    });
    this.setData({ shown });
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
    this.apply();
  },

  pickFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.key });
    this.apply();
  },

  open(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  async toggle(e) {
    const { id, published } = e.currentTarget.dataset;
    const next = Number(published) ? 0 : 1;
    try {
      await api.updateProject(id, { published: next });
      wx.showToast({ title: next ? '已上线' : '已下线', icon: 'success' });
      this.load();
    } catch (err) {}
  },

  remove(e) {
    const { id, title } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除作品',
      content: '删除「' + (title || '') + '」，作品、点赞和评论都会被清掉，不可恢复。',
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
});
