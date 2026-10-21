# CodeCamp · Scratch + Python 在线编程教学与社区平台

参考开源项目 [open-scratch/teaching-open](https://github.com/open-scratch/teaching-open) 的功能架构（社区 / 创作 / 作业 / 班级 / 权限 / 素材库），用 **Node.js 零依赖** 重写的一套可直接运行的教学平台。

原项目是 Spring Boot + Vue(jeecg-boot) + MySQL + Redis + 七牛云的重型部署，本地跑起来成本高；本项目目标是把核心闭环做成 **clone 下来一条命令就能跑**。

---

## 快速开始

### 方式一：一键安装（推荐）

**Linux / macOS**

```bash
git clone https://github.com/tuohai24/codecamp codecamp
cd codecamp
./install.sh
```

运行后会打开**管理菜单**，输入 `1` 即可安装并启动。想跳过菜单直接装：

```bash
./install.sh install
```

也可以不手动 clone，一条命令装到 `~/codecamp`（远程管道执行不会进菜单，直接安装）：

```bash
curl -fsSL https://raw.githubusercontent.com/tuohai24/codecamp/main/install.sh | bash
```

**Windows（PowerShell）**

```powershell
git clone https://github.com/tuohai24/codecamp codecamp
cd codecamp
.\install.ps1
```

同样会先进管理菜单（选 `1` 安装）；跳过菜单用 `.\install.ps1 install`。

不手动 clone，一条命令装到 `%USERPROFILE%\codecamp`：

```powershell
irm https://raw.githubusercontent.com/tuohai24/codecamp/main/install.ps1 | iex
```

如果提示脚本被禁止运行，先在当前窗口放开一次：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

安装脚本只做四件事：检查 Node.js ≥ 22.5 → 建好 `data/` → 首次启动自动初始化数据库 → 后台拉起服务并打印访问地址。项目零依赖，**不需要 `npm install`**。

### 管理菜单（安装 / 升级 / 修复 / 卸载都在这里）

在安装目录直接运行 `./install.sh`（Windows 用 `.\install.ps1`）即可打开菜单，不用记子命令：

```
================================================
  CodeCamp v1.2.0  管理菜单
------------------------------------------------
  状态   运行中（PID 14496）
  地址   http://127.0.0.1:3000
  目录   /home/you/codecamp
  数据   data/ 与 .runtime/（升级、卸载默认保留）
================================================
   1) 安装 / 启动         首次安装，或服务停着时启动服务
   2) 运行状态            版本、端口、进程、健康检查、数据体积
   3) 升级到最新版        先备份数据库，再更新代码并重启
   4) 修复安装            体检目录 / 配置 / 进程 / 数据库并重启
   5) 重启服务            改了配置或服务卡住时用
   6) 停止服务            数据不会动
   7) 查看日志            最近 80 行运行日志
   8) 重置账号密码        忘记密码时用
   9) 卸载（保留数据）    停服务、清运行状态，账号作品都在
  10) 卸载并删除数据      连账号、作品、素材一起删除，不可恢复
   0) 退出
```

- 菜单顶部永远显示当前**版本 / 运行状态 / 访问地址**，选完一项执行完会回到菜单，可以连续操作。
- 某一项失败只会提示 `[失败]`，不会把整个菜单关掉；按回车继续。
- `3) 升级` 会问升级方式（回车默认 / `f` 丢弃本地改动 / `t` 用源码包），和 `update --force`、`update --tarball` 等价。
- `4) 修复` 会问是否从官方仓库补齐代码文件（等价 `repair --code`），适合「文件被误删 / 配置写坏 / 进程卡死」的情况。
- 非交互环境（CI、`curl | bash`、重定向输入）不会进菜单，直接执行默认的安装流程；也可以用 `./install.sh menu` 显式进入。

### 缺依赖时怎么办（脚本会自动装）

脚本会先自检环境，**发现缺东西会直接问你要不要装**，答 Y 就自动搞定，不用自己去下安装包：

| 情况 | 脚本的处理 |
|---|---|
| 没有 Node.js | 询问后自动下载官方 Node 22（约 25–30 MB），解压到 `~/.codecamp/node`（Windows 为 `%USERPROFILE%\.codecamp\node`），**不覆盖、不干扰系统里已有的 Node** |
| Node 版本太低（如 v18） | 同上，另装一份 Node 22 并用它启动服务；系统里那份保持原样 |
| 没有 git | 不逼你装 git，自动改用 GitHub 源码压缩包（`codeload`）下载解压 |
| 没有 curl / wget | 打印手动下载地址，明确告诉你下哪个包 |
| 网络连不上 nodejs.org | 自动切换 `npmmirror.com` 国内镜像 |

相关参数：

```bash
./install.sh --yes          # 无人值守：缺什么直接装，不询问（CI / 批量部署用）
./install.sh --no-install   # 只检查不安装：缺依赖就报错退出，并给出手动安装命令
```

也可以用环境变量控制：`CODECAMP_AUTO_INSTALL=1` 等价于 `--yes`，`CODECAMP_NODE_HOME=/opt/node` 指定自动安装的 Node 放哪。

### 安装之后

```bash
./install.sh                 # 管理菜单（推荐，安装/升级/修复/卸载都在里面）
./install.sh status          # 运行状态（进程 / 端口 / 健康检查 / 数据体积）
./install.sh logs            # 最近 80 行日志
./install.sh restart         # 重启
./install.sh update          # 更新到最新版（备份数据库 → 拉代码 → 重启）
./install.sh repair          # 修复安装（补目录 / 清残留 PID / 查库 / 重启自检）
./install.sh uninstall       # 卸载：停服务、清运行状态，数据保留
./install.sh uninstall --purge   # 连同 data/ 一起删除（不可恢复）
./install.sh passwd admin 新密码  # 重置某个账号的密码
```

### 修复安装

服务起不来、端口没响应、文件被误删时先跑这个，它会依次体检并顺手修掉：

```bash
./install.sh repair            # 体检 + 修复 + 重启自检
./install.sh repair --code     # 再从官方仓库补齐缺失的代码文件（data/ 不动）
./install.sh repair --no-start # 只体检不启动
```

检查项：Node 版本、`data/` 等目录是否齐全、`.runtime` 里的残留 PID、端口/监听地址配置是否合法、关键代码文件是否缺失、数据库能否正常读取（带账号数量）、端口是否被别的程序占用，最后重启并等到端口真正响应才算成功。

### 更新到新版本

在安装目录里执行一条命令即可，账号、作品、上传素材全部保留：

```bash
./install.sh update            # Linux / macOS / Windows Git Bash
.\install.ps1 update           # Windows PowerShell
```

不想进目录也行，直接用远程脚本更新（脚本会自己找到安装目录）：

```bash
# Linux / macOS / Windows Git Bash
curl -fsSL https://raw.githubusercontent.com/tuohai24/codecamp/main/install.sh | bash -s -- update

# Windows PowerShell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/tuohai24/codecamp/main/install.ps1))) update
```

> 国内网络打不开 `raw.githubusercontent.com` 时，换成 jsDelivr 镜像，效果一样：
> ```bash
> curl -fsSL https://fastly.jsdelivr.net/gh/tuohai24/codecamp@main/install.sh | bash -s -- update
> ```

`update` 做了什么：

1. **先探测**：git 安装只做 `fetch`，远端没有新提交就直接结束——服务完全不断，输出「代码已是最新（v1.2.0 · 3f9c2a1），服务未中断」。
2. **停服务 + 备份数据库**到 `data/backups/<时间戳>/`（自动只留最近 5 份）。
3. **换代码**：git 安装走 `pull --ff-only`；压缩包安装（没有 `.git`）自动下载最新源码包，逐文件比对后覆盖，`data/`、`.runtime/` 永远不动。
4. **重启并自检**：等端口真正响应才算成功，失败会打印日志末尾并提示备份位置；数据库结构变更在启动时自动迁移。

版本号会一起打印出来，例如 `发现新版本：v1.1.1 → v1.2.0`、`版本：v1.1.1 → v1.2.0`。
确认线上跑的是哪一版有三种方式：首页页脚、管理员后台「系统状态 → 当前版本」、`./install.sh status` 的第一行。

常见情况：

| 情况 | 处理 |
|---|---|
| 输出「代码已是最新（v… · 提交号），服务未中断」 | 已是最新版，无需操作 |
| 版本号没变但提示有文件更新 | 属于修 Bug / 改文档的小提交，以提交号与文件清单为准 |
| 本地改过代码，`pull` 报冲突 | 保留改动：先 `git stash` 再 `update`；丢弃改动：`./install.sh update --force` |
| git 拉不动（GitHub 被墙 / 超时），但能下源码包 | `./install.sh update --tarball` |
| 更新后启动失败 | 日志会打印出来，把 `data/backups/<时间戳>/` 里的 db 复制回 `data/` 即可回到旧数据 |
| 只想要代码不想重启 | `./install.sh update --no-start` |

Windows 把 `./install.sh` 换成 `.\install.ps1`，子命令与参数完全一致。所有命令也可以用 `node scripts/setup.js <命令>` 运行。

> 自动装的那份 Node 在 `~/.codecamp/node`（Windows 为 `%USERPROFILE%\.codecamp\node`），和系统 Node 互不影响；
> `uninstall` 不会删它（不属于本项目的安装目录），不再需要时手动删掉这个目录即可。

常用参数：

| 参数 | 说明 |
|---|---|
| `--port 8080` | 指定端口（默认 3000） |
| `--host 127.0.0.1` | 只监听本机（默认 `0.0.0.0`，对外提供服务） |
| `--foreground` | 前台运行，`Ctrl+C` 停止，适合调试或容器 |
| `--no-start` | 只更新代码 / 只体检，不重启（配合 `update`、`repair`） |
| `--force` | `update` 时丢弃本地改动，强制对齐远端（会打印提示） |
| `--tarball` | `update` 时改用源码包覆盖（git 不通但能下载时） |
| `--code` | `repair` 时从官方仓库补齐缺失的代码文件（`data/` 不动） |
| `--yes` | 缺依赖时自动安装，不再逐项询问 |
| `--no-install` | 只检查依赖，不自动安装 |

### 方式二：直接运行

```bash
node server.js          # Node >= 22.5（使用内置 node:sqlite）
PORT=8080 node server.js
```

打开 http://127.0.0.1:3000

| 账号 | 密码 | 角色 | 能做什么 |
|---|---|---|---|
| `admin` | 123456 | 管理员 | 数据看板、用户管理、角色/背景素材库、班级、站点设置 |
| `teacher` | 123456 | 教师 | 布置作业、批改评分、班级与学生名单 |
| `student` | 123456 | 学生 | Scratch / Python 创作、提交作业、作品社区 |

> 数据库文件在 `data/codecamp.db`，首次启动自动建表并写入演示数据（含 10 个角色、6 张背景的素材库）。删除 `data/` 即可重置。
>
> **部署到公网前请先改掉默认密码**：`./install.sh passwd admin 你的新密码`（teacher / student 同理）。

### 开机自启（Linux systemd，可选）

```ini
# /etc/systemd/system/codecamp.service
[Unit]
Description=CodeCamp
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/codecamp
ExecStart=/usr/bin/node server.js
Environment=PORT=3000
Environment=HOST=0.0.0.0
Restart=always
User=codecamp

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now codecamp
```


---

## 功能清单

### 创作
- **Scratch 图形化**：**直接嵌入官方 `scratch-gui` 编辑器**（npm 官方构建产物，原样运行，未做任何二次开发）。界面上看到的菜单栏、代码 / 造型 / 声音三个标签、积木分类与抽屉、角色区、舞台、素材库、扩展按钮、绿旗与停止，全部是官方组件本身。作品以官方 `.sb3` 读写，可导出后拿到 scratch.mit.edu 继续编辑。
- **Python 代码**：CodeMirror 编辑器 + 服务端 **真实执行**；turtle 绘图输出 SVG、matplotlib 输出 PNG；支持 **pip 真实安装第三方库** 并可查看已装清单。

### 社区
作品广场（最新 / 最热 / 按类型筛选 / 搜索）、作品详情页可直接运行、点赞、评论、分享链接、作者主页、草稿与发布状态。

### 分享链接与分享页
作品完成后可以为它单独生成一条**对外分享链接**（`/#/s/<token>`），页面上的常用按键由作者自己挑：

- **入口**：作品详情页「🔗 分享」、我的作品卡片「🔗」、创作页顶栏「分享」（未发布时会先自动保存并发布）。探针弹窗里可以生成链接、复制、直接打开分享页、停止分享。
- **常用按键**：8 种可选（立即运行 / 点赞 / 写留言 / 一起改编 / 下载作品 / 全屏试玩 / 作品社区 / 作者主页），最多挑 6 个，按 2 列排布在分享页右侧；"立即运行"同时在舞台下方提供运行/停止/全屏。
- **分享页**：独立布局（隐藏站点导航），左侧播放作品或展示 Python 代码，右侧是标题、作者卡片、简介、浏览/点赞/留言数、按键区、复制链接；下方是留言区，可直接留言。打开页面即自动播放（Scratch）。
- **权限**：链接公开可访问，无需登录；点赞/留言/改编/下载需要登录。只有作者与管理员能创建、修改、停止分享；作品取消发布后，对外链接会提示"作者还没有发布"。
- **一起改编**（remix）：访客一键把作品复制到自己账号（Scratch 连 `.sb3` 一起复制），直接进入编辑器二次创作。
- 数据存 `shares` 表（`token`、`buttons` JSON、`note`、`views`、`active`），一个作品一条有效链接，停止分享即删除记录、链接立即失效。

### 响应式 / 移动端
全站按 `≥1080 / 860 / 640 / 430` 四档适配，手机、平板竖屏、横屏都有对应布局：

- **站点头部**：窄屏折叠为汉堡菜单抽屉（导航 + 搜索 + 遮罩），用户菜单只留头像；顶栏按钮与品牌自适应收缩。
- **内容页**：作品网格 2 列（≤360px 变 1 列）、两栏布局（教学中心、后台、个人设置）自动堆叠、表格在窄屏可横向滑动、弹窗在手机变成底部抽屉（sticky 操作区、`env(safe-area-inset-bottom)` 适配刘海屏）。
- **Scratch 编辑器（重点）**：官方 GUI 是固定三栏（编辑区 598px + 舞台 426px），手机宽度下舞台会被挤出屏幕。窄屏（<900px 或高<470px）时自动切到**一屏一视图**模式：底栏「🎬 舞台 / 🧩 积木」切换 + 绿旗 / 停止；两个视图都保留完整布局（互相遮挡而非卸载），Blockly 与舞台不会因为尺寸为 0 停止渲染。舞台按可用空间等比缩放，横屏改为"舞台在左、角色面板在右"，并在加载完成后自动把积木区居中。
- **Python 编辑器**：窄屏上下分栏（编辑器 + 42vh 输出区），页签可横向滚动；顶栏在手机上收成图标按钮（▶ 💾 🚀 🔗）。
- **分享页 / 作业要求浮层**：单列、按钮 46px 触控高度、浮层占满宽度。

### 教学
作业全流程：教师按班级布置作业（类型 / 截止日期 / 要求 / Python 起始代码）→ 学生在「班级作业」点「去完成」直接进入对应编辑器 → 在编辑器里就地提交 → 教师在线打分（0-100）与评语 → 学生端看到成绩与评语。作业列表显示「已交 / 已批」进度。班级管理含班级码、学生名单。

#### 作业要求支持 Markdown + 图片

作业要求正文不再是纯文本，而是一份 **Markdown 文档**：

- **编辑器**：工具条（小标题 / 加粗 / 斜体 / 无序列表 / 有序列表 / 引用 / 行内代码 / 链接 / 图片）+ **编辑 ↔ 预览**切换，边写边看效果。
- **插图三法**：点「🖼 图片」选文件、直接把截图 **粘贴** 进输入框、或把图片 **拖进来**。图片会先上传到 `/uploads/`，正文里只留一条 `![图注](/uploads/xxx.png)`，所以文本始终很短。
- **支持语法**：标题、有序/无序列表（含二级缩进）、粗体、斜体、删除线、行内代码、代码块（带语言标记）、引用、表格、分割线、链接、图片。
- **安全**：渲染器**先整体 HTML 转义再解析语法**，所以任何原始 HTML 只会当文字显示；链接只放行 `http(s)://`、站内路径、`#anchor`、`mailto:`，`javascript:` / `data:` / `//外域` 一律不生成标签。
- **展示**：老师端作业卡片、学生端「班级作业」、编辑器右上角的作业要求浮层、批改弹窗，全部按 Markdown 渲染（图片按宽度自适应）。
- **上限**：正文 20000 字符（图片走链接不占正文），超限接口直接返回 400 而不是静默截断。

「去完成」的细节：

- 每个学生每份作业有一份自己的创作草稿（`assignment_works` 表），第一次点「去完成」时按作业类型新建（Scratch 复制官方起始工程，Python 预填老师写的起始代码），之后点「继续完成」打开同一份作品。
- 从作业入口打开的创作页，右上角浮层会显示这份作业的完整要求（标题 / 类型 / 截止 / 老师 / 要求正文 / 评语），可拖动、可收起，也能就地「提交作业」。
- **只有从作业入口进来才显示**：浮层同时校验 URL 的 `?assignment=` 与「这份作品确实是该学生在这份作业下的草稿」；新建作品、我的作品里继续编辑、手动拼接参数都不会出现，接口对越权请求返回 403。
- 未发布的草稿也能批改：老师可以打开本班作业里学生提交的作品（即使学生没点发布），只对该作业的任课老师与管理员放行。

### 三套独立后台

角色不同，登录后看到的入口和侧边栏都不同，共用一套后台骨架（`dash.js`），互不干扰：

| 后台 | 地址 | 侧边栏 |
|---|---|---|
| 管理员 | `/#/admin` | 总览 · 用户 · 班级 · 作业 · 素材 · 站点设置 · **系统状态** |
| 教师 | `/#/teacher` | 总览 · 布置作业 · 批改 · 我的班级 |
| 学生 | `/#/student` | 总览 · 我的作品 · 班级作业 · 我的成绩 · 设置 |

- **管理员总览**：用户/作品/素材/作业四组统计 + 未批改提醒。
- **管理员「系统状态」**：进程 RSS 与实际堆占用、数据库文件 / WAL / 上传目录 / sb3 体积、运行时长、Node 与平台版本，以及本版做了哪些性能优化——不需要登服务器就能看资源占用。
- **教师总览**：班级数、学生数、作业数、待批改、已批改、平均分，下面接最近提交列表，点进去直接批改。
- **学生总览**：作品数 / 已发布 / 获赞、作业数 / 已交 / 已批、平均分，以及最近作品与待办作业。
- 学生「我的成绩」把 `submissions` 记录整理成成绩单：作业名、分数、等级、老师评语、提交时间。
- 窄屏（≤860px）侧边栏变成横向可滚动的标签条，不占垂直空间。

### 管理
数据看板（用户 / 作品 / 素材 / 作业统计）、用户 CRUD（角色、班级、禁用、重置密码）、**素材库上传**（角色库 / 背景库 / 声音库，上传后直接出现在官方 Scratch 素材库里）、班级管理、站点设置（站名、标语、是否开放注册、是否允许学生装包、pip 镜像源）。

---

## 外观：跟随系统的深色 / 浅色

全站（含两个创作页、分享页、后台）默认 **跟随系统**：系统切到深色，页面立刻变深色；也可以手动锁定浅色或深色。

- **切换入口**：站点头部右侧的 🖥 / ☀️ / 🌙 按钮，点一下在「跟随系统 → 浅色 → 深色」之间轮换，选择记在 `localStorage.cc_theme`。
- **不闪白**：`<head>` 里有一段同步内联脚本，在样式表生效前就按 `localStorage` + `prefers-color-scheme` 写好 `data-theme`，所以深色下刷新不会先闪一下白屏。
- **实现**：只有一套 CSS 变量（`--bg / --surface / --text / --border / --hover / --brand-soft / --code-bg` …），`[data-theme='dark']` 覆盖同名变量，组件不写死颜色；`theme-color` 也随主题同步，手机地址栏颜色跟着变。
- **系统主题运行中变化**：`matchMedia('(prefers-color-scheme: dark)')` 监听 change 事件，处于「跟随系统」时自动重绘，不用刷新。

---

## 性能与资源占用

目标是一台 1 核 1G 的小机器也能带一个班。做法集中在**少查库、少传输、少写盘**三件事：

**数据库**

- 单文件 SQLite（`node:sqlite`），`WAL` + `synchronous=NORMAL` + `temp_store=MEMORY` + `mmap_size=128MB` + `cache_size=20MB`，读写不互相阻塞，事务不反复 fsync。
- **prepared statement 缓存**：`db.prepare()` 包了一层 Map 缓存（上限 400 条），同一 SQL 只编译一次——热点接口的 SQL 编译开销直接归零。
- **18 条覆盖索引**对齐四条主查询路径（列表、详情、计数、鉴权），点赞数/评论数用索引子查询实时算，不维护冗余计数列。
- **写放大治理**：浏览量在内存 Map 里累加，每 5 秒合并成一个事务落库；进程退出（SIGINT/SIGTERM）前 `flushViews()` 兜底，退出时再做一次 `wal_checkpoint(TRUNCATE)` 把 WAL 收回去。

**HTTP**

- **ETag + `If-None-Match`**：静态资源二次访问返回 `304`，body 长度为 0。
- **按 mtime 缓存的 gzip**：只压缩 >1KB 的文本资源，压缩结果缓存在内存（上限 12MB，文件改动自动失效）。`app.css` 从 51KB 压到约 10.7KB，`app.js`、各视图模块同理。
- **JSON 只在大响应时压缩**（>2KB），小接口不为省几十字节白跑一次 deflate。
- **路由分桶**：按「方法 + 二级路径」分桶，一个请求只跑同桶里的几条正则，不再遍历全表。
- **进程内缓存**：鉴权用户 10 秒、站点统计 20 秒、素材库 JSON 常驻内存（写操作主动失效），登录态校验不再每个请求查一次库。
- 长连接复用（`keepAliveTimeout`）、`requestTimeout` 与超时保护，避免慢连接拖住事件循环。

**前端**

- 原生 ES Module，**没有打包器、没有运行时框架**：浏览器直接加载模块，首屏只解析用到的部分。
- 视图按需加载（每个后台/页面一个模块），Markdown 渲染器 6KB 自研，不引第三方库。
- 图片 `loading="lazy"`，列表分页（默认 20/页），避免一次拉全表。

**实测（本机，127.0.0.1，20 并发）**

| 指标 | 数值 |
|---|---|
| 混合请求（首页 / CSS / JS / 接口） | 1600 请求全部成功，约 **1085 QPS**，平均 0.92ms |
| 进程内存（空载，含 Python 运行环境探测） | RSS ≈ **55MB**，堆已用 ≈ **7MB** |
| `app.css` 传输 | 51KB → gzip 10.7KB；再次访问 `304`、0 字节 |


---

## 技术栈

| 层 | 实现 |
|---|---|
| 服务端 | Node.js 原生 `http`，无任何 npm 依赖 |
| 数据库 | `node:sqlite`（内置单文件，WAL + 语句缓存 + 18 条索引），SQL 全部使用参数绑定 |
| 缓存 | 进程内 Map（用户 10s / 站点 20s / 素材库常驻）+ 浏览量内存累加、5 秒批量落库 |
| 鉴权 | scrypt 加盐口令 + HMAC-SHA256 签名 Token（7 天有效） |
| 前端 | 原生 ES Module 多页应用 + hash 路由，无构建步骤、无框架 |
| 外观 | CSS 变量 + `[data-theme]` 单属性切换，默认跟随 `prefers-color-scheme` |
| 富文本 | 自研 Markdown 渲染器（先转义后解析）+ 图片上传 |
| 图形化 | **Scratch 官方 `scratch-gui@5.3.0` 构建产物**（含官方 React 界面 + scratch-vm 5.0.300 / scratch-render 2.2.84 / scratch-blocks 1.3.0 / scratch-storage 4.1.27），本地 `public/vendor/scratch-gui`，不依赖外网 CDN |
| 代码编辑 | CodeMirror 5（本地） |
| Python | 子进程 + 项目内 venv，`runners/pyshim/turtle.py` 提供无 GUI 的 turtle 实现 |

---

## 官方 Scratch 编辑器说明

创作页 `/studio/scratch.html` 是一个 iframe 外壳，里面加载的就是 **官方 `scratch-gui` 的完整编辑器**，没有改造它的任何界面或交互。

- 形态：`public/vendor/scratch-gui/` 存放 npm 官方构建产物（`scratch-gui@5.3.0` 的 `dist/`，18MB 主包 + `static/` 素材 + `libraries/` 官方角色 / 背景 / 声音库 + `chunks/` 语言分块），加 `scratch-storage@4.1.27`（与 GUI 依赖完全同版本）和 React 16.14 UMD。全部本地文件，离线可用。
- 渲染方式：`ReactDOM.render(<AppStateHOC(GUI) vm={vm} />)` —— 与官方 playground 完全一致的挂载方式；VM 由 GUI 内部创建，我们只通过官方 `onVmInit` 拿到它的句柄。
- 保存：父页面顶栏「保存」通过 `postMessage` 通知 iframe，iframe 调官方 `vm.saveProjectSb3()` 得到标准 zip，再 `PUT /api/projects/:id/sb3`；同时用官方渲染器画布截图作为作品封面。
- 加载：`vm.loadProject(arrayBuffer)`；新建作品时服务端会预置一份起始工程（小猫 + 天空），所以新建后立刻就能拖积木。
- 中文界面：官方支持 `?locale=zh-cn` 参数，直接用这个官方开关固定简体中文。
- 界面清理：npm 上是**开发构建**，菜单栏会多一个 `Debug`（线上没有），已隐藏。进入编辑器时运动积木抽屉默认展开，与官方一致。
- **改了 `vendor/scratch-gui/host.js` 或 `host.html` 之后，记得同步改版本号**：`host.html` 里引用 `host.js?v=…`、`js/studio/scratch.js` 里的 `frame.src` 也带同一个 `v`。否则浏览器会继续用缓存里的旧宿主文件，改动静默失效（这两个文件已由服务端设为 `no-cache`，版本号是第二道保险）。
- 舞台尺寸只在窄屏（`<900px` 或高 `<470px`）由 `host.js` 的 `fitStage()` 接管，计算基准都封顶到视口；桌面完全交给官方 GUI。**不要**在 `apply()` 里自己派发 `resize` 事件 —— 它本身就是 resize 回调，会形成死循环把舞台越长越大。

### 素材库

官方编辑器的「选择一个角色 / 背景 / 声音」面板就是站内素材库，后台传的素材直接出现在里面：

- 管理后台 → 素材库：先选**角色 / 背景 / 声音**，再拖拽或点选上传。角色、背景支持 PNG / JPG / SVG，声音支持 WAV / MP3（单文件 ≤ 8MB，同类型重复文件会自动去重）。
- 上传后素材会出现在官方库的第一屏（排在官方素材之前），缩略图、搜索、拖进舞台/角色区、加进声音列表都走官方逻辑，随作品一起存进 `.sb3`；删除后台素材不影响已保存的作品。
- 内置素材（10 个角色 + 6 张背景，`src/seed-assets.js`）同样通过这条链路出现在官方库里，开箱即可用。
- 实现方式（没有改造官方界面）：
  - 官方构建把角色 / 背景 / 声音库的数据内联在 `scratch-gui.js` 里。`host.html` 在加载 GUI 前接管 `JSON.parse`，留住这几个库数组的引用，`host.js` 再把 `GET /api/scratch/library` 返回的站内条目合并进去 —— 官方库组件渲染时自然就读到了。
  - 官方库缩略图原先硬编码 `cdn.assets.scratch.mit.edu`。构建产物里那一处拼 URL 的代码已替换为 `window.__ccAssetURL(md5ext)`，统一返回 `/api/scratch/asset/<md5>.<ext>`：站内素材、官方素材走同一个接口，由服务端决定从哪取。
  - 素材本体通过 `scratch-storage` 的 helper 提供（`storage.addHelper`），按需 `fetch` 并 `createAsset`，官方的加载 / 保存逻辑不用改。
  - 因此有两个**升级注意事项**：替换 `public/vendor/scratch-gui/scratch-gui.js` 后需要重新打 `__ccAssetURL` 补丁（`grep -c "cdn.assets.scratch.mit.edu" 应为 1 处图标 URL`）；`libraries/` 下的官方 JSON 不需要改动。

### 官方素材镜像（339 个角色 / 全部背景与声音）

官方那 1328 个素材文件托管在 `cdn.assets.scratch.mit.edu`（Fastly），境内被 DNS 污染 + TLS SNI 阻断，浏览器直连一定失败。平台自己做了一层镜像：

- **抓取通道**（`src/scratch-mirror.js`）：用 DoH（doh.pub / 阿里 DoH）解析出真实 Fastly IP，再走 **80 端口明文 HTTP + `Host` 头**取回字节 —— 该通道在当前网络实测可用。同时并发尝试 HTTPS 与私有镜像，谁先返回用谁（境外部署时自动走 HTTPS）。
- **落盘缓存**：文件存 `data/scratch-assets/<md5>.<ext>`，命中直接返回（响应 <10ms）；未命中时服务端回源取一次并缓存，因此浏览到哪个素材就缓存哪个，不会白屏。
- **全量预下载**：`node scripts/fetch-scratch-assets.js`（约 3 分钟 / 40MB），支持 `--only sprites|backdrops|sounds`、`--retry N`，失败的写入 `_failed.txt` 可补跑。
- **后台一键同步**：管理后台 → 素材库 → 「官方素材镜像」条，显示已缓存数量 / 占用空间，点「同步官方素材」在服务端后台跑同一份逻辑，进度自动刷新。
- **私有镜像优先**：设置环境变量 `SCRATCH_ASSET_BASE=https://your-mirror/asset`（逗号分隔多个，文件名为 `<md5>.<ext>`）后优先走它，适合内网离线部署。
- 这样官方角色 / 背景 / 声音的缩略图、「选择一个角色 / 背景 / 声音」里的添加、保存进 `.sb3` 全部和官方一致，且**不依赖浏览器访问外网**。

### 已知边界

- 官方素材靠服务端镜像取回（见上）；首次访问某个还没缓存的官方素材会有 0.5–3s 延迟，跑一遍 `scripts/fetch-scratch-assets.js` 或后台点「同步官方素材」即可全本地化。
- 声音积木受浏览器自动播放策略限制，需先点一次页面才会出声。
- `Settings` 菜单显示英文，是官方 `scratch-l10n` 该条未翻译，非本平台改动。

---

## 目录结构

```
install.sh                 一键安装 / 更新 / 卸载（Linux、macOS、Windows Git Bash），缺依赖会询问后自动安装
install.ps1                同上，Windows PowerShell 版
scripts/setup.js           安装器实现（install / update / uninstall / start / stop / status / logs / passwd）
scripts/fetch-scratch-assets.js  批量同步官方素材到本地镜像
server.js                  HTTP 服务、路由分发、鉴权、静态资源、优雅退出
src/db.js                  建表 + 索引 + 迁移 + 演示数据（WAL 调优、prepared 语句缓存）
src/api.js                 全部 REST 接口
src/http-util.js           路由分桶、JSON/静态文件响应、ETag/304、gzip 缓存
src/cache.js               进程内缓存（用户/站点/素材库）+ 浏览量批量落库
src/auth.js                口令哈希 / Token 签发校验
src/python-runner.js       venv 管理、代码执行、pip 安装、产物收集
src/seed-assets.js         内置角色 / 背景 SVG 写入素材库
runners/pyshim/turtle.py   教学用 turtle → SVG 兼容层
public/                    前端（index.html 为 SPA 外壳）
  studio/scratch.html      创作页外壳（顶栏 + 官方编辑器 iframe）
  studio/python.html       代码创作页
  js/app.js                SPA 路由、站点头、主题按钮、角色入口
  js/theme.js              深/浅色：跟随系统 / 手动锁定，localStorage + matchMedia
  js/md.js                 自研 Markdown 渲染器（先转义再解析，链接白名单）
  js/md-editor.js          Markdown 编辑器：工具条 + 预览 + 图片上传（按钮/粘贴/拖拽）
  js/dash.js               后台骨架（三个后台共用：侧栏 + 标题 + 内容区）
  js/views/admin.js        管理员后台（7 个标签页，含系统状态）
  js/views/teacher.js      教师后台（总览 / 布置 / 批改 / 班级）
  js/views/me.js           学生后台（总览 / 作品 / 作业 / 成绩 / 设置）
  js/studio/scratch.js     外壳逻辑：登录校验、保存、发布、自动保存
  js/studio/assignment-brief.js  创作页的作业要求浮层（仅作业入口渲染）
  js/scratch/player.js     社区作品播放器（按需加载官方内核）
  js/scratch/engine.js     VM + 渲染器装配（播放器用）
  js/share.js              分享弹窗（生成/编辑链接、挑选分享页按键）
  js/views/share.js        分享页 #/s/<token>
  css/app.css              全站样式（语义化 CSS 变量 + 深色覆盖 + 响应式）
  vendor/scratch-gui/      官方 scratch-gui 构建产物 + host.html（编辑器宿主页，含窄屏视图切换）
  vendor/react/            React 16 UMD（官方 GUI 的外部依赖）
  vendor/scratch/          scratch-vm / scratch-render / scratch-storage（播放器用）
public/assets/library/     内置素材（SVG）
data/sb3/                  作品的官方 .sb3 工程文件
data/uploads/              用户上传的图片与声音（作业插图、素材库）
data/                      运行时数据（sqlite、上传文件、venv、临时运行目录）
```

---

## Python 运行说明

- 启动时自动检测解释器（`PYTHON_BIN` 环境变量优先，其次 `python` / `python3` / `py`），并创建 `data/pyenv` 虚拟环境；未检测到 Python 时站点其余功能正常，仅代码执行不可用。
- 依赖安装在共享 venv 中，**真实生效**，默认走清华镜像（管理后台可改）。
- 无 GUI 环境下 `tkinter` 不可用，因此内置 `turtle.py` 兼容层：记录路径并输出 `turtle_output.svg`，支持 `forward/right/left/goto/penup/pendown/pencolor/fill/begin_fill/end_fill/circle/dot/write/speed/done` 等常用 API。
- matplotlib 已预设 `MPLBACKEND=Agg`，`plt.savefig("x.png")` 生成的图片会自动回传前端展示。
- 执行超时 15s，输出截断 200KB，产物图片自动清理。

> ⚠️ **安全边界**：代码执行是**教学场景**的真实执行，不是容器级隔离。仅拦截了 `shutil.rmtree` 等明显破坏性调用，不构成沙箱。公网部署请把运行进程放进 Docker / 独立低权限用户，或用 gVisor 类方案隔离；`/api/python/run` 仅登录用户可用且有频率限制。

---

## 素材库（角色 / 背景 / 声音）

- 入口：管理后台 → 素材库 → 先选类型（🐱 角色 / 🖼 背景 / 🔊 声音）→ 拖拽或点选上传（角色、背景支持 PNG/JPG/SVG，声音支持 WAV/MP3，≤8MB，可多选；同类型同样的文件会自动去重）。
- 数据存 `assets` 表（`kind` = `sprite|backdrop|sound`，另存 md5、格式、宽高、时长、采样率），文件按 md5 落 `data/uploads/`。
- 上传后直接出现在官方 Scratch 编辑器的角色库 / 背景库 / 声音库第一屏，点选即加入作品，随 `.sb3` 保存；删除后台素材不影响已保存的作品。
- 内置素材由 `src/seed-assets.js` 生成，纯 SVG，可自由替换为自己的美术资源。

---

## 主要接口

```
POST /api/auth/login | register          GET/PATCH /api/auth/me
GET  /api/site                           # 站名、标语、统计（20s 内存缓存）
GET  /api/projects?type=&sort=&q=&mine=  POST /api/projects
GET/PATCH/DELETE /api/projects/:id       POST /api/projects/:id/like | view | comments
GET/POST /api/projects/:id/share         # 读取 / 生成作品的分享链接（作者、管理员）
PATCH/DELETE /api/shares/:id             # 修改分享页标题、留言、按键 / 停止分享
GET  /api/share/:token                   # 分享页数据（免登录，含 views 自增）
POST /api/share/:token/remix             # 一起改编：复制作品到当前账号
GET  /api/assets?kind=sprite|backdrop|sound   POST/PATCH/DELETE /api/assets[/:id]
POST /api/uploads/image                  # 作业插图 / 头像：dataURL → /uploads/xxx.png（教师、管理员）
GET  /api/scratch/library                # 站内素材，组装成官方库条目
GET  /api/scratch/asset/:md5ext          # 站内 + 官方素材字节（本地镜像优先，未命中回源）
GET  /api/scratch/mirror                 # 官方素材镜像缓存状态
POST /api/scratch/mirror/sync            # 后台触发官方素材全量同步
GET/POST /api/classes                    GET /api/classes/:id/students
GET/POST /api/assignments                # description 为 Markdown，≤20000 字符
PATCH/DELETE /api/assignments/:id        # 改要求 / 换图 / 改截止日期 / 删除
POST /api/assignments/:id/start          # 去完成：准备或复用作业草稿
GET  /api/assignments/:id/brief?project= # 编辑器里展示作业要求（仅作业入口）
POST /api/assignments/:id/submit
GET  /api/submissions                    PATCH /api/submissions/:id      # 打分
GET  /api/admin/stats | users | projects | settings
GET  /api/admin/system                   # 进程 RSS / 堆、DB / WAL / 上传体积、运行时长
GET  /api/teacher/overview               # 教师后台总览
GET  /api/student/overview               # 学生后台总览
POST /api/python/run                     GET/POST /api/python/packages   # 运行 / 装包
```

---

## 与原项目的差异

已实现：社区、双引擎创作、作业（Markdown 要求 + 插图）、班级、三类角色权限、**管理员 / 教师 / 学生三套独立后台**、素材库、后台配置、**跟随系统的深色模式**、全站性能优化。

未实现（原商业版能力）：CRM / 教务排课、题库与考试、赛事、文章 CMS、微信生态与支付、七牛云对象存储、ScratchJr / Blockly 独立引擎。

如需继续扩展，`src/api.js` 的路由表与 `public/js/views/*` 页面都按功能分块，新增一个模块通常只需「加一张表 + 一组路由 + 一个视图」；新增一个后台标签页只需往 `navItem()` 里加一项、在对应 `views/*.js` 里加一个 `case`。
