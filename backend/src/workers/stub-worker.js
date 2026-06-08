const itemsDb = require('../db/items');

const STUB_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processItem(itemId) {
  const item = itemsDb.getItemById(itemId);

  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  itemsDb.updateItem(itemId, { processing: 'processing' });

  await sleep(STUB_DELAY_MS);

  if (item.url.includes('fail-job-test')) {
    throw new Error('Simulated pipeline failure');
  }

  itemsDb.updateItem(itemId, {
    processing: 'done',
    processed_at: Date.now(),
    title: item.title || `Stub title for ${item.domain || 'saved item'}`,
    summary: item.summary || 'Stub summary — real pipeline arrives in Phase 2.',
  });
}

module.exports = {
  processItem,
  STUB_DELAY_MS,
};
