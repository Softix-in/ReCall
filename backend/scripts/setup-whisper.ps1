# Downloads whisper.cpp release binary and a small model into ~/.recall/whisper/
# Run from PowerShell: .\scripts\setup-whisper.ps1

$ErrorActionPreference = "Stop"

$RecallHome = if ($env:RECALL_HOME) { $env:RECALL_HOME } else { Join-Path $env:USERPROFILE ".recall" }
$WhisperDir = Join-Path $RecallHome "whisper"
New-Item -ItemType Directory -Force -Path $WhisperDir | Out-Null

$releaseUrl = "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.6/whisper-bin-x64.zip"
$zipPath = Join-Path $env:TEMP "whisper-bin-x64.zip"
$modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
$modelPath = Join-Path $WhisperDir "ggml-small.bin"

Write-Host "Downloading whisper.cpp binary..."
Invoke-WebRequest -Uri $releaseUrl -OutFile $zipPath
Expand-Archive -Path $zipPath -DestinationPath $WhisperDir -Force

# Flatten common release layouts
Get-ChildItem -Path $WhisperDir -Recurse -Filter "main.exe" | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $WhisperDir "main.exe") -Force
}
Get-ChildItem -Path $WhisperDir -Recurse -Filter "whisper-cli.exe" | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $WhisperDir "whisper-cli.exe") -Force
}

if (-not (Test-Path $modelPath)) {
  Write-Host "Downloading ggml-small.bin model (~466 MB)..."
  Invoke-WebRequest -Uri $modelUrl -OutFile $modelPath
}

Write-Host "Whisper setup complete: $WhisperDir"
Write-Host "Binaries:" (Get-ChildItem $WhisperDir -Filter *.exe | Select-Object -ExpandProperty Name)
