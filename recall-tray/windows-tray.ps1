# Recall system tray (Windows)
$ErrorActionPreference = "SilentlyContinue"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ApiBase = "http://127.0.0.1:7878"
$Root = Split-Path -Parent $PSScriptRoot
$LogsDir = Join-Path $env:USERPROFILE ".recall\logs"
$SearchPage = Join-Path $Root "recall-extension\search\search.html"

$paused = $false

function Get-Status {
  try {
    return Invoke-RestMethod -Uri "$ApiBase/status" -TimeoutSec 3
  } catch {
    return $null
  }
}

function Update-Tooltip {
  param($status)
  if (-not $status) {
    $script:notifyIcon.Text = "Recall — offline"
    return
  }
  $title = if ($status.lastSaved.title) { $status.lastSaved.title } else { "No saves yet" }
  $script:notifyIcon.Text = "Recall — queue: $($status.queueLength) | $title"
}

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
$notifyIcon.Visible = $true
Update-Tooltip (Get-Status)

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$openSearch = $menu.Items.Add("Open Recall Search")
$openSearch.Add_Click({
  if (Test-Path $SearchPage) {
    Start-Process $SearchPage
  } else {
    Start-Process "chrome-extension://"
  }
})

$togglePause = $menu.Items.Add("Pause processing")
$togglePause.Add_Click({
  if ($script:paused) {
    Invoke-RestMethod -Method Post -Uri "$ApiBase/queue/resume" | Out-Null
    $script:paused = $false
    $togglePause.Text = "Pause processing"
  } else {
    Invoke-RestMethod -Method Post -Uri "$ApiBase/queue/pause" | Out-Null
    $script:paused = $true
    $togglePause.Text = "Resume processing"
  }
})

$openLogs = $menu.Items.Add("Open logs")
$openLogs.Add_Click({
  if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir | Out-Null }
  Start-Process explorer.exe $LogsDir
})

$exitItem = $menu.Items.Add("Exit tray")
$exitItem.Add_Click({
  $notifyIcon.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

$notifyIcon.ContextMenuStrip = $menu

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({ Update-Tooltip (Get-Status) })
$timer.Start()

[System.Windows.Forms.Application]::Run()
