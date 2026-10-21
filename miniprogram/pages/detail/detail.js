const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { imgUrl, timeAgo, num, typeName, initial } = require('../../utils/format');
const h5 = require('../../utils/h5');

Page({
  data: {
    id: 0,
    p: null,
    loading: true,
    cover: '',
    time: '',
    typeText: '',
    likes: 0,
    liked: false,
    authorAvatar: '',
    authorInitial: '?',
    comments: [],
    commentText: '',
    sending: false,
    code: '',
    codeShown: true,
    running: false,
    runResult: null,
    runImages: [],
    isOwner: false,
    canManage: false,
    myId: 0,
    h5: h5.H5_BASE,
  },

  onLoad(query) {
    this.setData({ id: Number(query.id || 0) });
    this.load();
  },

  onShow() {
    // 从编辑器返回时刷新一下（代码可能已保存）
    if (this.data.p && this.data.p.type === 'python' && !this.data.running) {
      setTimeout(() => this.load(true), 300);
    }
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load(silent) {
    const id = this.data.id;
    if (!id) {
      wx.showToast({ title: '缺少作品参数', icon: 'none' });
      return;
    }
    if (!silent) this.setData({ loading: true });
    const user = auth.current();
    try {
      const p = await api.project(id);
      const code = p.type === 'python' && p.data && p.data.code ? String(p.data.code) : '';
      this.setData({
        p,
        cover: imgUrl(p.thumb),
        time: timeAgo(p.updated_at || p.created_at),
        typeText: typeName(p.type),
        likes: p.likes || 0,
        liked: !!p.liked,
        authorAvatar: imgUrl(p.avatar),
        authorInitial: initial(p.nickname),
        isOwner: !!p.isOwner,
        canManage: !!user && (user.id === p.user_id || user.role === 'admin'),
        myId: (user && user.id) || 0,
        code,
      });
      this.loadComments();
    } catch (e) {
      this.setData({ p: null });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadComments() {
    try {
      const list = await api.comments(this.data.id);
      const myId = this.data.myId;
      this.setData({
        comments: (list || []).map((c) => ({
          ...c,
          time: timeAgo(c.created_at),
          avatarUrl: imgUrl(c.avatar),
          initial: initial(c.nickname),
          canDelete: c.uid === myId || this.data.canManage,
        })),
      });
    } catch (e) {}
  },

  async toggleLike() {
    if (!auth.ensureLogin()) return;
    try {
      const res = await api.like(this.data.id);
      this.setData({ liked: !!res.liked, likes: res.likes });
    } catch (e) {}
  },

  onCommentInput(e) {
    this.setData({ commentText: e.detail.value });
  },

  async sendComment() {
    if (!auth.ensureLogin()) return;
    const content = String(this.data.commentText || '').trim();
    if (!content) return;
    this.setData({ sending: true });
    try {
      await api.addComment(this.data.id, content);
      this.setData({ commentText: '' });
      await this.loadComments();
      wx.showToast({ title: '已发布', icon: 'success' });
    } catch (e) {
    } finally {
      this.setData({ sending: false });
    }
  },

  deleteComment(e) {
    const cid = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除评论',
      content: '删除后不可恢复',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.deleteComment(cid);
          this.loadComments();
        } catch (err) {}
      },
    });
  },

  toggleCode() {
    this.setData({ codeShown: !this.data.codeShown });
  },

  async runCode() {
    if (!auth.ensureLogin()) return;
    if (!this.data.code) {
      wx.showToast({ title: '这个作品还没有代码', icon: 'none' });
      return;
    }
    this.setData({ running: true, runResult: null, runImages: [] });
    try {
      const res = await api.runPython(this.data.code);
      const images = (res.images || []).map((img) => 'data:' + img.mime + ';base64,' + img.data);
      this.setData({ runResult: res, runImages: images });
    } catch (e) {
      this.setData({ runResult: { ok: false, stdout: '', stderr: e.message || '运行失败', ms: 0 } });
    } finally {
      this.setData({ running: false });
    }
  },

  edit() {
    if (!this.data.p) return;
    if (this.data.p.type === 'python') {
      wx.navigateTo({ url: '/pages/edit-py/edit-py?id=' + this.data.p.id });
    } else {
      this.openH5();
    }
  },

  /** Scratch 作品只能在 web-view 里用官方编辑器打开 */
  openH5() {
    const p = this.data.p;
    if (!p) return;
    if (p.type === 'python') {
      this.runCode();
      return;
    }
    if (!h5.ready()) {
      h5.tip();
      return;
    }
    h5.open(h5.studioUrl(p.id), (p.title || 'Scratch 创作'));
  },

  async togglePublish() {
    const p = this.data.p;
    if (!p) return;
    const next = !p.published;
    try {
      await api.updateProject(p.id, { published: next ? 1 : 0 });
      wx.showToast({ title: next ? '已发布到广场' : '已取消发布', icon: 'success' });
      this.load(true);
    } catch (e) {}
  },

  remove() {
    const p = this.data.p;
    if (!p) return;
    wx.showModal({
      title: '删除作品',
      content: '删除后作品、点赞和评论都会消失，且不可恢复',
      confirmColor: '#dc2626',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.deleteProject(p.id);
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 500);
        } catch (e) {}
      },
    });
  },

  goAuthor() {
    const p = this.data.p;
    if (!p || !p.user_id) return;
    wx.navigateTo({ url: '/pages/user/user?id=' + p.user_id });
  },

  onShareAppMessage() {
    const p = this.data.p;
    return {
      title: p ? (p.title || 'CodeCamp 作品') : 'CodeCamp 作品',
      path: '/pages/detail/detail?id=' + this.data.id,
    };
  },

  onShareTimeline() {
    const p = this.data.p;
    return { title: p ? p.title : 'CodeCamp 作品', query: 'id=' + this.data.id };
  },
});
