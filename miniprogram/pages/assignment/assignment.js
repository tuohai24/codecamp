const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { timeAgo, typeName, subStatus, imgUrl, initial } = require('../../utils/format');
const h5 = require('../../utils/h5');

Page({
  data: {
    id: 0,
    a: null,
    loading: true,
    isStudent: false,
    isTeacher: false,
    typeText: '',
    due: '',
    mySubmission: null,
    subStatusText: '',
    work: null,
    subs: [],
    students: [],
    grading: false,
    gradeTarget: null,
    gradeForm: { score: '', feedback: '' },
    picker: false,
    myWorks: [],
    submitting: false,
    h5Ready: false,
  },

  onLoad(query) {
    this.setData({ id: Number(query.id || 0), h5Ready: h5.ready() });
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    const user = auth.current();
    if (!user) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    const isStudent = user.role === 'student';
    this.setData({ isStudent, isTeacher: !isStudent, loading: true });
    try {
      const a = await api.assignment(this.data.id);
      this.setData({
        a,
        typeText: typeName(a.type),
        due: a.due_at ? timeAgo(a.due_at) : '',
        mySubmission: a.mySubmission
          ? { ...a.mySubmission, time: timeAgo(a.mySubmission.updated_at), statusText: subStatus(a.mySubmission.status) }
          : null,
        work: a.work || null,
        subs: ((a.submissions || []).map((s) => ({
          ...s,
          time: timeAgo(s.updated_at),
          statusText: subStatus(s.status),
          initial: initial(s.nickname),
        }))),
        students: a.students || [],
      });
      wx.setNavigationBarTitle({ title: a.title || '作业详情' });
    } catch (e) {
      this.setData({ a: null });
    } finally {
      this.setData({ loading: false });
    }
  },

  /* ---------------- 学生：创作 / 提交 ---------------- */
  async start() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const r = await api.startAssignment(this.data.id);
      const pid = r.projectId;
      if (r.type === 'python') {
        wx.navigateTo({ url: '/pages/edit-py/edit-py?id=' + pid });
      } else if (h5.ready()) {
        h5.open(h5.studioUrl(pid), r.title || 'Scratch 创作');
      } else {
        h5.tip();
      }
      this.load();
    } catch (e) {
    } finally {
      this.setData({ submitting: false });
    }
  },

  async openPicker() {
    try {
      const res = await api.projects({ mine: 1, type: this.data.a.type, limit: 40 });
      this.setData({ myWorks: (res && res.items) || [], picker: true });
    } catch (e) {}
  },

  closePicker() {
    this.setData({ picker: false });
  },

  async pickWork(e) {
    const pid = Number(e.currentTarget.dataset.id);
    this.setData({ picker: false, submitting: true });
    try {
      await api.submitAssignment(this.data.id, pid);
      wx.showToast({ title: '已提交', icon: 'success' });
      this.load();
    } catch (err) {
    } finally {
      this.setData({ submitting: false });
    }
  },

  async submitWork() {
    const w = this.data.work;
    if (!w || !w.projectId) {
      this.openPicker();
      return;
    }
    wx.showModal({
      title: '提交作业',
      content: '确定提交「' + (w.title || '当前草稿') + '」吗？提交后老师可以看到并批改。',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.submitAssignment(this.data.id, w.projectId);
          wx.showToast({ title: '已提交', icon: 'success' });
          this.load();
        } catch (e) {}
      },
    });
  },

  openWork() {
    const w = this.data.work;
    if (!w || !w.projectId) return;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + w.projectId });
  },

  /* ---------------- 教师：评分 ---------------- */
  openGrade(e) {
    const { id, name, score, feedback } = e.currentTarget.dataset;
    this.setData({
      grading: true,
      gradeTarget: { id, name },
      gradeForm: { score: score === undefined || score === null ? '' : String(score), feedback: feedback || '' },
    });
  },

  closeGrade() {
    this.setData({ grading: false });
  },

  onGradeInput(e) {
    this.setData({ ['gradeForm.' + e.currentTarget.dataset.k]: e.detail.value });
  },

  async saveGrade() {
    const t = this.data.gradeTarget;
    if (!t) return;
    const { score, feedback } = this.data.gradeForm;
    const n = Number(score);
    if (score !== '' && (isNaN(n) || n < 0 || n > 100)) {
      wx.showToast({ title: '分数需在 0-100 之间', icon: 'none' });
      return;
    }
    try {
      await api.gradeSubmission(t.id, { score: score === '' ? null : n, feedback });
      this.setData({ grading: false });
      wx.showToast({ title: '已保存评分', icon: 'success' });
      this.load();
    } catch (e) {}
  },

  openStudentWork(e) {
    const pid = e.currentTarget.dataset.pid;
    if (!pid) {
      wx.showToast({ title: '该同学还没有作品', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/detail/detail?id=' + pid });
  },

  editAssignment() {
    wx.navigateTo({ url: '/pages/assignment-edit/assignment-edit?id=' + this.data.id });
  },

  removeAssignment() {
    wx.showModal({
      title: '删除作业',
      content: '作业和对应的提交记录都会删除，不可恢复',
      confirmColor: '#dc2626',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.deleteAssignment(this.data.id);
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 500);
        } catch (e) {}
      },
    });
  },

  onShareAppMessage() {
    return { title: '作业：' + ((this.data.a && this.data.a.title) || ''), path: '/pages/index/index' };
  },
});
