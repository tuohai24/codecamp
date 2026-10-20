#!/usr/bin/env bash
# CodeCamp 一键安装 / 更新 / 卸载（Linux / macOS / Windows Git Bash）
#
#   在项目目录里：   ./install.sh              # 安装并启动
#                    ./install.sh update       # 更新到最新版（自动备份数据）
#                    ./install.sh uninstall    # 卸载（保留数据）
#                    ./install.sh status
#
#   远程一键安装：   curl -fsSL https://raw.githubusercontent.com/tuohai24/codecamp/main/install.sh | bash
#   远程一键更新：   curl -fsSL https://raw.githubusercontent.com/tuohai24/codecamp/main/install.sh | bash -s -- update
#   指定端口等参数： 在上面的命令后加  -s -- --port 8080
#
#   缺少 Node.js 时会询问是否自动下载一份（只装在 ~/.codecamp/node，不动系统环境）：
#     ./install.sh --yes            # 无人值守，缺依赖直接装
#     ./install.sh --no-install     # 只检查不安装，缺依赖就报错退出
#   没有 git 时会自动改用源码压缩包下载，不强制安装 git。
set -euo pipefail

REPO_URL="${CODECAMP_REPO:-https://github.com/tuohai24/codecamp}"
REPO_BRANCH="${CODECAMP_BRANCH:-main}"
TARGET="${CODECAMP_DIR:-$HOME/codecamp}"

NODE_MIN_MAJOR=22
NODE_MIN_MINOR=5
# 自动安装的 Node 放在这里：不动系统的 node，卸载时删掉这个目录即可
NODE_HOME="${CODECAMP_NODE_HOME:-$HOME/.codecamp/node}"

ASSUME_YES=0
NO_INSTALL=0
if [ "${CODECAMP_AUTO_INSTALL:-0}" = "1" ]; then ASSUME_YES=1; fi

say() { printf '%s\n' "$*"; }

# ---------- 解析本脚本自己的参数，其余原样交给 scripts/setup.js ----------
PASS_ARGS=()
for arg in "$@"; do
  case "$arg" in
    -y | --yes | -Yes)
      ASSUME_YES=1
      PASS_ARGS+=("--yes")
      ;;
    --no-install | --no-deps)
      NO_INSTALL=1
      ;;
    -h | --help)
      # 打印脚本开头的注释作为帮助（从第 2 行起，遇到第一行非注释就停）
      awk 'NR > 1 { if (/^#/) { sub(/^# ?/, ""); print; next } else exit }' "$0" 2>/dev/null || true
      say ""
      say "交给 setup.js 的参数：--port N   --host H   --foreground   --purge   --no-start   --yes"
      exit 0
      ;;
    *) PASS_ARGS+=("$arg") ;;
  esac
done

# update 时不能在装依赖前就 git pull：要先停服务、备份数据库，再换代码。
# 这里只解析意图，真正的拉取交给 scripts/setup.js 的 update 命令。
WANTS_UPDATE=0
for a in ${PASS_ARGS[@]+"${PASS_ARGS[@]}"}; do
  [ "$a" = "update" ] && WANTS_UPDATE=1
done

# ---------- 通用小工具 ----------
# Windows 的 Git Bash 里 TMPDIR 常常是 "C:\Users\...\Temp"，
# 直接拼 "/xxx" 会得到混合路径，后面 rm 会被安全删除策略拒绝。
tmpdir() {
  local d="${TMPDIR:-/tmp}"
  case "$d" in
    [A-Za-z]:[\\/]*) d="$(cygpath -u "$d" 2>/dev/null || true)" ;;
  esac
  [ -n "$d" ] && [ -d "$d" ] || d=/tmp
  printf '%s' "$d"
}

download() { # download <url> <输出文件>
  if command -v curl >/dev/null 2>&1; then
    if [ -t 2 ]; then
      curl -fL --retry 3 --retry-delay 1 --connect-timeout 15 --progress-bar -o "$2" "$1"
    else
      curl -fsSL --retry 3 --retry-delay 1 --connect-timeout 15 -o "$2" "$1"
    fi
  elif command -v wget >/dev/null 2>&1; then
    wget -q --tries=3 --timeout=20 -O "$2" "$1"
  else
    return 127
  fi
}

can_download() {
  command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1
}

