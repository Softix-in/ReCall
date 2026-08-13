const express = require('express');
const searchService = require('../services/search-service');
const { EmbedClientError } = require('../services/embed-client');
const { sendError } = require('../utils/http-error');

const router = express.Router();

router.get('/search/recommendations', async (req, res) => {
  try {
    const recommendations = await searchService.getRecommendations(req.user.id);
    res.json(recommendations);
  } catch (error) {
    sendError(res, error, 'Failed to load recommendations');
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
      sendError(res, error, 'Invalid search request');
      return;
    }

    if (error instanceof EmbedClientError) {
      res.status(503).json({ error: 'Embedding service unavailable' });
      return;
    }

    sendError(res, error, 'Search failed');
  }
});

module.exports = router;
