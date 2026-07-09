const express = require('express');
const searchService = require('../services/search-service');
const { EmbedClientError } = require('../services/embed-client');

const router = express.Router();

router.get('/search/recommendations', async (req, res) => {
  try {
    const recommendations = await searchService.getRecommendations(req.user.id);
    res.json(recommendations);
  } catch (error) {
    console.error('Recommendations failed:', error);
    res.status(500).json({ error: 'Failed to load recommendations' });
  }
});

router.get('/search', async (req, res) => {
  const query = (req.query.q || '').trim();

  if (!query) {
    res.status(400).json({ error: 'Query parameter q is required' });
    return;
  }

  try {
    const result = await searchService.search(req.user.id, query, {
      type: req.query.type,
      mode: req.query.mode,
      since: req.query.since,
    });

    res.json(result);
  } catch (error) {
    if (error.status === 400) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (error instanceof EmbedClientError) {
      res.status(503).json({
        error: 'Embedding service unavailable',
        detail: error.message,
      });
      return;
    }

    console.error('Search failed:', error);
    res.status(500).json({ error: 'Search failed', detail: error.message });
  }
});

module.exports = router;
