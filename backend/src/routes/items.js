const express = require('express');
const itemsDb = require('../db/items');
const {
  deleteItemFully,
  clearTestItems,
  countTestItems,
} = require('../services/item-deletion-service');
const { exportItems } = require('../services/export-service');
const { readTranscriptContent } = require('../services/object-storage');
const { sendError } = require('../utils/http-error');

const router = express.Router();

router.get('/items', async (req, res) => {
  try {
    const items = await itemsDb.listItems(req.user.id, {
      limit: req.query.limit,
      sort: req.query.sort || 'created_at',
    });

    res.json({ items });
  } catch (error) {
    sendError(res, error, 'Failed to list items');
  }
});

router.get('/items/test-data/count', async (req, res) => {
  try {
    const count = await countTestItems(req.user.id);
    res.json({ count });
  } catch (error) {
    sendError(res, error, 'Failed to count test data');
  }
});

router.post('/items/clear-test-data', async (req, res) => {
  try {
    const result = await clearTestItems(req.user.id);
    res.json({ ok: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to clear test data');
  }
});

router.get('/items/:id', async (req, res) => {
  try {
    const item = await itemsDb.getItemById(req.user.id, req.params.id);

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const includeTranscript = req.query.include_transcript === '1';

    res.json({
      item: {
        ...item,
        transcript_text: includeTranscript ? await readTranscriptContent(item) : undefined,
      },
    });
  } catch (error) {
    sendError(res, error, 'Failed to load item');
  }
});

router.get('/items/:id/tags', async (req, res) => {
  try {
    const item = await itemsDb.getItemById(req.user.id, req.params.id);

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const tags = item.tags ? item.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    res.json({ tags });
  } catch (error) {
    sendError(res, error, 'Failed to load tags');
  }
});

router.put('/items/:id/tags', async (req, res) => {
  try {
    const userId = req.user.id;
    const item = await itemsDb.getItemById(userId, req.params.id);

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      res.status(400).json({ error: 'tags must be an array of strings' });
      return;
    }

    const clean = tags
      .map((t) => String(t).trim().toLowerCase().replace(/[^a-z0-9-_ ]/g, ''))
      .filter(Boolean)
      .slice(0, 20);

    const updated = await itemsDb.updateItem(userId, req.params.id, { tags: clean.join(',') });
    res.json({ tags: clean, item: updated });
  } catch (error) {
    sendError(res, error, 'Failed to update tags');
  }
});

router.get('/export', async (req, res) => {
  const format = req.query.format === 'markdown' ? 'markdown' : 'json';
  const type = req.query.type || null;

  try {
    const { content, filename, contentType } = await exportItems(req.user.id, { format, type });
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    res.send(content);
  } catch (error) {
    sendError(res, error, 'Export failed');
  }
});

router.delete('/items/:id', async (req, res) => {
  try {
    const result = await deleteItemFully(req.user.id, req.params.id);
    res.json({ ok: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to delete item');
  }
});

module.exports = router;
