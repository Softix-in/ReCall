#!/usr/bin/env bash
# Recall one-command installer (macOS / Linux)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== Recall Installer ==="

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1 — $2"
    exit 1
  fi
}

require_cmd node "Install Node.js 20+ from https://nodejs.org"
require_cmd python3 "Install Python 3.10+"
require_cmd npm "npm ships with Node.js"

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "Installing yt-dlp..."
  if command -v brew >/dev/null 2>&1; then
    brew install yt-dlp || pip3 install yt-dlp
  else
    pip3 install yt-dlp
  fi
fi

RECALL_HOME="${RECALL_HOME:-$HOME/.recall}"
mkdir -p "$RECALL_HOME"

echo "Installing backend dependencies..."
cd "$ROOT/backend"
npm install
npm run migrate

echo "Setting up Whisper.cpp..."
bash "$ROOT/backend/scripts/setup-whisper.sh"

echo "Setting up embedding service..."
python3 -m pip install -r "$ROOT/recall-embed/requirements.txt"
python3 "$ROOT/recall-embed/scripts/download_model.py"

echo "Generating extension icons..."
node "$ROOT/recall-extension/scripts/generate-icons.js"

echo "Registering launchd/systemd service..."
bash "$ROOT/scripts/register-daemon.sh"

echo ""
echo "=== Installation complete ==="
echo "1. Open chrome://extensions"
echo "2. Enable Developer mode"
echo "3. Load unpacked -> $ROOT/recall-extension"
echo ""
echo "Backend: http://127.0.0.1:7878"

if [[ "$OSTYPE" == "darwin"* ]]; then
  open "chrome://extensions/" 2>/dev/null || true
fi
