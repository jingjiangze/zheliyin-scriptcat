# 折立印名片套版助手 - 一键安装器（源码）
# 由 GitHub Actions 用 ps2exe 编译为单文件 exe。扩展文件会在构建时内嵌（embedded.generated.ps1）。
# 本地直接运行本脚本时，若同目录存在 extension/ 文件夹则从文件夹复制（开发模式），否则仅提示。

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$dst = Join-Path $env:LOCALAPPDATA "ZloCardAssistant\extension"

function Write-ExtensionFiles {
  param([bool]$showError = $true)
  if (-not $Embedded) { $script:Embedded = @{} }
  # 内嵌模式：构建时由 GitHub Actions 注入 $Embedded（相对路径 -> base64）
  if ($Embedded.Count -gt 0) {
    try {
      foreach ($k in $Embedded.Keys) {
        $bytes = [Convert]::FromBase64String($Embedded[$k])
        $target = Join-Path $dst ($k -replace "/", "\")
        $dir = Split-Path $target -Parent
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        [IO.File]::WriteAllBytes($target, $bytes)
      }
      return $true
    } catch {
      if ($showError) { [System.Windows.Forms.MessageBox]::Show("写扩展文件失败：`n$($_.Exception.Message)", "折立印名片套版助手", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null }
      return $false
    }
  }
  # 开发模式：从 exe/脚本所在目录的 extension/ 复制
  $src = Join-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) "extension"
  if (Test-Path $src) {
    try {
      if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst -Force | Out-Null }
      Copy-Item -Path (Join-Path $src "*") -Destination $dst -Recurse -Force
      return $true
    } catch {
      if ($showError) { [System.Windows.Forms.MessageBox]::Show("复制扩展文件失败：`n$($_.Exception.Message)", "折立印名片套版助手", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null }
      return $false
    }
  }
  if ($showError) { [System.Windows.Forms.MessageBox]::Show("未找到扩展文件，无法安装。请重新下载完整版本。", "折立印名片套版助手", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null }
  return $false
}

# 写入扩展文件并复制安装路径到剪贴板
$installed = Write-ExtensionFiles
if ($installed) {
  try { [System.Windows.Forms.Clipboard]::SetText($dst) } catch { }
}

function Open-BrowserPage {
  param([string]$browserName, [string]$page, [string[]]$paths)
  foreach ($p in $paths) {
    if (Test-Path $p) {
      Start-Process -FilePath $p -ArgumentList $page
      return $true
    }
  }
  return $false
}

$chromePaths = @(
  (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
  (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
)
$edgePaths = @(
  (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe")
)

# ---------- 界面 ----------
[System.Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object System.Windows.Forms.Form
$form.Text = "折立印名片套版助手 - 一键安装"
$form.ClientSize = New-Object System.Drawing.Size(580, 340)
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.MaximizeBox = $false
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedSingle

$title = New-Object System.Windows.Forms.Label
$title.Location = New-Object System.Drawing.Point(20, 16)
$title.Size = New-Object System.Drawing.Size(540, 26)
$title.Font = New-Object System.Drawing.Font("Microsoft YaHei", 13, [System.Drawing.FontStyle]::Bold)
$title.Text = "折立印名片套版助手 已写入扩展文件"

$pathLabel = New-Object System.Windows.Forms.Label
$pathLabel.Location = New-Object System.Drawing.Point(20, 50)
$pathLabel.Size = New-Object System.Drawing.Size(540, 20)
$pathLabel.Text = "安装位置已复制到剪贴板："
$pathValue = New-Object System.Windows.Forms.Label
$pathValue.Location = New-Object System.Drawing.Point(20, 72)
$pathValue.Size = New-Object System.Drawing.Size(540, 20)
$pathValue.ForeColor = [System.Drawing.Color]::FromArgb(31, 111, 235)
$pathValue.Text = $dst

$steps = New-Object System.Windows.Forms.Label
$steps.Location = New-Object System.Drawing.Point(20, 106)
$steps.Size = New-Object System.Drawing.Size(540, 150)
$steps.Font = New-Object System.Drawing.Font("Microsoft YaHei", 9)
$steps.Text = @"
剩下 3 步（只需做一次）：
1. 点下方按钮打开浏览器扩展管理页（Chrome 或 Edge）
2. 打开右上角的“开发者模式”开关
3. 点“加载已解压的扩展程序”，粘贴/选中上面的安装路径
完成后列表出现“折立印名片套版助手”即安装成功，以后浏览器一开自动生效。
"@

$btnChrome = New-Object System.Windows.Forms.Button
$btnChrome.Location = New-Object System.Drawing.Point(20, 268)
$btnChrome.Size = New-Object System.Drawing.Size(170, 38)
$btnChrome.Text = "打开 Chrome 扩展页"
$btnChrome.Add_Click({ if (-not (Open-BrowserPage "Chrome" "chrome://extensions" $chromePaths)) { [System.Windows.Forms.MessageBox]::Show("未找到 Chrome，请手动打开 chrome://extensions", "折立印名片套版助手") | Out-Null } })

$btnEdge = New-Object System.Windows.Forms.Button
$btnEdge.Location = New-Object System.Drawing.Point(205, 268)
$btnEdge.Size = New-Object System.Drawing.Size(160, 38)
$btnEdge.Text = "打开 Edge 扩展页"
$btnEdge.Add_Click({ if (-not (Open-BrowserPage "Edge" "edge://extensions" $edgePaths)) { [System.Windows.Forms.MessageBox]::Show("未找到 Edge，请手动打开 edge://extensions", "折立印名片套版助手") | Out-Null } })

$btnFolder = New-Object System.Windows.Forms.Button
$btnFolder.Location = New-Object System.Drawing.Point(380, 268)
$btnFolder.Size = New-Object System.Drawing.Size(100, 38)
$btnFolder.Text = "打开文件夹"
$btnFolder.Add_Click({ if (Test-Path $dst) { Start-Process explorer.exe -ArgumentList "`"$dst`"" } })

$btnClose = New-Object System.Windows.Forms.Button
$btnClose.Location = New-Object System.Drawing.Point(495, 268)
$btnClose.Size = New-Object System.Drawing.Size(65, 38)
$btnClose.Text = "完成"
$btnClose.Add_Click({ $form.Close() })

if (-not $installed) {
  $title.Text = "安装失败"
  $pathLabel.Text = ""
  $pathValue.Text = ""
  $btnChrome.Enabled = $false
  $btnEdge.Enabled = $false
  $btnFolder.Enabled = $false
}

$form.Controls.AddRange(@($title, $pathLabel, $pathValue, $steps, $btnChrome, $btnEdge, $btnFolder, $btnClose))
[System.Windows.Forms.Application]::Run($form)