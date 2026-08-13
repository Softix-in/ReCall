const embedClient = require('./embed-client');
const itemsDb = require('../db/items');
const { getEmbeddingTextFromYaml } = require('./document-knowledge-service');

async function embedAndStoreItem(userId, item) {
  const text = getEmbeddingText(item);
  const embedding = await embedClient.embedText(text);
  await itemsDb.updateItemEmbedding(userId, item.id, embedding);

  return { embedding, text };
}

function getEmbeddingText(item) {
  if (item.save_mode === 'doc_extract' && item.content?.trim()) {
    return getEmbeddingTextFromYaml(item.content);
  }

  if (item.save_mode === 'manual_note' && item.note?.trim()) {
    return item.note.trim();
  }

  return (
    item.summary?.trim()
    || item.content?.trim()
    || item.title?.trim()
    || item.url
  );
}

module.exports = {
  getEmbeddingText,
  embedAndStoreItem,
};
