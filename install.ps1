# CodeCamp 一键安装 / 更新 / 卸载（Windows PowerShell）
#
#   在项目目录里：
#     .\install.ps1                安装并启动
#     .\install.ps1 update         更新到最新版（自动备份数据）
#     .\install.ps1 uninstall      卸载（保留数据）
#     .\install.ps1 status
#
#   远程一键安装（PowerShell，一条命令）：
#     irm https://raw.githubusercontent.com/tuohai24/codecamp/main/install.ps1 | iex
#   远程一键更新：
#     & ([scriptblock]::Create((irm https://raw.githubusercontent.com/tuohai24/codecamp/main/install.ps1))) update
#
#   缺少 Node.js 时会询问是否自动下载一份（只装在 %USERPROFILE%\.codecamp\node，不动系统环境）：
#     .\install.ps1 --yes           无人值守，缺依赖直接装
#     .\install.ps1 --no-install    只检查不安装，缺依赖就报错退出
#   没有 git 时会自动改用源码压缩包下载，不强制安装 git。
#
#   如果 PowerShell 拦截脚本执行，先运行：
#     Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

$ErrorActionPreference = 'Stop'

# 让 Node 的 UTF-8 输出在管道里也能正确显示
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$repo = if ($env:CODECAMP_REPO) { $env:CODECAMP_REPO } else { 'https://github.com/tuohai24/codecamp' }
$branch = if ($env:CODECAMP_BRANCH) { $env:CODECAMP_BRANCH } else { 'main' }
$target = if ($env:CODECAMP_DIR) { $env:CODECAMP_DIR } else { Join-Path $HOME 'codecamp' }
$nodeHome = if ($env:CODECAMP_NODE_HOME) { $env:CODECAMP_NODE_HOME } else { Join-Path $HOME '.codecamp\node' }
$minMajor = 22
$minMinor = 5

$autoYes = $false
$noInstall = $false
$oldVer = ''
if ($env:CODECAMP_AUTO_INSTALL -eq '1') { $autoYes = $true }

# ---------- 解析本脚本自己的参数，其余原样交给 scripts/setup.js ----------
$passArgs = @()
foreach ($raw in $args) {
  $a = [string]$raw
  if ($a -match '^(-y|--yes|-Yes)$') {
    $autoYes = $true
    $passArgs += '--yes'
  } elseif ($a -match '^(--no-install|--no-deps)$') {
    $noInstall = $true
  } elseif ($a -match '^(-h|--help|-\?)$') {
    Write-Host '用法：.\install.ps1 [命令] [选项]'
    Write-Host '  命令：install（默认）| update | uninstall | start | stop | restart | status | logs | passwd'
    Write-Host '  本脚本选项：--yes 缺依赖自动安装；--no-install 只检查不安装'
    Write-Host '  其它选项原样传给 setup.js：--port N  --host H  --foreground  --purge  --no-start'
    exit 0
  } else {
    $passArgs += $a
  }
}

# update 时要先停服务、备份数据库再换代码，不能在这里提前 pull
$wantsUpdate = $passArgs -contains 'update'

# ---------- 小工具 ----------
function Test-VersionOk([string]$ver) {
  if ([string]::IsNullOrWhiteSpace($ver)) { return $false }
  $p = $ver.Split('.')
  $maj = 0
  $min = 0
  if (-not [int]::TryParse($p[0], [ref]$maj)) { return $false }
  if ($p.Length -gt 1) { [void][int]::TryParse($p[1], [ref]$min) }
  if ($maj -gt $minMajor) { return $true }
  if ($maj -eq $minMajor -and $min -ge $minMinor) { return $true }
  return $false
}

