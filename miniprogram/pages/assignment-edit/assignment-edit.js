const api = require('../../utils/api');
const auth = require('../../utils/auth');

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

Page({
  data: {
    id: 0,
    editing: false,
    classes: [],
    classIndex: -1,
    form: {
      title: '',
      description: '',
      type: 'scratch',
      dueAt: '',
      starter: '',
    },
    types: [
      { key: 'scratch', name: 'Scratch' },
      { key: 'python', name: 'Python' },
    ],
    saving: false,
    today: today(),
  },

  onLoad(query) {
    if (!auth.isTeacher()) {
      wx.showToast({ title: '只有老师可以布置作业', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.init(query || {});
  },

  async init(query) {
    await this.loadClasses();
    if (query.id) {
      this.setData({ id: Number(query.id), editing: true });
      await this.loadAssignment();
    }
  },

  async loadClasses() {
    try {
      const list = await api.classes();
      this.setData({ classes: list || [] });
      if (!this.data.editing && list && list.length && this.data.classIndex < 0) {
        this.setData({ classIndex: 0 });
      }
    } catch (e) {}
  },

  async loadAssignment() {
    try {
      const a = await api.assignment(this.data.id);
      const idx = (this.data.classes || []).findIndex((c) => c.id === a.class_id);
      this.setData({
        form: {
          title: a.title || '',
          description: a.description || '',
          type: a.type || 'scratch',
          dueAt: a.due_at ? String(a.due_at).slice(0, 10) : '',
          starter: a.starter || '',
        },
        classIndex: idx,
      });
      wx.setNavigationBarTitle({ title: '编辑作业' });
    } catch (e) {}
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value });
  },

  pickType(e) {
    this.setData({ 'form.type': e.currentTarget.dataset.key });
  },

  onClassChange(e) {
    this.setData({ classIndex: Number(e.detail.value) });
  },

  onDueChange(e) {
    this.setData({ 'form.dueAt': e.detail.value });
  },

  clearDue() {
    this.setData({ 'form.dueAt': '' });
  },

  async save() {
    const { form, classes, classIndex, id, editing } = this.data;
    if (!form.title.trim()) {
      wx.showToast({ title: '请填写作业标题', icon: 'none' });
      return;
    }
    const cls = classes[classIndex];
    if (!editing && !cls) {
      wx.showToast({ title: '请先选择班级', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description,
        type: form.type,
        dueAt: form.dueAt,
        starter: form.starter,
      };
      if (editing) {
        await api.updateAssignment(id, payload);
      } else {
        await api.createAssignment({ ...payload, classId: cls.id });
      }
      wx.showToast({ title: editing ? '已保存' : '已发布', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (e) {
    } finally {
      this.setData({ saving: false });
    }
  },
});
