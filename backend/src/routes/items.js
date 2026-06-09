const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');
const itemsDb = require('../db/items');

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

module.exports = router;