function Resolve-Node {
  $cands = @()
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { $cands += $cmd.Source }
  $priv = Join-Path $nodeHome 'node.exe'
  if (Test-Path $priv) { $cands += $priv }
  foreach ($c in $cands) {
    $v = ''
    try { $v = ((& $c -p 'process.versions.node') -as [string]) } catch { $v = '' }
    $v = "$v".Trim()
    if (Test-VersionOk $v) { return [pscustomobject]@{ Exe = $c; Version = $v } }
    if ($v) { $script:oldVer = $v }
  }
  return $null
}

function Get-Remote([string]$url, [string]$out) {
  try {
    Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -TimeoutSec 90
    return $true
  } catch {
    return $false
  }
}

function Confirm-Action([string]$question) {
  if ($noInstall) { return $false }
  if ($autoYes) {
    Write-Host "  $question 自动继续（--yes）"
    return $true
  }
  $ans = ''
  try {
    $ans = Read-Host "  $question [Y/n]"
  } catch {
    Write-Host "  $question 非交互模式，自动继续"
    return $true
  }
  if ([string]::IsNullOrWhiteSpace($ans)) { return $true }
  return ($ans -match '^(y|yes)$')
}

function Get-NodeDistVersion {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('cc-idx-' + [guid]::NewGuid().ToString('N') + '.json')
  foreach ($url in @('https://nodejs.org/dist/index.json', 'https://npmmirror.com/mirrors/node/index.json')) {
    if (Get-Remote $url $tmp) {
      $txt = Get-Content -LiteralPath $tmp -Raw
      $m = [regex]::Match($txt, '"version":"(v22\.[0-9][0-9.]*)"')
      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
      if ($m.Success) { return $m.Groups[1].Value }
    }
  }
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  return $null
}

