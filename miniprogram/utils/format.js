const { getBase } = require('./request');

/** 相对路径补成绝对地址；已是 http(s)/data 的原样返回 */
function imgUrl(path) {
  const p = String(path || '');
  if (!p) return '';
  if (/^(https?:|data:|blob:)/.test(p)) return p;
  return getBase() + (p.charAt(0) === '/' ? p : '/' + p);
}

/** ISO 字符串 → 时间戳（先走标准解析，失败再兜底替换分隔符） */
function parseTime(iso) {
  if (!iso) return NaN;
  let ts = new Date(iso).getTime();
  if (!isNaN(ts)) return ts;
  ts = new Date(String(iso).replace(/-/g, '/').replace('T', ' ').replace(/\.\d+Z?$/, '')).getTime();
  return ts;
}

/** ISO 时间 → 刚刚 / 12 分钟前 / 3 小时前 / 昨天 / 10-21 */
function timeAgo(iso) {
  if (!iso) return '';
  const ts = parseTime(iso);
  if (!ts || isNaN(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 0) return '刚刚';
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + ' 分钟前';
  const hour = Math.floor(min / 60);
  if (hour < 24) return hour + ' 小时前';
  const day = Math.floor(hour / 24);
  if (day === 1) return '昨天';
  if (day < 7) return day + ' 天前';
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return mm + '-' + dd;
}

function fullTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/** 1200 → 1.2k */
function num(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 10000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return (v / 10000).toFixed(1).replace(/\.0$/, '') + 'w';
}

function initial(name) {
  const s = String(name || '?').trim();
  return s ? s.slice(0, 1).toUpperCase() : '?';
}

const ROLE_NAME = { admin: '管理员', teacher: '老师', student: '学生' };
const roleName = (r) => ROLE_NAME[r] || '学生';

const TYPE_NAME = { scratch: 'Scratch', python: 'Python' };
const typeName = (t) => TYPE_NAME[t] || '作品';

const SUB_STATUS = { submitted: '待批改', graded: '已批改', missing: '作品已删除' };
const subStatus = (s) => SUB_STATUS[s] || s || '';

module.exports = { imgUrl, timeAgo, fullTime, num, initial, roleName, typeName, subStatus };
