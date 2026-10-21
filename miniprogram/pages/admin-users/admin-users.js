const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { roleName } = require('../../utils/format');

const EMPTY_FORM = { id: 0, username: '', password: '', nickname: '', role: 'student', status: 1, classId: 0 };

Page({
  data: {
    list: [],
    classes: [],
    loading: true,
    isAdmin: false,
    keyword: '',
    role: '',
    roles: [
      { key: '', name: '全部' },
      { key: 'student', name: '学生' },
      { key: 'teacher', name: '老师' },
      { key: 'admin', name: '管理员' },
    ],
    sheet: false,
    editing: false,
    form: { ...EMPTY_FORM },
    classIndex: 0,
    classOptions: [{ id: 0, name: '未分班' }],
    saving: false,
  },

  onLoad() {
    const isAdmin = auth.isAdmin();
    if (!isAdmin && !auth.isTeacher()) {
      wx.showToast({ title: '没有权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ isAdmin });
    this.loadClasses();
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async loadClasses() {
    try {
      const list = await api.classes();
      this.setData({
        classes: list || [],
        classOptions: [{ id: 0, name: '未分班' }].concat((list || []).map((c) => ({ id: c.id, name: c.name }))),
      });
    } catch (e) {}
  },

  async load() {
    try {
      const rows = await api.adminUsers({ q: this.data.keyword, role: this.data.role });
      this.setData({
        list: (rows || []).map((u) => ({ ...u, roleText: roleName(u.role) })),
      });
    } catch (e) {
      this.setData({ list: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.load(), 400);
  },

  pickRole(e) {
    const role = e.currentTarget.dataset.key;
    if (role === this.data.role) return;
    this.setData({ role, loading: true });
    this.load();
  },

  openCreate() {
    this.setData({
      sheet: true,
      editing: false,
      form: { ...EMPTY_FORM },
      classIndex: 0,
    });
  },

  openEdit(e) {
    const { id, username, nickname, role, status, classId } = e.currentTarget.dataset;
    const idx = this.data.classOptions.findIndex((c) => c.id === Number(classId || 0));
    this.setData({
      sheet: true,
      editing: true,
      form: { id: Number(id), username, password: '', nickname, role, status: Number(status) },
      classIndex: idx >= 0 ? idx : 0,
    });
  },

  closeSheet() {
    this.setData({ sheet: false });
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value });
  },

  pickFormRole(e) {
    this.setData({ 'form.role': e.currentTarget.dataset.key });
  },

  toggleStatus() {
    this.setData({ 'form.status': this.data.form.status ? 0 : 1 });
  },

  onClassChange(e) {
    this.setData({ classIndex: Number(e.detail.value) });
  },

  async save() {
    const { form, classOptions, classIndex, editing } = this.data;
    const classId = (classOptions[classIndex] || {}).id || null;
    if (!editing && (!form.username || !/^[A-Za-z0-9_]{3,20}$/.test(form.username))) {
      wx.showToast({ title: '用户名需 3-20 位字母数字下划线', icon: 'none' });
      return;
    }
    if (!editing && (!form.password || form.password.length < 6)) {
      wx.showToast({ title: '密码至少 6 位', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      if (editing) {
        const payload = { nickname: form.nickname, role: form.role, status: form.status, classId };
        if (form.password) payload.password = form.password;
        await api.adminUpdateUser(form.id, payload);
        wx.showToast({ title: '已保存', icon: 'success' });
      } else {
        await api.adminCreateUser({
          username: form.username,
          password: form.password,
          nickname: form.nickname || form.username,
          role: form.role,
          classId,
        });
        wx.showToast({ title: '已创建', icon: 'success' });
      }
      this.setData({ sheet: false });
      this.load();
    } catch (e) {
    } finally {
      this.setData({ saving: false });
    }
  },

  remove(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除用户',
      content: '删除「' + name + '」后其账号将无法登录（作品会保留但显示为匿名）。确定删除？',
      confirmColor: '#dc2626',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.adminDeleteUser(id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.load();
        } catch (err) {}
      },
    });
  },
});
