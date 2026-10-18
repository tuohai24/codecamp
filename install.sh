#!/usr/bin/env bash
# CodeCamp 一键安装 / 更新 / 卸载（Linux / macOS / Windows Git Bash）
#
#   在项目目录里：   ./install.sh              # 安装并启动
#                    ./install.sh update       # 更新
#                    ./install.sh uninstall    # 卸载（保留数据）
#                    ./install.sh status
#
#   远程一键安装：   curl -fsSL <仓库地址>/raw/main/install.sh | bash
#                    curl -fsSL <仓库地址>/raw/main/install.sh | bash -s -- --port 8080
set -euo pipefail

REPO_URL="${CODECAMP_REPO:-https://github.com/tuohai24/codecamp}"
TARGET="${CODECAMP_DIR:-$HOME/codecamp}"

# ---------- 找到项目目录 ----------
SELF="${BASH_SOURCE[0]:-}"
ROOT=""
if [ -n "$SELF" ] && [ -f "$SELF" ]; then
  ROOT="$(cd "$(dirname "$SELF")" && pwd)"
fi

if [ -z "$ROOT" ] || [ ! -f "$ROOT/server.js" ]; then
  # 通过 curl | bash 运行，本地没有代码：先取一份下来
  if ! command -v git >/dev/null 2>&1; then
    echo "需要先安装 git，或者手动下载仓库后运行 ./install.sh" >&2
    exit 1
  fi
  if [ -d "$TARGET/.git" ]; then
    echo "检测到已有安装目录 $TARGET，先拉取最新代码…"
    git -C "$TARGET" pull --ff-only || true
  else
    echo "正在下载 CodeCamp 到 $TARGET …"
    git clone --depth 1 "$REPO_URL" "$TARGET"
  fi
  ROOT="$TARGET"
fi

# ---------- 检查 Node ----------
if ! command -v node >/dev/null 2>&1; then
  echo "" >&2
  echo "没有找到 Node.js。CodeCamp 需要 Node.js 22.5 或更高版本。" >&2
  echo "  - 官方安装包：https://nodejs.org/zh-cn/download" >&2
  echo "  - 或使用版本管理工具：nvm install 22 / fnm install 22" >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 5 ]; }; then
  echo "Node.js 版本过低（当前 $(node -v)），需要 22.5 以上。" >&2
  exit 1
fi

exec node "$ROOT/scripts/setup.js" "$@"
