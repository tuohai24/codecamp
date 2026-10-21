const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { imgUrl } = require('../../utils/format');

const readBase64 = (filePath) =>
  new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (r) => resolve(r.data),
      fail: reject,
    });
  });

Page({
  data: {
    list: [],
    loading: true,
    kind: '',
    keyword: '',
    kinds: [
      { key: '', name: '全部' },
      { key: 'sprite', name: '角色' },
      { key: 'backdrop', name: '背景' },
      { key: 'sound', name: '声音' },
    ],
    uploading: false,
    sheet: false,
    pending: null,
    assetName: '',
    assetKind: 'sprite',
    isAdmin: false,
  },

  onShow() {
    if (!auth.isTeacher()) {
      wx.showToast({ title: '没有权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ isAdmin: auth.isAdmin() });
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      const rows = await api.assets({ kind: this.data.kind, q: this.data.keyword });
      this.setData({
        list: (rows || []).map((a) => ({
          ...a,
          thumb: a.kind === 'sound' ? '' : imgUrl(a.url),
          sizeText: a.bytes ? Math.max(1, Math.round(a.bytes / 1024)) + ' KB' : '',
          dim: a.width && a.height ? a.width + '×' + a.height : '',
        })),
      });
    } catch (e) {
      this.setData({ list: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  pickKind(e) {
    this.setData({ kind: e.currentTarget.dataset.key, loading: true });
    this.load();
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.load(), 400);
  },

  openUpload() {
    wx.showActionSheet({
      itemList: ['上传角色图片', '上传背景图片'],
      success: (r) => {
        this.chooseImage(r.tapIndex === 0 ? 'sprite' : 'backdrop');
      },
    });
  },

  async chooseImage(kind) {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sizeType: ['compressed'],
          success: resolve,
          fail: reject,
        });
      });
      const file = res.tempFiles && res.tempFiles[0];
      if (!file) return;
      const ext = (/\.(\w+)$/.exec(file.tempFilePath) || [])[1] || 'jpeg';
      const mime = ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
      wx.showLoading({ title: '读取中', mask: true });
      const base64 = await readBase64(file.tempFilePath);
      wx.hideLoading();
      this.setData({
        sheet: true,
        assetKind: kind,
        assetName: '',
        pending: { dataUrl: 'data:' + mime + ';base64,' + base64, size: file.size || 0 },
      });
    } catch (e) {
      wx.hideLoading();
    }
  },

  closeSheet() {
    this.setData({ sheet: false, pending: null });
  },

  onAssetName(e) {
    this.setData({ assetName: e.detail.value });
  },

  pickAssetKind(e) {
    this.setData({ assetKind: e.currentTarget.dataset.key });
  },

  async upload() {
    const { pending, assetName, assetKind } = this.data;
    if (!pending) return;
    if (!String(assetName || '').trim()) {
      wx.showToast({ title: '请填写素材名称', icon: 'none' });
      return;
    }
    this.setData({ uploading: true });
    wx.showLoading({ title: '上传中', mask: true });
    try {
      await api.createAsset({
        kind: assetKind,
        name: String(assetName).trim(),
        dataUrl: pending.dataUrl,
      });
      wx.hideLoading();
      wx.showToast({ title: '已上传', icon: 'success' });
      this.setData({ sheet: false, pending: null });
      this.load();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '上传失败', icon: 'none' });
    } finally {
      this.setData({ uploading: false });
    }
  },

  rename(e) {
    const { id, name, tags } = e.currentTarget.dataset;
    wx.showModal({
      title: '重命名素材',
      editable: true,
      placeholderText: '素材名称',
      content: name || '',
      success: async (r) => {
        if (!r.confirm || !r.content) return;
        try {
          await api.updateAsset(id, { name: r.content, tags });
          this.load();
        } catch (err) {}
      },
    });
  },

  remove(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除素材',
      content: '删除「' + (name || '') + '」后，引用它的作品会显示缺图。确定删除？',
      confirmColor: '#dc2626',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.deleteAsset(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.load();
        } catch (err) {}
      },
    });
  },
});