confirm() { # confirm "问题" -> 默认选是
  local ans=""
  if [ "$NO_INSTALL" = 1 ]; then return 1; fi
  if [ "$ASSUME_YES" = 1 ]; then
    say "  $1 自动继续（--yes）"
    return 0
  fi
  if [ -t 0 ]; then
    printf '  %s [Y/n] ' "$1"
    read -r ans || ans=""
  elif { exec 9<>/dev/tty; } 2>/dev/null; then
    # curl | bash 时 stdin 是脚本本身，改从终端读
    printf '  %s [Y/n] ' "$1" >&9
    read -r ans <&9 || ans=""
    exec 9>&-
  else
    say "  $1 非交互模式，自动继续（想跳过请加 --no-install）"
    return 0
  fi
  case "$ans" in
    '' | [Yy] | [Yy][Ee][Ss]) return 0 ;;
    *) return 1 ;;
  esac
}

version_ok() { # version_ok 22.22.2
  local v="${1:-}" major minor rest
  [ -n "$v" ] || return 1
  major="${v%%.*}"
  rest="${v#*.}"
  minor="${rest%%.*}"
  case "$major" in '' | *[!0-9]*) return 1 ;; esac
  case "$minor" in '' | *[!0-9]*) minor=0 ;; esac
  if [ "$major" -gt "$NODE_MIN_MAJOR" ]; then return 0; fi
  if [ "$major" -eq "$NODE_MIN_MAJOR" ] && [ "$minor" -ge "$NODE_MIN_MINOR" ]; then return 0; fi
  return 1
}

node_version_of() {
  [ -n "${1:-}" ] || return 0
  "$1" -p 'process.versions.node' 2>/dev/null || true
}

private_node_bin() {
  local p
  for p in "$NODE_HOME/bin/node" "$NODE_HOME/node.exe"; do
    if [ -x "$p" ]; then
      printf '%s' "$p"
      return 0
    fi
  done
  return 1
}

# ---------- 找到 / 补上项目代码 ----------
ROOT=""
SELF="${BASH_SOURCE[0]:-}"
if [ -n "$SELF" ] && [ -f "$SELF" ]; then
  ROOT="$(cd "$(dirname "$SELF")" && pwd)"
  [ -f "$ROOT/server.js" ] || ROOT=""
fi

# 从源码压缩包取代码（不需要 git）
fetch_tarball() {
  if ! can_download; then
    say ""
    say "没有 git / curl / wget，无法自动下载代码。"
    say "请手机或浏览器打开 $REPO_URL → Code → Download ZIP，解压后进入目录运行 ./install.sh"
    exit 1
  fi

  local slug url tmp src
  slug="${REPO_URL#https://github.com/}"
  slug="${slug%.git}"
  slug="${slug%/}"
  url="${CODECAMP_TARBALL:-https://codeload.github.com/$slug/tar.gz/refs/heads/$REPO_BRANCH}"

  tmp="$(mktemp -d "$(tmpdir)/cc-src.XXXXXX")"
  say "正在下载源码包 $url"
  if ! download "$url" "$tmp/src.tar.gz"; then
    rm -rf "$tmp"
    say "源码包下载失败，请检查网络后重试，或手动 clone 后运行 ./install.sh"
    exit 1
  fi

  mkdir -p "$(dirname "$TARGET")"
  tar -xzf "$tmp/src.tar.gz" -C "$tmp"
  src="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  if [ -z "$src" ] || [ ! -f "$src/server.js" ]; then
    rm -rf "$tmp"
    say "源码包解压后没有找到 server.js，请手动下载安装。"
    exit 1
  fi
  # git clone 中途失败留下的空壳目录先清掉
  if [ -d "$TARGET" ] && [ ! -f "$TARGET/server.js" ]; then
    case "$(ls -A "$TARGET" 2>/dev/null)" in
      '' | .git) rm -rf "$TARGET" ;;
    esac
  fi
  if [ -e "$TARGET" ]; then
    rm -rf "$tmp"
    say "目录 $TARGET 已存在且不是 CodeCamp，请用 CODECAMP_DIR=/其它路径 指定安装位置。"
    exit 1
  fi
  mv "$src" "$TARGET"
  rm -rf "$tmp"
  ROOT="$TARGET"
  say "已解压到 $ROOT"
}

