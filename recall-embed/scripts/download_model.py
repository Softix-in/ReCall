#!/usr/bin/env python3
"""Download MiniLM ONNX model and tokenizer into ~/.recall/models/."""

from __future__ import annotations

import os
import sys
import urllib.request
from pathlib import Path

RECALL_HOME = Path(os.environ.get("RECALL_HOME", Path.home() / ".recall"))
MODELS_DIR = RECALL_HOME / "models"
MODEL_PATH = MODELS_DIR / "minilm.onnx"
TOKENIZER_PATH = MODELS_DIR / "tokenizer.json"

ONNX_URL = (
    "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx"
)


def download_file(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {url}")
    print(f"  -> {destination}")
    urllib.request.urlretrieve(url, destination)


def download_tokenizer() -> None:
    try:
        from transformers import AutoTokenizer
    except ImportError as error:
        raise SystemExit(
            "Install transformers once to export tokenizer: pip install transformers"
        ) from error

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    tokenizer = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
    tokenizer.backend_tokenizer.save(str(TOKENIZER_PATH))
    print(f"Tokenizer saved to {TOKENIZER_PATH}")


def main() -> None:
    if not MODEL_PATH.exists():
        download_file(ONNX_URL, MODEL_PATH)
    else:
        print(f"Model already exists: {MODEL_PATH}")

    if not TOKENIZER_PATH.exists():
        download_tokenizer()
    else:
        print(f"Tokenizer already exists: {TOKENIZER_PATH}")

    print("Model setup complete.")


if __name__ == "__main__":
    main()
