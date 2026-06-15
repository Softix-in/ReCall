#!/usr/bin/env bash
set -euo pipefail

RECALL_HOME="${RECALL_HOME:-/data/recall}"
MODELS_DIR="${RECALL_HOME}/models"

mkdir -p "$MODELS_DIR" "${RECALL_HOME}/data/chroma"

if [ ! -f "${MODELS_DIR}/minilm.onnx" ]; then
  echo "Downloading embedding model..."
  python3 /app/recall-embed/scripts/download_model.py
fi

exec "$@"
