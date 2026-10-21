const { imgUrl, timeAgo, num, typeName } = require('../../utils/format');

Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    item: { type: Object, value: {} },
    showAuthor: { type: Boolean, value: true },
  },
  data: { view: {} },
  observers: {
    item(v) {
      if (!v || !v.id) return;
      this.setData({
        view: {
          thumb: imgUrl(v.thumb),
          type: v.type,
          typeName: typeName(v.type),
          likes: num(v.likes),
          views: num(v.views),
          time: timeAgo(v.updated_at || v.created_at),
        },
      });
    },
  },
  methods: {
    tap() {
      const id = this.data.item && this.data.item.id;
      if (!id) return;
      wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
    },
  },
});
