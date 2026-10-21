const { BASE_URL } = require('./config');

const TOKEN_KEY = 'cc_token';
const BASE_KEY = 'cc_base';

function getBase() {
  return wx.getStorageSync(BASE_KEY) || BASE_URL;
}

function setBase(url) {
  if (url) wx.setStorageSync(BASE_KEY, String(url).replace(/\/+$/, ''));
  else wx.removeStorageSync(BASE_KEY);
}

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

function setToken(token) {
  if (token) wx.setStorageSync(TOKEN_KEY, token);
  else wx.removeStorageSync(TOKEN_KEY);
}

let redirecting = false;
function toLogin() {
  if (redirecting) return;
  const pages = getCurrentPages();
  const cur = pages[pages.length - 1];
  const route = (cur && cur.route) || '';
  if (route.indexOf('login') >= 0) return;
  redirecting = true;
  setTimeout(() => {
    redirecting = false;
  }, 1200);
  wx.navigateTo({ url: '/pages/login/login' });
}

/**
 * 统一请求：自动带 token、统一错误提示、401 跳登录
 * @param {string} path 以 / 开头的接口路径
 * @param {{method?:string, data?:object, silent?:boolean, auth?:boolean}} options
 */
function request(path, options) {
  const opts = options || {};
  const method = opts.method || 'GET';
  const silent = !!opts.silent;
  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (opts.auth !== false && token) header.Authorization = 'Bearer ' + token;

    wx.request({
      url: getBase() + path,
      method,
      data: opts.data,
      header,
      timeout: 20000,
      success(res) {
        const body = res.data;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
          return;
        }
        const message = (body && body.error) || '请求失败（' + res.statusCode + '）';
        if (res.statusCode === 401) {
          setToken('');
          try {
            const app = getApp();
            if (app) app.globalData.user = null;
          } catch (e) {}
          toLogin();
        } else if (!silent) {
          wx.showToast({ title: message, icon: 'none', duration: 2200 });
        }
        const err = new Error(message);
        err.status = res.statusCode;
        err.body = body;
        reject(err);
      },
      fail(e) {
        const msg = String((e && e.errMsg) || '');
        const message = /timeout/i.test(msg) ? '请求超时，请检查网络' : '网络异常，请稍后重试';
        if (!silent) wx.showToast({ title: message, icon: 'none', duration: 2200 });
        const err = new Error(message);
        err.status = 0;
        err.raw = e;
        if (/url not in domain list/i.test(msg)) {
          err.message = '域名未配置：请在小程序后台加入 request 合法域名';
        }
        reject(err);
      },
    });
  });
}

module.exports = { request, getToken, setToken, getBase, setBase };