if [ -z "$ROOT" ]; then
  # 更新：只要目标目录里已经是一份完整安装，就交给 update 流程，
  # 不管它有没有 .git（压缩包安装也需要能一键更新）
  if [ "$WANTS_UPDATE" = 1 ] && [ -f "$TARGET/server.js" ]; then
    say "检测到已有安装目录 $TARGET，交给更新流程（会先备份数据库）…"
    ROOT="$TARGET"
  elif [ -d "$TARGET/.git" ]; then
    if command -v git >/dev/null 2>&1; then
      say "检测到已有安装目录 $TARGET，先拉取最新代码…"
      git -C "$TARGET" pull --ff-only || true
    else
      say "检测到已有安装目录 $TARGET（没有 git，跳过代码拉取）"
    fi
    ROOT="$TARGET"
  elif command -v git >/dev/null 2>&1; then
    say "正在下载 CodeCamp 到 $TARGET …"
    if git clone --depth 1 "$REPO_URL" "$TARGET"; then
      ROOT="$TARGET"
    else
      say "  git clone 没有成功，改用源码压缩包（无需 git）…"
      fetch_tarball
    fi
  else
    say "没有检测到 git，改用源码压缩包下载（无需 git）…"
    fetch_tarball
  fi
fi

if [ ! -f "$ROOT/server.js" ]; then
  say "安装目录不完整（缺少 server.js）：$ROOT"
  exit 1
fi

# ---------- 检查 / 安装 Node.js ----------
DIST_OS=""
DIST_ARCH=""

detect_platform() {
  local os arch
  os="$(uname -s 2>/dev/null || echo unknown)"
  arch="$(uname -m 2>/dev/null || echo unknown)"
  case "$os" in
    Linux*) DIST_OS=linux ;;
    Darwin*) DIST_OS=darwin ;;
    MINGW* | MSYS* | CYGWIN*) DIST_OS=win ;;
    *) DIST_OS="" ;;
  esac
  case "$arch" in
    x86_64 | amd64 | x64) DIST_ARCH=x64 ;;
    aarch64 | arm64) DIST_ARCH=arm64 ;;
    armv7l | armv7) DIST_ARCH=armv7l ;;
    *) DIST_ARCH="" ;;
  esac
  [ -n "$DIST_OS" ] && [ -n "$DIST_ARCH" ]
}

latest_node_version() {
  local tmp url ver
  tmp="$(mktemp "$(tmpdir)/cc-nodeidx.XXXXXX")" || return 1
  # 官方源优先，国内镜像兜底
  for url in "https://nodejs.org/dist/index.json" "https://npmmirror.com/mirrors/node/index.json"; do
    if download "$url" "$tmp" 2>/dev/null; then
      ver="$(grep -o '"version":"v22\.[0-9][0-9.]*"' "$tmp" | head -n 1 | sed 's/.*"v\(.*\)"/\1/' || true)"
      if [ -n "$ver" ]; then
        rm -f "$tmp"
        printf '%s' "$ver"
        return 0
      fi
    fi
  done
  # 兜底：从校验文件里挑版本号
  for url in "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt" "https://npmmirror.com/mirrors/node/latest-v22.x/SHASUMS256.txt"; do
    if download "$url" "$tmp" 2>/dev/null; then
      ver="$(grep -o 'node-v22\.[0-9][0-9.]*' "$tmp" | head -n 1 | sed 's/node-v//' || true)"
      if [ -n "$ver" ]; then
        rm -f "$tmp"
        printf '%s' "$ver"
        return 0
      fi
    fi
  done
  rm -f "$tmp"
  return 1
}

node_home_replaceable() {
  if [ ! -d "$NODE_HOME" ]; then return 0; fi
  if [ -z "$(ls -A "$NODE_HOME" 2>/dev/null)" ]; then return 0; fi
  if [ -f "$NODE_HOME/bin/node" ] || [ -f "$NODE_HOME/node.exe" ]; then return 0; fi
  return 1
}

