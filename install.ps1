# CodeCamp 一键安装 / 更新 / 卸载（Windows PowerShell）
#
#   在项目目录里：
#     .\install.ps1                安装并启动
#     .\install.ps1 update         更新
#     .\install.ps1 uninstall      卸载（保留数据）
#     .\install.ps1 status
#
#   如果 PowerShell 拦截脚本执行，先运行：
#     Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

$ErrorActionPreference = 'Stop'

# 让 Node 的 UTF-8 输出在管道里也能正确显示
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$repo = if ($env:CODECAMP_REPO) { $env:CODECAMP_REPO } else { '__REPO_URL__' }
$target = if ($env:CODECAMP_DIR) { $env:CODECAMP_DIR } else { Join-Path $HOME 'codecamp' }

$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

if (-not (Test-Path (Join-Path $root 'server.js'))) {
  $git = Get-Command git -ErrorAction SilentlyContinue
  if (-not $git) {
    Write-Host '需要先安装 git，或手动下载仓库压缩包后解压，再在解压目录里运行本脚本。' -ForegroundColor Red
    exit 1
  }
  if (Test-Path (Join-Path $target '.git')) {
    Write-Host "检测到已有安装目录 $target，先拉取最新代码…"
    & git -C $target pull --ff-only
  } else {
    Write-Host "正在下载 CodeCamp 到 $target …"
    & git clone --depth 1 $repo $target
  }
  $root = $target
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Host ''
  Write-Host '没有找到 Node.js。CodeCamp 需要 Node.js 22.5 或更高版本。' -ForegroundColor Red
  Write-Host '  官方下载：https://nodejs.org/zh-cn/download'
  Write-Host '  或：winget install OpenJS.NodeJS.LTS'
  exit 1
}

$ver = (& node -p 'process.versions.node') -as [string]
$parts = $ver.Split('.')
if ([int]$parts[0] -lt 22 -or ([int]$parts[0] -eq 22 -and [int]$parts[1] -lt 5)) {
  Write-Host "Node.js 版本过低（当前 v$ver），需要 22.5 以上。" -ForegroundColor Red
  exit 1
}

& node (Join-Path $root 'scripts\setup.js') @args
exit $LASTEXITCODE
