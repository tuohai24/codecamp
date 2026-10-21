# CodeCamp 微信小程序端

CodeCamp 的**原生微信小程序**客户端（学生 + 教师 + 管理端），与 Web 端共用同一个 Node 后端。
零构建、零依赖，用微信开发者工具直接导入即可运行。

```
miniprogram/
├── app.js / app.json / app.wxss     # 全局逻辑、路由与设计系统
├── project.config.json              # 开发者工具配置（appid 这里改）
├── sitemap.json
├── utils/
│   ├── config.js                    # ⚠️ 后端地址、H5 域名，发布前必须改
│   ├── request.js                   # 统一请求：token 注入、401 跳登录、错误提示
│   ├── api.js                       # 全部后端接口封装
│   ├── auth.js                      # 登录态：密码登录 / 微信登录 / 绑定
│   ├── format.js                    # 时间、数字、图片地址、角色文案
│   └── h5.js                        # web-view（Scratch 编辑器）入口
├── components/
│   ├── project-card/                # 作品卡片
│   └── empty/                       # 空状态
└── pages/                           # 20 个页面
    ├── index/ explore/ detail/      # 首页、广场、作品详情
    ├── login/ mine/ works/          # 登录注册、我的、我的作品
    ├── edit-py/                     # Python 在线编辑 + 运行
    ├── assignments/ assignment/     # 作业列表、作业详情（提交/批改）
    ├── teacher/ assignment-edit/    # 教师工作台、发布作业
    ├── classes/                     # 班级管理
    ├── admin/ admin-users/          # 管理总览、用户管理
    ├── admin-projects/ admin-assets/ admin-settings/
    ├── user/ about/ webview/
```

## 一、导入运行（本地联调）

1. 用**微信开发者工具**打开本目录（`miniprogram/`，不是项目根）。
2. `project.config.json` 里的 `appid` 默认是 `touristappid`（游客模式），换成你自己的小程序 AppID。
3. 改 `utils/config.js`：
   ```js
   const BASE_URL = 'http://127.0.0.1:3000';  // 本地调试
   const H5_BASE = BASE_URL;
   ```
4. 开发者工具右下角「详情 → 本地设置」勾选 **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**。
5. 启动后端：在项目根执行 `node server.js`（或 `./install.sh` 选 1）。
6. 用演示账号登录：`student / 123456`、`teacher / 123456`、`admin / 123456`。

> 也可以不重启就切换服务器：进入「我的 → 关于 → 服务器地址」，填另一个地址即可（存在本地 storage，清缓存可恢复）。

## 二、后端配置（发布前必做）

在**项目根目录**建 `.env`（参考 `.env.example`，该文件不会被 git 跟踪，升级也不会覆盖）：

```ini
PORT=3000
HOST=0.0.0.0
APP_SECRET=换成一串足够长的随机字符
WX_APPID=wx1234567890abcdef
WX_SECRET=你的 AppSecret
```

修改后重启服务。`/api/wx/config` 返回 `{"enabled":true}` 表示配置生效。

后端为此新增的能力：

| 接口 | 作用 |
|---|---|
| `GET /api/wx/config` | 小程序登录是否可用、是否开放注册 |
| `POST /api/wx/login` | `code` 换 openid；已绑定直接登录，未绑定按站点设置自动建学生账号 |
| `POST /api/wx/bind` | 把微信绑定到已有账号（关闭注册时用） |
| `POST /api/wx/unbind` | 解绑（需登录） |

内容安全（**小程序审核硬性要求**）：作品标题/简介、评论、昵称/简介、作业标题与要求，在写入前都会调用微信 `msgSecCheck`，命中违规直接拒绝。
未配置 `WX_APPID/WX_SECRET` 或非微信用户（Web 端）时自动跳过，不影响主站。

## 三、发布前检查清单

