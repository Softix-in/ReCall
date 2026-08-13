# Recall one-command installer (Windows)
# Usage: powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Require-Command($name, $installHint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Write-Host "Missing dependency: $name"
    Write-Host $installHint
    exit 1
  }
}

Write-Host "=== Recall Installer (Windows) ===" -ForegroundColor Cyan

Require-Command node "Install Node.js 20+ from https://nodejs.org or: winget install OpenJS.NodeJS.LTS"
Require-Command python "Install Python 3.10+ from https://python.org or: winget install Python.Python.3.12"
Require-Command npm "npm ships with Node.js"

if (-not (Get-Command yt-dlp -ErrorAction SilentlyContinue)) {
  Write-Host "Installing yt-dlp..."
  try {
    winget install --id yt-dlp.yt-dlp -e --accept-package-agreements --accept-source-agreements
  } catch {
    Write-Host "winget install failed — install yt-dlp manually: pip install yt-dlp"
  }
}

$RecallHome = if ($env:RECALL_HOME) { $env:RECALL_HOME } else { Join-Path $env:USERPROFILE ".recall" }
New-Item -ItemType Directory -Force -Path $RecallHome | Out-Null

Write-Host "Installing backend dependencies..."
Push-Location (Join-Path $Root "backend")
npm install
npm run migrate

Write-Host "Setting up Whisper.cpp..."
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "backend\scripts\setup-whisper.ps1")

Write-Host "Setting up embedding service..."
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "backend\scripts\setup-embed.ps1")
Pop-Location

Write-Host "Generating extension icons..."
node (Join-Path $Root "recall-extension\scripts\generate-icons.js")

Write-Host "Registering Recall daemon (Task Scheduler)..."
powershell -ExecutionPolicy Bypass -File (Join-Path $Root "scripts\register-daemon.ps1")

Write-Host "Starting Recall tray..."
Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $Root 'recall-tray\windows-tray.ps1')`""

Write-Host ""
Write-Host "=== Installation complete ===" -ForegroundColor Green
Write-Host "1. Open chrome://extensions"
Write-Host "2. Enable Developer mode"
Write-Host "3. Load unpacked -> select: $(Join-Path $Root 'recall-extension')"
Write-Host ""
Write-Host "Backend runs at http://127.0.0.1:7878 (auto-starts on login)"
Start-Process "chrome://extensions/"
