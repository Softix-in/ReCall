const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');
const itemsDb = require('../db/items');
const {
  deleteItemFully,
  clearTestItems,
  countTestItems,
} = require('../services/item-deletion-service');

const router = express.Router();

function readTranscriptText(relativePath) {
  if (!relativePath) {
    return null;
  }

  const absolutePath = path.join(config.RECALL_HOME, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  return fs.readFileSync(absolutePath, 'utf8');
}

router.get('/items', (req, res) => {
  const limit = req.query.limit;
  const sort = req.query.sort || 'created_at';

  const items = itemsDb.listItems({ limit, sort });
  res.json({ items });
});

router.get('/items/test-data/count', (req, res) => {
  res.json({ count: countTestItems() });
});

router.post('/items/clear-test-data', async (req, res) => {
  try {
    const result = await clearTestItems();
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('Clear test data failed:', error);
    res.status(500).json({ error: 'Failed to clear test data', detail: error.message });
  }
});

router.get('/items/:id', (req, res) => {
  const item = itemsDb.getItemById(req.params.id);

  if (!item) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  const includeTranscript = req.query.include_transcript === '1';

  res.json({
    item: {
      ...item,
      transcript_text: includeTranscript ? readTranscriptText(item.transcript) : undefined,
    },
  });
});

router.delete('/items/:id', async (req, res) => {
  try {
    const result = await deleteItemFully(req.params.id);
    res.json({ ok: true, ...result });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

module.exports = router;
