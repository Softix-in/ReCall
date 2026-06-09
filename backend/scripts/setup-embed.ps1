# Setup Recall embedding service (Python deps + ONNX model)
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$EmbedDir = Join-Path (Split-Path -Parent $Root) "recall-embed"

Write-Host "Installing Python dependencies..."
python -m pip install -r (Join-Path $EmbedDir "requirements.txt")

Write-Host "Downloading ONNX model + tokenizer (first run may take a few minutes)..."
python (Join-Path $EmbedDir "scripts\download_model.py")

Write-Host ""
Write-Host "Embed service setup complete."
Write-Host "Start backend with: cd backend; npm start"
Write-Host "Embed service auto-starts on port 7879"
