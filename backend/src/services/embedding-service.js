const embedClient = require('./embed-client');

function getEmbeddingText(item) {
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

function buildVectorMetadata(item) {
  return {
    source_type: String(item.source_type ?? ''),
    domain: String(item.domain ?? ''),
    created_at: Number(item.created_at ?? 0),
    save_mode: String(item.save_mode ?? ''),
  };
}

async function embedAndStoreItem(item) {
  const text = getEmbeddingText(item);
  const embedding = await embedClient.embedText(text);

  await embedClient.upsertVector(
    item.id,
    embedding,
    buildVectorMetadata(item),
    text
  );

  return { embedding, text };
}

module.exports = {
  getEmbeddingText,
  buildVectorMetadata,
  embedAndStoreItem,
};
