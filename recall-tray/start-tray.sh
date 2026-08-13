#!/usr/bin/env bash
# Start Recall system tray (macOS / Linux)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TRAY_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required for the Recall tray."
  exit 1
fi

python3 -m pip install -q -r "$TRAY_DIR/requirements.txt"
exec python3 "$TRAY_DIR/tray.py"