| 项 | 说明 |
|---|---|
| HTTPS 域名 | 小程序只允许 HTTPS。把站点部署到已备案域名（Nginx + 证书），`config.js` 的 `BASE_URL` 改成该域名 |
| request 合法域名 | 微信公众平台 → 开发管理 → 开发设置 → 服务器域名，添加 `https://你的域名` |
| downloadFile 合法域名 | 作品封面、头像走图片资源，同样需要加入该白名单 |
| 业务域名 | 只有用到 **Scratch 创作（web-view）** 才需要；需要在上表位置配置业务域名，并把微信给的校验文件放到 `public/` 根目录（访问 `https://域名/XXXX.txt` 能打开） |
| 类目 | 建议「教育 → 教育信息服务」或「工具 → 学习工具」。选「在线教育」通常要提交办学许可/ICP 资质 |
| 用户隐私保护指引 | 小程序后台 → 设置 → 服务内容声明 → 用户隐私保护指引，勾选：昵称、头像、相册（上传素材/头像） |
| 内容安全 | 已内置 `msgSecCheck`，无需额外开发；后台「站点设置」页可看到检查清单 |
| 账号体系 | 若关闭注册，需先在小程序外（Web 端或管理端）建好账号，学生用「微信登录 → 绑定已有账号」进入 |

## 四、功能对照

| 功能 | 小程序 | 说明 |
|---|---|---|
| 浏览作品 / 搜索 / 排序 | ✅ | 广场支持类型、最新/最热、关键词 |
| 点赞、评论、分享 | ✅ | 分享卡片直接进作品详情；支持分享到朋友圈 |
| Python 作品创作 | ✅ | 内置编辑器 + 运行（后端 `python-runner`），支持 matplotlib 出图 |
| Scratch 作品创作 | ⚠️ web-view | Scratch 引擎依赖 DOM，通过 web-view 打开官方编辑器，需配置业务域名 |
| 我的作品 / 发布 / 删除 | ✅ | |
| 作业列表、去完成、提交 | ✅ | 「去完成」自动建草稿并跳对应编辑器 |
| 教师：发布作业、批改、班级 | ✅ | 评分 0-100 + 评语 |
| 管理：统计、用户、作品、素材、设置 | ✅ | 素材上传支持角色/背景图片（声音在 Web 端上传） |
| 头像 / 昵称修改 | ✅ | 微信头像选择器 + 昵称输入（`chooseAvatar`） |

## 五、已知限制

- **代码编辑器是纯文本 textarea**：没有语法高亮和自动补全。复杂代码建议在电脑浏览器里写，小程序里改几行、跑一下没问题。
- **素材库声音上传**：小程序端只做了图片上传；WAV/MP3 请在 Web 端「素材库」上传。
- **深色模式**：小程序端固定浅色（Web 端仍跟随系统）。需要深色可给 `app.json` 加 `darkmode: true` 与 `theme.json`，再把 `app.wxss` 的变量按 `@media (prefers-color-scheme: dark)` 覆盖一份。
- **实时协作、Scratch 素材镜像同步**：仅 Web 端提供。

## 六、常见问题

**打开就白屏 / 提示网络异常**
检查 `utils/config.js` 的 `BASE_URL` 是否可达；真机调试要求 HTTPS 且域名已加入白名单。

**提示「域名未配置：请在小程序后台加入 request 合法域名」**
`BASE_URL` 的域名没在白名单里，或用了 http。开发阶段可勾选「不校验合法域名」。

**点「微信一键登录」提示未配置**
后端 `.env` 缺 `WX_APPID / WX_SECRET`，或改完没重启服务。此时仍可用账号密码登录。

**点 Scratch 作品提示「需要配置域名」**
`H5_BASE` 还是占位符 `https://codecamp.example.com`，或域名不在业务域名白名单里。

**审核被拒：涉及 UGC 但未提供内容安全能力**
本项目已内置 `msgSecCheck`，确认 `.env` 已配置（否则检测会被跳过），并在审核备注里说明「内容发布前经过微信内容安全接口检测」。
