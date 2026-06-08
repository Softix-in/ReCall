const express = require('express');
const chromaDb = require('../db/chroma');
const itemsDb = require('../db/items');

const router = express.Router();

router.get('/search', (req, res) => {
  const query = (req.query.q || '').trim();

  if (!query) {
    res.status(400).json({ error: 'Query parameter q is required' });
    return;
  }

  const vectorResults = chromaDb.queryVectors(
    chromaDb.placeholderEmbedding(query),
    20
  );

  const results = vectorResults
    .map((match) => {
      const item = itemsDb.getItemById(match.id);
      if (!item) {
        return null;
      }

      if (req.query.type && item.source_type !== req.query.type) {
        return null;
      }

      if (req.query.mode && item.save_mode !== req.query.mode) {
        return null;
      }

      if (req.query.since) {
        const sinceMs = Date.parse(req.query.since);
        if (!Number.isNaN(sinceMs) && item.created_at < sinceMs) {
          return null;
        }
      }

      return {
        ...item,
        score: match.score,
      };
    })
    .filter(Boolean)
    .slice(0, 10);

  res.json({
    query,
    results,
    note: 'Phase 1 placeholder search — real semantic search arrives in Phase 3',
  });
});

module.exports = router;
