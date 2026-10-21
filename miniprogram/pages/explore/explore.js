const api = require('../../utils/api');

Page({
  data: {
    items: [],
    total: 0,
    loading: true,
    loadingMore: false,
    noMore: false,
    keyword: '',
    type: '',
    sort: 'new',
    types: [
      { key: '', name: '全部' },
      { key: 'scratch', name: 'Scratch' },
      { key: 'python', name: 'Python' },
    ],
    sorts: [
      { key: 'new', name: '最新' },
      { key: 'hot', name: '最热' },
    ],
    pageSize: 18,
  },

  onLoad() {
    this.load(true);
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.noMore || this.data.loadingMore) return;
    this.load(false);
  },

  async load(reset) {
    const { keyword, type, sort, pageSize } = this.data;
    const offset = reset ? 0 : this.data.items.length;
    if (reset) this.setData({ loading: true, noMore: false });
    else this.setData({ loadingMore: true });

    try {
      const res = await api.projects({ q: keyword, type, sort, limit: pageSize, offset });
      const list = (res && res.items) || [];
      const items = reset ? list : this.data.items.concat(list);
      this.setData({
        items,
        total: (res && res.total) || items.length,
        noMore: list.length < pageSize,
      });
    } catch (e) {
      if (reset) this.setData({ items: [] });
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  onKeyword(e) {
    const keyword = e.detail.value;
    this.setData({ keyword });
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.load(true), 400);
  },

  clearKeyword() {
    this.setData({ keyword: '' });
    this.load(true);
  },

  pickType(e) {
    const type = e.currentTarget.dataset.key;
    if (type === this.data.type) return;
    this.setData({ type });
    this.load(true);
  },

  pickSort(e) {
    const sort = e.currentTarget.dataset.key;
    if (sort === this.data.sort) return;
    this.setData({ sort });
    this.load(true);
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/edit-py/edit-py' });
  },

  onShareAppMessage() {
    return { title: 'CodeCamp 作品广场', path: '/pages/explore/explore' };
  },
});
