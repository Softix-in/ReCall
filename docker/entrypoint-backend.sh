#!/usr/bin/env bash
set -euo pipefail

RECALL_HOME="${RECALL_HOME:-/data/recall}"
WHISPER_DIR="${RECALL_HOME}/whisper"
MODELS_DIR="${RECALL_HOME}/models"

mkdir -p "$WHISPER_DIR" "$MODELS_DIR" "${RECALL_HOME}/data"

if [ -x /usr/local/bin/whisper-cli ] && [ ! -f "${WHISPER_DIR}/whisper-cli" ]; then
  cp /usr/local/bin/whisper-cli "${WHISPER_DIR}/whisper-cli"
  chmod +x "${WHISPER_DIR}/whisper-cli"
fi

if [ ! -f "${WHISPER_DIR}/ggml-small.bin" ]; then
  echo "Downloading Whisper ggml-small model..."
  curl -fsSL -o "${WHISPER_DIR}/ggml-small.bin" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
fi

if [ ! -f "${MODELS_DIR}/minilm.onnx" ]; then
  echo "Downloading embedding model..."
  python3 /app/recall-embed/scripts/download_model.py
fi

exec "$@"