function Install-Node {
  Write-Host ''
  Write-Host "准备下载 Node.js 22.x（只放到 $nodeHome，不影响系统里已有的 Node）"
  $ver = Get-NodeDistVersion
  if (-not $ver) {
    Write-Host '  取不到 Node.js 版本列表（可能是网络受限），请手动安装：https://nodejs.org/zh-cn/download' -ForegroundColor Yellow
    return $false
  }
  $arch = 'x64'
  if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { $arch = 'arm64' }
  $file = "node-$ver-win-$arch.zip"
  Write-Host "  版本 $ver（win-$arch）"

  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('cc-node-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null
  $zip = Join-Path $tmp $file
  $okDownload = $false
  foreach ($url in @("https://nodejs.org/dist/$ver/$file", "https://npmmirror.com/mirrors/node/$ver/$file")) {
    if (Get-Remote $url $zip) { $okDownload = $true; break }
    Write-Host '  下载失败，换下一个源…' -ForegroundColor Yellow
  }
  if (-not $okDownload) {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  下载 $file 失败，请手动安装 Node.js 后重试。" -ForegroundColor Yellow
    return $false
  }

  try {
    Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
  } catch {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host '  解压失败，请手动安装 Node.js。' -ForegroundColor Yellow
    return $false
  }
  $src = Get-ChildItem -LiteralPath $tmp -Directory | Select-Object -First 1
  if (-not $src -or -not (Test-Path (Join-Path $src.FullName 'node.exe'))) {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host '  解压后没有找到 node.exe，请手动安装 Node.js。' -ForegroundColor Yellow
    return $false
  }

  if (Test-Path $nodeHome) {
    $items = @(Get-ChildItem -LiteralPath $nodeHome -Force -ErrorAction SilentlyContinue)
    if ($items.Count -gt 0 -and -not (Test-Path (Join-Path $nodeHome 'node.exe'))) {
      Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
      Write-Host "  $nodeHome 里像是别的东西，为安全起见不覆盖，请换个目录：`$env:CODECAMP_NODE_HOME" -ForegroundColor Yellow
      return $false
    }
    Remove-Item -LiteralPath $nodeHome -Recurse -Force
  }
  New-Item -ItemType Directory -Path $nodeHome -Force | Out-Null
  Copy-Item -Path (Join-Path $src.FullName '*') -Destination $nodeHome -Recurse -Force
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue

  $exe = Join-Path $nodeHome 'node.exe'
  $v = ''
  try { $v = ((& $exe -p 'process.versions.node') -as [string]) } catch { $v = '' }
  $v = "$v".Trim()
  if (-not (Test-VersionOk $v)) {
    Write-Host "  安装后自检没通过（$v），请手动安装 Node.js。" -ForegroundColor Yellow
    return $false
  }
  Write-Host "  [ok] Node.js v$v 已就绪：$exe" -ForegroundColor Green
  Write-Host '  以后想在任意终端直接敲 node，可执行：'
  Write-Host "      setx PATH `"$nodeHome;%PATH%`""
  return $true
}

function Get-SourceZip {
  $slug = $repo -replace '^https://github\.com/', '' -replace '\.git$', '' -replace '/$', ''
  $url = if ($env:CODECAMP_ZIP) { $env:CODECAMP_ZIP } else { "https://codeload.github.com/$slug/zip/refs/heads/$branch" }
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('cc-src-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null
  $zip = Join-Path $tmp 'src.zip'
  Write-Host "正在下载源码包 $url"
  if (-not (Get-Remote $url $zip)) {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host '源码包下载失败，请检查网络后重试，或手动 git clone 后运行本脚本。' -ForegroundColor Red
    exit 1
  }
  Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
  $src = Get-ChildItem -LiteralPath $tmp -Directory | Select-Object -First 1
  if (-not $src -or -not (Test-Path (Join-Path $src.FullName 'server.js'))) {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host '源码包解压后没有找到 server.js，请手动下载安装。' -ForegroundColor Red
    exit 1
  }
  if (Test-Path $target) {
    $items = @(Get-ChildItem -LiteralPath $target -Force -ErrorAction SilentlyContinue)
    $looksBroken = ($items.Count -eq 0) -or ($items.Count -eq 1 -and (Test-Path (Join-Path $target '.git')))
    if ($looksBroken) { Remove-Item -LiteralPath $target -Recurse -Force }
  }
  if (Test-Path $target) {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "目录 $target 已存在且不是 CodeCamp，请用 `$env:CODECAMP_DIR 指定安装位置。" -ForegroundColor Red
    exit 1
  }
  $parent = Split-Path $target -Parent
  if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  Move-Item -LiteralPath $src.FullName -Destination $target
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "已解压到 $target"
  return $target
}

# ---------- 找到 / 补上项目代码 ----------
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

if (-not (Test-Path (Join-Path $root 'server.js'))) {
  $git = Get-Command git -ErrorAction SilentlyContinue
  # 更新：目标目录已有完整安装就交给 update 流程，不管有没有 .git
  if ($wantsUpdate -and (Test-Path (Join-Path $target 'server.js'))) {
    Write-Host "检测到已有安装目录 $target，交给更新流程（会先备份数据库）…"
    $root = $target
  } elseif (Test-Path (Join-Path $target '.git')) {
    if ($git) {
      Write-Host "检测到已有安装目录 $target，先拉取最新代码…"
      & git -C $target pull --ff-only
    } else {
      Write-Host "检测到已有安装目录 $target（没有 git，跳过代码拉取）"
    }
    $root = $target
  } elseif ($git) {
    Write-Host "正在下载 CodeCamp 到 $target …"
    & git clone --depth 1 $repo $target
    if ($LASTEXITCODE -ne 0) {
      Write-Host '  git clone 没有成功，改用源码压缩包（无需 git）…' -ForegroundColor Yellow
      $root = Get-SourceZip
    } else {
      $root = $target
    }
  } else {
    Write-Host '没有检测到 git，改用源码压缩包下载（无需 git）…'
    $root = Get-SourceZip
  }
}

if (-not (Test-Path (Join-Path $root 'server.js'))) {
  Write-Host "安装目录不完整（缺少 server.js）：$root" -ForegroundColor Red
  exit 1
}

