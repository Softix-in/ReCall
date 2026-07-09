const fs = require('fs');
const path = require('path');
const config = require('../config');
const itemsDb = require('../db/items');
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

async function deleteItemFully(userId, itemOrId) {
  const item = typeof itemOrId === 'string'
    ? await itemsDb.getItemById(userId, itemOrId)
    : itemOrId;

  if (!item) {
    const error = new Error('Item not found');
    error.status = 404;
    throw error;
  }

  removeFileIfExists(item.transcript);
  removeFileIfExists(item.thumbnail);

  const deleted = await itemsDb.deleteItem(userId, item.id);

  if (!deleted) {
    const error = new Error('Item not found');
    error.status = 404;
    throw error;
  }

  return { id: item.id, url: item.url };
}

async function clearTestItems(userId) {
  const testItems = await itemsDb.listTestItems(userId);
  const deleted = [];

  for (const item of testItems) {
    const result = await deleteItemFully(userId, item);
    deleted.push(result);
  }

  return {
    count: deleted.length,
    deleted,
  };
}

async function countTestItems(userId) {
  const testItems = await itemsDb.listTestItems(userId);
  return testItems.length;
}

module.exports = {
  deleteItemFully,
  clearTestItems,
  countTestItems,
  isTestItem,
};
