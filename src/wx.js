'use strict';
/**
 * 微信小程序服务端能力：code2session、access_token 缓存、内容安全检测
 *
 * 配置（环境变量）：
 *   WX_APPID   小程序 AppID
 *   WX_SECRET  小程序 AppSecret
 *
 * 两项都为空时，小程序登录接口返回「未配置」，内容安全检测直接放行，
 * Web 端所有功能不受影响——本地开发和未配置小程序的部署仍然可用。
 */

const APPID = process.env.WX_APPID || '';
const SECRET = process.env.WX_SECRET || '';

const enabled = () => !!(APPID && SECRET);

/* ---------------- access_token ---------------- */
let tokenCache = { token: '', exp: 0 };
let tokenInflight = null;

async function fetchToken() {
  const url =
    'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential' +
    `&appid=${encodeURIComponent(APPID)}&secret=${encodeURIComponent(SECRET)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) {
    throw new Error(`获取微信 access_token 失败（${data.errcode || '?'} ${data.errmsg || '未知错误'}）`);
  }
  tokenCache = {
    token: data.access_token,
    exp: Date.now() + Math.max(60, (Number(data.expires_in) || 7200) - 300) * 1000,
  };
  return tokenCache.token;
}

async function getAccessToken(force = false) {
  if (!enabled()) return '';
  if (!force && tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  if (!tokenInflight) {
    tokenInflight = fetchToken().finally(() => {
      tokenInflight = null;
    });
  }
  return tokenInflight;
}

/** access_token 过期（40001/42001）时清缓存重试一次 */
async function callWithToken(url, body) {
  let token = await getAccessToken();
  const run = async (t) =>
    fetch(`${url}?access_token=${encodeURIComponent(t)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    }).then((r) => r.json());

  let data = await run(token);
  if (data && (data.errcode === 40001 || data.errcode === 42001 || data.errcode === 40014)) {
    token = await getAccessToken(true);
    data = await run(token);
  }
  return data || {};
}

/* ---------------- 登录 ---------------- */
async function code2Session(code) {
  if (!enabled()) throw new Error('服务端未配置小程序 AppID / AppSecret');
  if (!code) throw new Error('缺少登录凭证 code');
  const url =
    'https://api.weixin.qq.com/sns/jscode2session?grant_type=authorization_code' +
    `&appid=${encodeURIComponent(APPID)}&secret=${encodeURIComponent(SECRET)}` +
    `&js_code=${encodeURIComponent(code)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = await res.json().catch(() => ({}));
  if (!data.openid) {
    throw new Error(`微信登录失败（${data.errcode || '?'} ${data.errmsg || '无效的 code'}）`);
  }
  return { openid: data.openid, unionid: data.unionid || '', sessionKey: data.session_key || '' };
}

/* ---------------- 内容安全 ---------------- */
// scene：1 资料 / 2 评论 / 3 论坛 / 4 社交日志
const SCENE = { profile: 1, comment: 2, forum: 3, social: 4 };

/**
 * 文本内容安全检测（UGC 必须做，否则小程序审核会被驳回）
 * 返回值 { ok:boolean, suggest, label, skipped?:boolean }
 */
async function msgSecCheck(content, openid, scene = SCENE.comment) {
  const text = String(content == null ? '' : content).trim();
  if (!text) return { ok: true, suggest: 'pass', label: 100, skipped: true };
  // 未配置小程序凭据（例如纯 Web 部署）时不做检测，避免把主站功能卡死
  if (!enabled()) return { ok: true, suggest: 'pass', label: 100, skipped: true };
  // msgSecCheck v2 需要 openid；Web 端用户没有 openid，此时跳过（Web 不在小程序审核范围内）
  if (!openid) return { ok: true, suggest: 'pass', label: 100, skipped: true };

  const data = await callWithToken('https://api.weixin.qq.com/wxa/msg_sec_check', {
    version: 2,
    openid,
    scene,
    content: text.slice(0, 2500),
  });

  if (data.errcode === 87014) return { ok: false, suggest: 'risky', label: 100 };
  if (data.errcode && data.errcode !== 0) {
    const err = new Error(`内容检测失败（${data.errcode} ${data.errmsg || ''}）`);
    err.errcode = data.errcode;
    throw err;
  }
  const result = data.result || {};
  const suggest = result.suggest || 'pass';
  return { ok: suggest === 'pass', suggest, label: result.label || 100 };
}

/**
 * 批量检测多个字段，任一不通过即抛错。
 * 检测服务本身报错时只记录日志并放行，避免微信侧抖动导致用户无法发布。
 */
async function checkTexts(items, openid, scene) {
  const list = (items || []).filter((s) => s && String(s).trim());
  for (const text of list) {
    try {
      const r = await msgSecCheck(text, openid, scene);
      if (!r.ok) {
        const err = new Error('内容含有违规信息，请修改后再提交');
        err.status = 400;
        err.secCheck = true;
        throw err;
      }
    } catch (e) {
      if (e.secCheck) throw e;
      console.warn('[wx] 内容安全检测跳过：', e.message);
    }
  }
  return true;
}

module.exports = { enabled, getAccessToken, code2Session, msgSecCheck, checkTexts, SCENE };