# ---------- 检查 / 安装 Node.js ----------
Write-Host 'CodeCamp 运行环境检查'
Write-Host '----------------------------------------'

$node = Resolve-Node
if (-not $node) {
  Write-Host ''
  if ($oldVer) {
    Write-Host "检测到 Node.js v$oldVer，CodeCamp 需要 $minMajor.$minMinor 或更高。" -ForegroundColor Yellow
  } else {
    Write-Host "没有检测到 Node.js，CodeCamp 需要 $minMajor.$minMinor 或更高（使用内置 node:sqlite）。" -ForegroundColor Yellow
  }

  if ($noInstall) {
    Write-Host ''
    Write-Host '已按 --no-install 跳过自动安装。手动安装方式：'
    Write-Host '  - 官方安装包：https://nodejs.org/zh-cn/download'
    Write-Host '  - 或用 winget：winget install OpenJS.NodeJS.LTS'
    exit 1
  }

  if (-not (Confirm-Action "现在自动下载安装一份 Node.js？（只装在 $nodeHome，不动系统已有版本）")) {
    Write-Host ''
    Write-Host '已取消。手动装好后重新运行 .\install.ps1 即可：https://nodejs.org/zh-cn/download'
    exit 1
  }

  if (-not (Install-Node)) {
    Write-Host ''
    Write-Host '自动安装没有成功。可以手动安装 Node.js 22 后重试：https://nodejs.org/zh-cn/download' -ForegroundColor Red
    exit 1
  }

  $node = Resolve-Node
  if (-not $node) {
    Write-Host '安装后仍然找不到可用的 Node.js，请手动安装。' -ForegroundColor Red
    exit 1
  }
}

Write-Host "  Node.js v$($node.Version)（$($node.Exe)）"

# 不带命令时默认 install（只给了 --port 8080 之类的参数也一样）
$knownCommands = @('install', 'update', 'uninstall', 'start', 'stop', 'restart', 'status', 'logs', 'passwd', 'help')
$hasCmd = $false
foreach ($a in $passArgs) {
  if ($knownCommands -contains $a) { $hasCmd = $true; break }
}
if (-not $hasCmd) { $passArgs = @('install') + $passArgs }

Write-Host "安装目录：$root"

# 老版本安装自带的 setup.js 可能不支持压缩包更新，更新前先刷新成远端最新版
if ($wantsUpdate -and -not (Test-Path (Join-Path $root '.git')) -and (Test-Path (Join-Path $root 'scripts\setup.js'))) {
  $slug = $repo -replace '^https://github\.com/', '' -replace '\.git$', '' -replace '/$', ''
  $tmpSetup = Join-Path ([IO.Path]::GetTempPath()) ('cc-setup-' + [guid]::NewGuid().ToString('N') + '.js')
  foreach ($raw in @(
      "https://raw.githubusercontent.com/$slug/$branch/scripts/setup.js",
      "https://cdn.jsdelivr.net/gh/$slug@$branch/scripts/setup.js"
    )) {
    if (-not (Get-Remote $raw $tmpSetup)) { continue }
    $text = ''
    try { $text = Get-Content -LiteralPath $tmpSetup -Raw -Encoding UTF8 } catch {}
    if ($text -notmatch 'function cmdUpdate') { continue }
    $local = ''
    try { $local = Get-Content -LiteralPath (Join-Path $root 'scripts\setup.js') -Raw -Encoding UTF8 } catch {}
    if ($local -eq $text) { break }
    Copy-Item -LiteralPath $tmpSetup -Destination (Join-Path $root 'scripts\setup.js') -Force
    Write-Host '更新脚本已刷新到远端最新版本'
    break
  }
  Remove-Item -LiteralPath $tmpSetup -Force -ErrorAction SilentlyContinue
}

& $node.Exe (Join-Path $root 'scripts\setup.js') @passArgs
exit $LASTEXITCODE
