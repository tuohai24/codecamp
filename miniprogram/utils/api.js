const { request } = require('./request');

/** 站点信息（含版本号、是否允许注册、统计） */
const site = () => request('/api/site', { auth: false, silent: true });

/* ---------------- 认证 ---------------- */
const login = (username, password) => request('/api/auth/login', { method: 'POST', data: { username, password }, auth: false });
const register = (data) => request('/api/auth/register', { method: 'POST', data, auth: false });
const me = () => request('/api/auth/me', { silent: true });
const updateMe = (data) => request('/api/auth/me', { method: 'PATCH', data });

/** 微信登录：code 换 openid；未注册时后端按站点设置自动创建学生账号 */
const wxLogin = (code, profile) => request('/api/wx/login', { method: 'POST', data: { code, profile }, auth: false });
/** 把微信 openid 绑到已有账号 */
const wxBind = (data) => request('/api/wx/bind', { method: 'POST', data, auth: false });
const wxConfig = () => request('/api/wx/config', { auth: false, silent: true });

/* ---------------- 作品 ---------------- */
const projects = (params) => {
  const q = Object.keys(params || {})
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .map((k) => k + '=' + encodeURIComponent(params[k]))
    .join('&');
  return request('/api/projects' + (q ? '?' + q : ''), { auth: true });
};
const project = (id) => request('/api/projects/' + id);
const createProject = (data) => request('/api/projects', { method: 'POST', data });
const updateProject = (id, data) => request('/api/projects/' + id, { method: 'PATCH', data });
const deleteProject = (id) => request('/api/projects/' + id, { method: 'DELETE' });
const like = (id) => request('/api/projects/' + id + '/like', { method: 'POST' });

const comments = (id) => request('/api/projects/' + id + '/comments', { silent: true });
const addComment = (id, content) => request('/api/projects/' + id + '/comments', { method: 'POST', data: { content } });
const deleteComment = (cid) => request('/api/comments/' + cid, { method: 'DELETE' });

const createShare = (id, data) => request('/api/projects/' + id + '/share', { method: 'POST', data });
const getShare = (token) => request('/api/share/' + token, { auth: false });
const remixShare = (token) => request('/api/share/' + token + '/remix', { method: 'POST' });

/* ---------------- 用户 / 班级 ---------------- */
const user = (id) => request('/api/users/' + id, { auth: false });
const classes = () => request('/api/classes');
const createClass = (data) => request('/api/classes', { method: 'POST', data });
const deleteClass = (id) => request('/api/classes/' + id, { method: 'DELETE' });
const classStudents = (id) => request('/api/classes/' + id + '/students');

/* ---------------- 作业 ---------------- */
const assignments = () => request('/api/assignments');
const assignment = (id) => request('/api/assignments/' + id);
const createAssignment = (data) => request('/api/assignments', { method: 'POST', data });
const updateAssignment = (id, data) => request('/api/assignments/' + id, { method: 'PATCH', data });
const deleteAssignment = (id) => request('/api/assignments/' + id, { method: 'DELETE' });
const startAssignment = (id) => request('/api/assignments/' + id + '/start', { method: 'POST' });
const submitAssignment = (id, projectId) => request('/api/assignments/' + id + '/submit', { method: 'POST', data: { projectId } });
const submissions = (params) => {
  const q = Object.keys(params || {})
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .map((k) => k + '=' + encodeURIComponent(params[k]))
    .join('&');
  return request('/api/submissions' + (q ? '?' + q : ''));
};
const gradeSubmission = (sid, data) => request('/api/submissions/' + sid, { method: 'PATCH', data });

/* ---------------- 概览 ---------------- */
const studentOverview = () => request('/api/student/overview');
const teacherOverview = () => request('/api/teacher/overview');

/* ---------------- 管理后台 ---------------- */
const adminStats = () => request('/api/admin/stats');
const adminSystem = () => request('/api/admin/system');
const adminUsers = (params) => {
  const q = Object.keys(params || {})
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .map((k) => k + '=' + encodeURIComponent(params[k]))
    .join('&');
  return request('/api/admin/users' + (q ? '?' + q : ''));
};
const adminCreateUser = (data) => request('/api/admin/users', { method: 'POST', data });
const adminUpdateUser = (id, data) => request('/api/admin/users/' + id, { method: 'PATCH', data });
const adminDeleteUser = (id) => request('/api/admin/users/' + id, { method: 'DELETE' });
const adminProjects = () => request('/api/admin/projects');
const adminSettings = () => request('/api/admin/settings');
const adminSaveSettings = (data) => request('/api/admin/settings', { method: 'PATCH', data });
const assets = (params) => {
  const q = Object.keys(params || {})
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .map((k) => k + '=' + encodeURIComponent(params[k]))
    .join('&');
  return request('/api/assets' + (q ? '?' + q : ''));
};
const createAsset = (data) => request('/api/assets', { method: 'POST', data });
const updateAsset = (id, data) => request('/api/assets/' + id, { method: 'PATCH', data });
const deleteAsset = (id) => request('/api/assets/' + id, { method: 'DELETE' });

/* ---------------- Python ---------------- */
const runPython = (code) => request('/api/python/run', { method: 'POST', data: { code } });
const pythonPackages = () => request('/api/python/packages');

module.exports = {
  site,
  login, register, me, updateMe, wxLogin, wxBind, wxConfig,
  projects, project, createProject, updateProject, deleteProject, like,
  comments, addComment, deleteComment,
  createShare, getShare, remixShare,
  user, classes, createClass, deleteClass, classStudents,
  assignments, assignment, createAssignment, updateAssignment, deleteAssignment,
  startAssignment, submitAssignment, submissions, gradeSubmission,
  studentOverview, teacherOverview,
  adminStats, adminSystem, adminUsers, adminCreateUser, adminUpdateUser, adminDeleteUser,
  adminProjects, adminSettings, adminSaveSettings, assets, createAsset, updateAsset, deleteAsset,
  runPython, pythonPackages,
};