install_node() {
  say ""
  say "准备下载 Node.js ${NODE_MIN_MAJOR}.x（只放到 $NODE_HOME，不影响系统里已有的 Node）"

  if ! can_download; then
    say "  没有 curl / wget，无法自动下载。请手动安装：https://nodejs.org/zh-cn/download"
    return 1
  fi
  if ! detect_platform; then
    say "  无法识别当前系统（$(uname -s 2>/dev/null)/$(uname -m 2>/dev/null)），请手动安装 Node.js。"
    return 1
  fi

  local ver file tmp url okdl src
  if ! ver="$(latest_node_version)"; then
    say "  取不到 Node.js 版本列表（可能是网络受限），请手动安装：https://nodejs.org/zh-cn/download"
    return 1
  fi
  file="node-v${ver}-${DIST_OS}-${DIST_ARCH}"
  case "$DIST_OS" in
    win) file="${file}.zip" ;;
    *) file="${file}.tar.gz" ;;
  esac
  say "  版本 v${ver}（${DIST_OS}-${DIST_ARCH}）"

  tmp="$(mktemp -d "$(tmpdir)/cc-node.XXXXXX")" || return 1
  okdl=""
  for url in "https://nodejs.org/dist/v${ver}/${file}" "https://npmmirror.com/mirrors/node/v${ver}/${file}"; do
    if download "$url" "$tmp/$file"; then
      okdl=1
      break
    fi
    say "  下载失败，换下一个源…"
  done
  if [ -z "$okdl" ]; then
    say "  下载 $file 失败，请手动安装 Node.js 后重试。"
    rm -rf "$tmp"
    return 1
  fi

  if [ "$DIST_OS" = win ]; then
    if command -v unzip >/dev/null 2>&1; then
      unzip -q -o "$tmp/$file" -d "$tmp" || {
        rm -rf "$tmp"
        say "  解压失败"
        return 1
      }
    elif command -v powershell.exe >/dev/null 2>&1; then
      local wfile wdest
      wfile="$(cygpath -w "$tmp/$file" 2>/dev/null || printf '%s' "$tmp/$file")"
      wdest="$(cygpath -w "$tmp" 2>/dev/null || printf '%s' "$tmp")"
      powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \
        "Expand-Archive -LiteralPath \"$wfile\" -DestinationPath \"$wdest\" -Force" || {
        rm -rf "$tmp"
        say "  解压失败"
        return 1
      }
    else
      rm -rf "$tmp"
      say "  需要 unzip 或 PowerShell 才能解压 zip，请手动安装 Node.js。"
      return 1
    fi
  else
    tar -xzf "$tmp/$file" -C "$tmp" || {
      rm -rf "$tmp"
      say "  解压失败"
      return 1
    }
  fi

  src="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  if [ -z "$src" ]; then
    rm -rf "$tmp"
    say "  解压后没有找到 Node 目录"
    return 1
  fi
  if ! node_home_replaceable; then
    rm -rf "$tmp"
    say "  $NODE_HOME 里像是别的东西，为安全起见不覆盖，请换个目录：CODECAMP_NODE_HOME=/新路径"
    return 1
  fi
  rm -rf "$NODE_HOME"
  mkdir -p "$NODE_HOME"
  cp -R "$src"/. "$NODE_HOME"/
  chmod +x "$NODE_HOME/bin/node" 2>/dev/null || true
  rm -rf "$tmp"

  local bin v
  bin="$(private_node_bin || true)"
  v="$(node_version_of "$bin")"
  if ! version_ok "$v"; then
    say "  安装后自检没通过（检测到 v${v:-未知}），请手动安装 Node.js。"
    return 1
  fi
  say "  [ok] Node.js v$v 已就绪：$bin"
  say "  以后想在任意终端直接敲 node，可把它加进 PATH："
  if [ "$DIST_OS" = win ]; then
    local whome
    whome="$(cygpath -w "$NODE_HOME" 2>/dev/null || printf '%s' "$NODE_HOME")"
    say "      setx PATH \"$whome;%PATH%\""
  else
    say "      echo 'export PATH=\"$NODE_HOME/bin:\$PATH\"' >> ~/.bashrc"
  fi
  return 0
}

NODE_BIN=""
OLD_NODE_VER=""

resolve_node() {
  local cand v
  if cand="$(command -v node 2>/dev/null)"; then
    v="$(node_version_of "$cand")"
    if version_ok "$v"; then
      NODE_BIN="$cand"
      return 0
    fi
    OLD_NODE_VER="${v:-未知版本}"
  fi
  if cand="$(private_node_bin)"; then
    v="$(node_version_of "$cand")"
    if version_ok "$v"; then
      NODE_BIN="$cand"
      return 0
    fi
    OLD_NODE_VER="${v:-未知版本}"
  fi
  return 1
}

