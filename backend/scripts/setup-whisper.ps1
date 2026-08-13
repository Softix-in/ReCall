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

# The zip extracts to a Release/ subfolder with DLLs co-located.
# The backend prefers Release/whisper-cli.exe automatically.
# Also copy binary + DLLs to root dir so either path works.
$releaseDir = Join-Path $WhisperDir "Release"
if (Test-Path $releaseDir) {
  Get-ChildItem -Path $releaseDir -Filter "*.exe" | ForEach-Object {
    $dest = Join-Path $WhisperDir $_.Name
    if (-not (Test-Path $dest)) { Copy-Item $_.FullName $dest }
  }
  # Copy required DLLs to root so the root-level .exe can also find them
  Get-ChildItem -Path $releaseDir -Filter "*.dll" | ForEach-Object {
    $dest = Join-Path $WhisperDir $_.Name
    if (-not (Test-Path $dest)) { Copy-Item $_.FullName $dest }
  }
}

if (-not (Test-Path $modelPath)) {
  Write-Host "Downloading ggml-small.bin model (~466 MB)..."
  Invoke-WebRequest -Uri $modelUrl -OutFile $modelPath
}

Write-Host "Whisper setup complete: $WhisperDir"
$binaries = Get-ChildItem $releaseDir -Filter *.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
Write-Host "Binaries in Release/:" $binaries
