const fs = require('fs');
const path = require('path');
const config = require('../config');
const itemsDb = require('../db/items');
const chromaDb = require('../db/chroma');
const { isTestItem } = require('../utils/test-data');

function removeFileIfExists(relativePath) {
  if (!relativePath) {
    return;
  }

  const absolutePath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(config.RECALL_HOME, relativePath);

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}

async function deleteItemFully(itemOrId) {
  const item = typeof itemOrId === 'string'
    ? itemsDb.getItemById(itemOrId)
    : itemOrId;

  if (!item) {
    const error = new Error('Item not found');
    error.status = 404;
    throw error;
  }

  try {
    await chromaDb.deleteVector(item.id);
  } catch {
    // Vector may not exist for failed or partial items.
  }

  removeFileIfExists(item.transcript);
  removeFileIfExists(item.thumbnail);

  const deleted = itemsDb.deleteItem(item.id);

  if (!deleted) {
    const error = new Error('Item not found');
    error.status = 404;
    throw error;
  }

  return { id: item.id, url: item.url };
}

async function clearTestItems() {
  const testItems = itemsDb.listTestItems();
  const deleted = [];

  for (const item of testItems) {
    const result = await deleteItemFully(item);
    deleted.push(result);
  }

  return {
    count: deleted.length,
    deleted,
  };
}

function countTestItems() {
  return itemsDb.listTestItems().length;
}

module.exports = {
  deleteItemFully,
  clearTestItems,
  countTestItems,
  isTestItem,
};
