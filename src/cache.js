'use strict';
/**
 * 进程内缓存与写放大治理。
 *
 * 目标：把「每次请求都要查库」的几类热点数据挪到内存，
 * 并把浏览量这种高频自增改成内存累加 + 定时批量落库，
 * 从而显著降低 CPU（少编译/少执行 SQL）与磁盘写入（少 fsync）。
 */
const { db } = require('./db');

/* ---------------- 鉴权用户缓存 ---------------- */
const users = new Map();
const USER_TTL = 10_000;

function getUser(id) {
  const hit = users.get(id);
  const t = Date.now();
  if (hit && hit.exp > t) return hit.u;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (u) users.set(id, { u, exp: t + USER_TTL });
  else users.delete(id);
  return u || null;
}

function invalidateUser(id) {
  if (id) users.delete(id);
  else users.clear();
}

/* ---------------- 站点信息 / 统计 ---------------- */
let site = { at: 0, data: null };
const SITE_TTL = 20_000;

function getSite(build) {
  const t = Date.now();
  if (site.data && t - site.at < SITE_TTL) return site.data;
  const data = build();
  site = { at: t, data };
  return data;
}

function invalidateSite() {
  site = { at: 0, data: null };
}

/* ---------------- 素材库（角色/背景/声音） ---------------- */
let library = null;

function getLibrary(build) {
  if (!library) library = build();
  return library;
}

function invalidateLibrary() {
  library = null;
}

/* ---------------- 浏览量：内存累加，批量落库 ---------------- */
const views = new Map(); // 'project:12' -> count
let timer = null;

function addView(kind, id) {
  if (!id) return;
  const key = kind + ':' + id;
  views.set(key, (views.get(key) || 0) + 1);
  if (!timer) timer = setInterval(flushViews, 5000).unref();
}

function flushViews() {
  if (!views.size) return;
  const batch = Array.from(views);
  const updProject = db.prepare('UPDATE projects SET views = views + ? WHERE id = ?');
  const updShare = db.prepare('UPDATE shares SET views = views + ? WHERE id = ?');
  try {
    db.exec('BEGIN');
    for (const [key, n] of batch) {
      const i = key.indexOf(':');
      const kind = key.slice(0, i);
      const id = Number(key.slice(i + 1));
      if (kind === 'share') updShare.run(n, id);
      else updProject.run(n, id);
    }
    db.exec('COMMIT');
    // 写成功后才清空；万一失败则把计数留在 Map 里，下个周期重试（不丢数据）
    views.clear();
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    console.warn('[views] 批量写入失败，稍后重试：', e.message);
  }
}

/** 进程退出前调用，确保计数不丢 */
function flushAll() {
  flushViews();
}

module.exports = {
  getUser,
  invalidateUser,
  getSite,
  invalidateSite,
  getLibrary,
  invalidateLibrary,
  addView,
  flushViews,
  flushAll,
};
