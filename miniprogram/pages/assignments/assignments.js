const api = require('../../utils/api');
const auth = require('../../utils/auth');
const { timeAgo, typeName, subStatus } = require('../../utils/format');

Page({
  data: {
    list: [],
    loading: true,
    logged: false,
    isTeacher: false,
    stats: null,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    const user = auth.current();
    const logged = !!user;
    const isTeacher = !!user && (user.role === 'teacher' || user.role === 'admin');
    this.setData({ logged, isTeacher });
    if (!logged) {
      this.setData({ list: [], loading: false });
      return;
    }
    try {
      const rows = await api.assignments();
      const list = (rows || []).map((a) => {
        const due = a.due_at ? timeAgo(a.due_at) : '';
        if (isTeacher) {
          const total = a.total || 0;
          const submitted = a.submitted || 0;
          return {
            id: a.id,
            title: a.title,
            typeText: typeName(a.type),
            className: a.class_name || '全部班级',
            due,
            total,
            submitted,
            graded: a.graded || 0,
            percent: total ? Math.round((submitted / total) * 100) : 0,
          };
        }
        return {
          id: a.id,
          title: a.title,
          typeText: typeName(a.type),
          teacher: a.teacher_name || '',
          due,
          status: a.submit_status ? subStatus(a.submit_status) : '未提交',
          submitted: !!a.submitted,
          workTitle: a.work_title || '',
          workTime: a.work_updated_at ? timeAgo(a.work_updated_at) : '',
        };
      });
      this.setData({ list });
    } catch (e) {
      this.setData({ list: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  open(e) {
    wx.navigateTo({ url: '/pages/assignment/assignment?id=' + e.currentTarget.dataset.id });
  },

  create() {
    wx.navigateTo({ url: '/pages/assignment-edit/assignment-edit' });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  onShareAppMessage() {
    return { title: 'CodeCamp 作业', path: '/pages/index/index' };
  },
});
