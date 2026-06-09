/**
 * Vector store facade — delegates to embed service (ChromaDB + HNSW).
 */

const embedClient = require('../services/embed-client');
const embeddingService = require('../services/embedding-service');

const COLLECTION_NAME = 'recall';

async function upsertVector(id, embedding, metadata = {}, document = '') {
  return embedClient.upsertVector(id, embedding, metadata, document);
}

async function upsertItemVector(item) {
  return embeddingService.embedAndStoreItem(item);
}

async function getVector(id) {
  try {
    return await embedClient.getVector(id);
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function hasVector(id) {
  const vector = await getVector(id);
  return Boolean(vector);
}

async function queryVectors(embedding, n = 20) {
  return embedClient.queryVectors(embedding, n);
}

async function deleteVector(id) {
  return embedClient.deleteVector(id);
}

module.exports = {
  COLLECTION_NAME,
  upsertVector,
  upsertItemVector,
  getVector,
  hasVector,
  queryVectors,
  deleteVector,
};
