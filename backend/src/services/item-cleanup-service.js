const fs = require('fs');
const path = require('path');
const config = require('../config');
const itemsDb = require('../db/items');
const chromaDb = require('../db/chroma');
const { isTestOrExampleItem } = require('../utils/test-data');

function removeFileIfExists(filePath) {
  if (!filePath || filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return;
  }

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(config.RECALL_HOME, filePath);

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}

async function deleteItemFully(id) {
  const item = itemsDb.getItemById(id);

  if (!item) {
    return { ok: false, reason: 'not_found' };
  }

  try {
    await chromaDb.deleteVector(item.id);
  } catch {
    // Vector may not exist.
  }

  removeFileIfExists(item.transcript);
  removeFileIfExists(item.thumbnail);
  removeFileIfExists(path.join(config.TRANSCRIPTS_DIR, `${item.id}.txt`));

  const deleted = itemsDb.deleteItem(item.id);
  return { ok: deleted, id: item.id };
}

async function clearTestAndExampleData() {
  const allItems = itemsDb.listAllItems();
  const testItems = allItems.filter(isTestOrExampleItem);
  const deletedIds = [];

  for (const item of testItems) {
    const result = await deleteItemFully(item.id);
    if (result.ok) {
      deletedIds.push(item.id);
    }
  }

  return {
    ok: true,
    deleted: deletedIds.length,
    ids: deletedIds,
  };
}

module.exports = {
  deleteItemFully,
  clearTestAndExampleData,
};
