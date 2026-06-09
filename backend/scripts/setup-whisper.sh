#!/usr/bin/env bash
set -euo pipefail

RECALL_HOME="${RECALL_HOME:-$HOME/.recall}"
WHISPER_DIR="$RECALL_HOME/whisper"
mkdir -p "$WHISPER_DIR"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS-$ARCH" in
  Darwin-arm64) RELEASE="whisper-bin-arm64-apple-darwin.zip" ;;
  Darwin-x86_64) RELEASE="whisper-bin-x64-apple-darwin.zip" ;;
  Linux-x86_64) RELEASE="whisper-bin-x64-ubuntu.zip" ;;
  *) echo "Unsupported platform: $OS $ARCH"; exit 1 ;;
esac

URL="https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.4/$RELEASE"
ZIP="/tmp/whisper-bin.zip"

echo "Downloading whisper.cpp ($RELEASE)..."
curl -L "$URL" -o "$ZIP"
unzip -o "$ZIP" -d "$WHISPER_DIR"

find "$WHISPER_DIR" -name 'whisper-cli' -o -name 'main' | while read -r bin; do
  chmod +x "$bin"
  cp "$bin" "$WHISPER_DIR/$(basename "$bin")" 2>/dev/null || true
done

MODEL="$WHISPER_DIR/ggml-small.bin"
if [[ ! -f "$MODEL" ]]; then
  echo "Downloading ggml-small.bin..."
  curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin" -o "$MODEL"
fi

echo "Whisper setup complete: $WHISPER_DIR"
