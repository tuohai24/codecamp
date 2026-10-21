/**
 * 后端地址配置
 *
 * ⚠️ 发布前必须改成你自己的域名，且满足：
 *   1. 已备案、支持 HTTPS、证书有效
 *   2. 在「微信公众平台 → 开发管理 → 开发设置 → 服务器域名」里加入 request 合法域名
 *
 * 本地调试：开发者工具右下角「详情 → 本地设置」勾选「不校验合法域名…」，
 * 然后把 BASE_URL 临时改成 http://127.0.0.1:3000（也可以运行时用 setBase 覆盖）。
 */
const BASE_URL = 'https://codecamp.example.com';

/** Scratch 创作页、分享页走 web-view，域名需配置为「业务域名」并下载校验文件放到 public/ 根目录 */
const H5_BASE = BASE_URL;

/** 小程序版本号，显示在「关于」页 */
const APP_VERSION = '1.0.0';

module.exports = { BASE_URL, H5_BASE, APP_VERSION };
