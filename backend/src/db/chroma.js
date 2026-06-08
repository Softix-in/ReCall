const fs = require('fs');
const path = require('path');
const config = require('../config');

const STORE_PATH = path.join(config.CHROMA_DIR, 'recall-vectors.json');
const COLLECTION_NAME = 'recall';

let store = null;

function loadStore() {
  if (store) {
    return store;
  }

  if (fs.existsSync(STORE_PATH)) {
    store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } else {
    store = {
      collection: COLLECTION_NAME,
      vectors: {},
    };
  }

  return store;
}

function saveStore() {
  fs.mkdirSync(config.CHROMA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function placeholderEmbedding(seed = '') {
  const vector = new Array(config.EMBEDDING_DIM).fill(0);
  const text = seed || 'placeholder';

  for (let i = 0; i < text.length; i += 1) {
    const index = i % config.EMBEDDING_DIM;
    vector[index] += text.charCodeAt(i) / 1000;
  }

  return vector;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function upsertVector(id, embedding, metadata = {}, document = '') {
  loadStore();

  store.vectors[id] = {
    id,
    embedding,
    metadata,
    document,
    updated_at: Date.now(),
  };

  saveStore();
}

function getVector(id) {
  loadStore();
  return store.vectors[id] ?? null;
}

function hasVector(id) {
  return Boolean(getVector(id));
}

function queryVectors(embedding, n = 5) {
  loadStore();

  const results = Object.values(store.vectors)
    .map((entry) => ({
      id: entry.id,
      score: cosineSimilarity(embedding, entry.embedding),
      metadata: entry.metadata,
      document: entry.document,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);

  return results;
}

function upsertPlaceholder(id, metadata = {}, document = '') {
  const embedding = placeholderEmbedding(document || id);
  upsertVector(id, embedding, metadata, document);
  return embedding;
}

module.exports = {
  COLLECTION_NAME,
  upsertVector,
  upsertPlaceholder,
  getVector,
  hasVector,
  queryVectors,
  placeholderEmbedding,
};
