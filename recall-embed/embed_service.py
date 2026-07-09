#!/usr/bin/env python3
"""Recall embedding service (ONNX MiniLM only — vectors stored in PostgreSQL/pgvector)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from tokenizers import Tokenizer

RECALL_HOME = Path(os.environ.get("RECALL_HOME", Path.home() / ".recall"))
MODELS_DIR = RECALL_HOME / "models"
MODEL_PATH = MODELS_DIR / "minilm.onnx"
TOKENIZER_PATH = MODELS_DIR / "tokenizer.json"
EMBEDDING_DIM = 384

HOST = os.environ.get("EMBED_HOST", "127.0.0.1")
PORT = int(os.environ.get("EMBED_PORT", "7879"))


class EmbedRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


class EmbedResponse(BaseModel):
    embedding: list[float]
    dimensions: int


class EmbeddingEngine:
    def __init__(self, model_path: Path, tokenizer_path: Path) -> None:
        if not model_path.exists():
            raise FileNotFoundError(
                f"ONNX model not found at {model_path}. Run scripts/download_model.py"
            )
        if not tokenizer_path.exists():
            raise FileNotFoundError(
                f"Tokenizer not found at {tokenizer_path}. Run scripts/download_model.py"
            )

        self.session = ort.InferenceSession(
            str(model_path),
            providers=["CPUExecutionProvider"],
        )
        self.tokenizer = Tokenizer.from_file(str(tokenizer_path))
        self.tokenizer.enable_padding(length=256)
        self.tokenizer.enable_truncation(max_length=256)

        self.input_names = {inp.name for inp in self.session.get_inputs()}

    def embed(self, text: str) -> list[float]:
        encoded = self.tokenizer.encode(text.strip())
        input_ids = np.array([encoded.ids], dtype=np.int64)
        attention_mask = np.array([encoded.attention_mask], dtype=np.int64)
        token_type_ids = np.array([encoded.type_ids], dtype=np.int64)

        feed: dict[str, np.ndarray] = {}
        for name in self.input_names:
            if "input_ids" in name:
                feed[name] = input_ids
            elif "attention_mask" in name:
                feed[name] = attention_mask
            elif "token_type_ids" in name:
                feed[name] = token_type_ids

        outputs = self.session.run(None, feed)
        token_embeddings = outputs[0]
        mask = attention_mask.astype(np.float32)[:, :, None]
        summed = np.sum(token_embeddings * mask, axis=1)
        counts = np.clip(np.sum(mask, axis=1), 1e-9, None)
        pooled = summed / counts
        norm = np.linalg.norm(pooled, axis=1, keepdims=True)
        normalized = pooled / np.clip(norm, 1e-9, None)
        vector = normalized[0].astype(np.float32)

        if vector.shape[0] != EMBEDDING_DIM:
            raise ValueError(f"Expected {EMBEDDING_DIM} dims, got {vector.shape[0]}")

        return vector.tolist()


app = FastAPI(title="Recall Embed Service", version="0.4.0")
engine: EmbeddingEngine | None = None


@app.on_event("startup")
def startup() -> None:
    global engine

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    engine = EmbeddingEngine(MODEL_PATH, TOKENIZER_PATH)


@app.get("/health")
def health() -> dict[str, Any]:
    if engine is None:
        raise HTTPException(status_code=503, detail="Embedding engine not ready")

    return {
        "ok": True,
        "service": "recall-embed",
        "model": str(MODEL_PATH),
        "dimensions": EMBEDDING_DIM,
        "vector_store": "postgresql/pgvector",
    }


@app.post("/embed", response_model=EmbedResponse)
def embed(request: EmbedRequest) -> EmbedResponse:
    if engine is None:
        raise HTTPException(status_code=503, detail="Embedding engine not ready")

    embedding = engine.embed(request.text)
    return EmbedResponse(embedding=embedding, dimensions=len(embedding))


def main() -> None:
    uvicorn.run(
        "embed_service:app",
        host=HOST,
        port=PORT,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