ensure_node() {
  if resolve_node; then
    say "  Node.js v$(node_version_of "$NODE_BIN")（$NODE_BIN）"
    return 0
  fi

  say ""
  if [ -n "$OLD_NODE_VER" ]; then
    say "检测到 Node.js v${OLD_NODE_VER}，CodeCamp 需要 ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR} 或更高。"
  else
    say "没有检测到 Node.js，CodeCamp 需要 ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR} 或更高（用内置 node:sqlite）。"
  fi

  if [ "$NO_INSTALL" = 1 ]; then
    say ""
    say "已按 --no-install 跳过自动安装。手动安装方式："
    say "  - 官方安装包：https://nodejs.org/zh-cn/download"
    say "  - macOS / Linux：brew install node@22  或  nvm install 22"
    exit 1
  fi

  if ! confirm "现在自动下载安装一份 Node.js？（只装在 $NODE_HOME，不动系统已有版本）"; then
    say ""
    say "已取消。手动装好后重新运行 ./install.sh 即可：https://nodejs.org/zh-cn/download"
    exit 1
  fi

  if ! install_node; then
    say ""
    say "自动安装没有成功。可以手动安装 Node.js 22 后重试：https://nodejs.org/zh-cn/download"
    exit 1
  fi

  NODE_BIN="$(private_node_bin)"
  export PATH="$(dirname "$NODE_BIN"):$PATH"
  say "  后续命令将使用 $NODE_BIN"
}

say "CodeCamp 运行环境检查"
say "----------------------------------------"
ensure_node

# 不带命令时默认 install（只给了 --port 8080 之类的参数也一样）
HAS_CMD=0
for a in ${PASS_ARGS[@]+"${PASS_ARGS[@]}"}; do
  case "$a" in
    install | update | uninstall | start | stop | restart | status | logs | passwd | help)
      HAS_CMD=1
      break
      ;;
  esac
done
if [ "$HAS_CMD" = 0 ]; then
  PASS_ARGS=("install" ${PASS_ARGS[@]+"${PASS_ARGS[@]}"})
fi

# 老版本安装自带的 setup.js 可能还不支持「压缩包更新」之类的逻辑，
# 更新前先把它换成远端最新的一份，避免「自己更不动自己」。
refresh_setup_js() {
  local slug raw tmp
  [ "$WANTS_UPDATE" = 1 ] || return 0
  # git 安装能靠 pull 自更新，不需要替换（替换反而会让 pull 报本地改动冲突）
  [ -d "$ROOT/.git" ] && return 0
  [ -f "$ROOT/scripts/setup.js" ] || return 0
  can_download || return 0
  slug="${REPO_URL#https://github.com/}"
  slug="${slug%.git}"
  slug="${slug%/}"
  tmp="$(mktemp "$(tmpdir)/cc-setup.XXXXXX")" || return 0
  for raw in \
    "https://raw.githubusercontent.com/$slug/$REPO_BRANCH/scripts/setup.js" \
    "https://fastly.jsdelivr.net/gh/$slug@$REPO_BRANCH/scripts/setup.js" \
    "https://cdn.jsdelivr.net/gh/$slug@$REPO_BRANCH/scripts/setup.js"; do
    if download "$raw" "$tmp" 2>/dev/null && grep -q "function cmdUpdate" "$tmp"; then
      if cmp -s "$tmp" "$ROOT/scripts/setup.js"; then
        rm -f "$tmp"
        return 0
      fi
      if mv -f "$tmp" "$ROOT/scripts/setup.js" 2>/dev/null; then
        say "更新脚本已刷新到远端最新版本"
        return 0
      fi
    fi
  done

  # 镜像拿不到单文件（大仓库会被 jsDelivr 拒绝）就下源码包，只取 scripts/setup.js
  local tmpd pkg url
  tmpd="$(mktemp -d "$(tmpdir)/cc-setupzip.XXXXXX")" || { rm -f "$tmp"; return 0; }
  url="${CODECAMP_TARBALL:-https://codeload.github.com/$slug/tar.gz/refs/heads/$REPO_BRANCH}"
  if download "$url" "$tmpd/src.tar.gz" 2>/dev/null && tar -xzf "$tmpd/src.tar.gz" -C "$tmpd" 2>/dev/null; then
    pkg="$(find "$tmpd" -mindepth 3 -maxdepth 3 -path '*/scripts/setup.js' | head -n 1)"
    if [ -n "$pkg" ] && grep -q "function cmdUpdate" "$pkg"; then
      if ! cmp -s "$pkg" "$ROOT/scripts/setup.js"; then
        cp -f "$pkg" "$ROOT/scripts/setup.js" && say "更新脚本已从源码包刷新到最新版本"
      fi
    fi
  fi
  rm -rf "$tmpd"
  rm -f "$tmp"
  return 0
}

say "安装目录：$ROOT"
refresh_setup_js
exec "$NODE_BIN" "$ROOT/scripts/setup.js" ${PASS_ARGS[@]+"${PASS_ARGS[@]}"}
