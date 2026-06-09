#!/usr/bin/env python3
"""Recall embedding + vector store service (ONNX MiniLM + ChromaDB)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import chromadb
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
CHROMA_PATH = RECALL_HOME / "data" / "chroma"
COLLECTION_NAME = "recall"
EMBEDDING_DIM = 384

HOST = os.environ.get("EMBED_HOST", "127.0.0.1")
PORT = int(os.environ.get("EMBED_PORT", "7879"))


class EmbedRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


class EmbedResponse(BaseModel):
    embedding: list[float]
    dimensions: int


class UpsertRequest(BaseModel):
    id: str
    embedding: list[float]
    metadata: dict[str, str | int | float | bool] = Field(default_factory=dict)
    document: str = ""


class QueryRequest(BaseModel):
    embedding: list[float]
    n: int = Field(default=20, ge=1, le=100)


class QueryResult(BaseModel):
    id: str
    score: float
    metadata: dict[str, Any]
    document: str


class QueryResponse(BaseModel):
    results: list[QueryResult]


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


def create_collection(client: chromadb.ClientAPI):
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


app = FastAPI(title="Recall Embed Service", version="0.3.0")
engine: EmbeddingEngine | None = None
collection = None


@app.on_event("startup")
def startup() -> None:
    global engine, collection

    CHROMA_PATH.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    engine = EmbeddingEngine(MODEL_PATH, TOKENIZER_PATH)
    client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    collection = create_collection(client)


@app.get("/health")
def health() -> dict[str, Any]:
    if engine is None or collection is None:
        raise HTTPException(status_code=503, detail="Embedding engine not ready")

    return {
        "ok": True,
        "service": "recall-embed",
        "model": str(MODEL_PATH),
        "collection": COLLECTION_NAME,
        "dimensions": EMBEDDING_DIM,
        "vector_count": collection.count(),
    }


@app.post("/embed", response_model=EmbedResponse)
def embed(request: EmbedRequest) -> EmbedResponse:
    if engine is None:
        raise HTTPException(status_code=503, detail="Embedding engine not ready")

    embedding = engine.embed(request.text)
    return EmbedResponse(embedding=embedding, dimensions=len(embedding))


@app.post("/vectors/upsert")
def upsert_vector(request: UpsertRequest) -> dict[str, bool]:
    if collection is None:
        raise HTTPException(status_code=503, detail="Vector store not ready")

    if len(request.embedding) != EMBEDDING_DIM:
        raise HTTPException(
            status_code=400,
            detail=f"Embedding must have {EMBEDDING_DIM} dimensions",
        )

    metadata = {
        key: value
        for key, value in request.metadata.items()
        if isinstance(value, (str, int, float, bool))
    }

    try:
        collection.upsert(
            ids=[request.id],
            embeddings=[request.embedding],
            metadatas=[metadata],
            documents=[request.document or ""],
        )
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    return {"ok": True}


@app.post("/vectors/query", response_model=QueryResponse)
def query_vectors(request: QueryRequest) -> QueryResponse:
    if collection is None:
        raise HTTPException(status_code=503, detail="Vector store not ready")

    if len(request.embedding) != EMBEDDING_DIM:
        raise HTTPException(
            status_code=400,
            detail=f"Query embedding must have {EMBEDDING_DIM} dimensions",
        )

    if collection.count() == 0:
        return QueryResponse(results=[])

    response = collection.query(
        query_embeddings=[request.embedding],
        n_results=min(request.n, collection.count()),
        include=["metadatas", "documents", "distances"],
    )

    results: list[QueryResult] = []
    ids = response.get("ids", [[]])[0]
    distances = response.get("distances", [[]])[0]
    metadatas = response.get("metadatas", [[]])[0]
    documents = response.get("documents", [[]])[0]

    for index, item_id in enumerate(ids):
        distance = distances[index] if index < len(distances) else 1.0
        score = max(0.0, 1.0 - distance)
        results.append(
            QueryResult(
                id=item_id,
                score=score,
                metadata=metadatas[index] if index < len(metadatas) else {},
                document=documents[index] if index < len(documents) else "",
            )
        )

    return QueryResponse(results=results)


@app.get("/vectors/{item_id}")
def get_vector(item_id: str) -> dict[str, Any]:
    if collection is None:
        raise HTTPException(status_code=503, detail="Vector store not ready")

    try:
        result = collection.get(
            ids=[item_id],
            include=["embeddings", "metadatas", "documents"],
        )
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    def _as_list(value):
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return list(value)

    ids = _as_list(result.get("ids"))
    if len(ids) == 0:
        raise HTTPException(status_code=404, detail="Vector not found")

    embeddings = _as_list(result.get("embeddings"))
    metadatas = _as_list(result.get("metadatas"))
    documents = _as_list(result.get("documents"))

    embedding = embeddings[0]
    if hasattr(embedding, "tolist"):
        embedding = embedding.tolist()

    return {
        "id": ids[0],
        "embedding": embedding if embedding is not None else [],
        "metadata": metadatas[0] if metadatas else {},
        "document": documents[0] if documents else "",
    }


@app.delete("/vectors/{item_id}")
def delete_vector(item_id: str) -> dict[str, bool]:
    if collection is None:
        raise HTTPException(status_code=503, detail="Vector store not ready")

    collection.delete(ids=[item_id])
    return {"ok": True}


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
