const api = require('./api');
const { getToken, setToken } = require('./request');

function app() {
  try {
    return getApp();
  } catch (e) {
    return null;
  }
}

function current() {
  const a = app();
  return (a && a.globalData.user) || null;
}

function setCurrent(user) {
  const a = app();
  if (a) a.globalData.user = user || null;
}

function hasToken() {
  return !!getToken();
}

async function fetchMe() {
  if (!getToken()) return null;
  try {
    const u = await api.me();
    setCurrent(u);
    return u;
  } catch (e) {
    if (e.status === 401) setToken('');
    return null;
  }
}

/** 需要登录时跳登录页，返回是否已登录 */
function ensureLogin() {
  const u = current();
  if (u) return true;
  if (hasToken()) return true; // token 还在，交给接口层校验
  wx.navigateTo({ url: '/pages/login/login' });
  return false;
}

async function loginWithPassword(username, password) {
  const res = await api.login(username, password);
  setToken(res.token);
  setCurrent(res.user);
  return res.user;
}

async function register(data) {
  const res = await api.register(data);
  setToken(res.token);
  setCurrent(res.user);
  return res.user;
}

/** 微信一键登录；needBind 为 true 时表示该微信未绑定账号，需要走绑定流程 */
async function loginWithWechat() {
  const code = await new Promise((resolve, reject) => {
    wx.login({
      success: (r) => (r.code ? resolve(r.code) : reject(new Error('获取微信登录凭证失败'))),
      fail: () => reject(new Error('获取微信登录凭证失败')),
    });
  });
  const res = await api.wxLogin(code);
  if (res && res.token) {
    setToken(res.token);
    setCurrent(res.user);
  }
  return res;
}

async function bindWechat(username, password) {
  const code = await new Promise((resolve, reject) => {
    wx.login({
      success: (r) => (r.code ? resolve(r.code) : reject(new Error('获取微信登录凭证失败'))),
      fail: () => reject(new Error('获取微信登录凭证失败')),
    });
  });
  const res = await api.wxBind({ code, username, password });
  setToken(res.token);
  setCurrent(res.user);
  return res.user;
}

function logout() {
  setToken('');
  setCurrent(null);
}

const isAdmin = () => {
  const u = current();
  return !!u && u.role === 'admin';
};
const isTeacher = () => {
  const u = current();
  return !!u && (u.role === 'teacher' || u.role === 'admin');
};

module.exports = {
  current, setCurrent, hasToken, fetchMe, ensureLogin,
  loginWithPassword, register, loginWithWechat, bindWechat, logout,
  isAdmin, isTeacher,
};
