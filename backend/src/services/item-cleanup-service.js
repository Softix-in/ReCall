const fs = require('fs');
const path = require('path');
const config = require('../config');
const itemsDb = require('../db/items');
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

async function deleteItemFully(userId, id) {
  const item = await itemsDb.getItemById(userId, id);

  if (!item) {
    return { ok: false, reason: 'not_found' };
  }

  removeFileIfExists(item.transcript);
  removeFileIfExists(item.thumbnail);
  removeFileIfExists(path.join(config.TRANSCRIPTS_DIR, `${item.id}.txt`));

  const deleted = await itemsDb.deleteItem(userId, item.id);
  return { ok: deleted, id: item.id };
}

async function clearTestAndExampleData(userId) {
  const allItems = await itemsDb.listAllItems(userId);
  const testItems = allItems.filter(isTestOrExampleItem);
  const deletedIds = [];

  for (const item of testItems) {
    const result = await deleteItemFully(userId, item.id);
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
