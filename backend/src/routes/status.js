const express = require('express');
const itemsDb = require('../db/items');
const { getStorageBytes } = require('../fs');
const config = require('../config');
const embedClient = require('../services/embed-client');
const { sendError } = require('../utils/http-error');

function createStatusRouter(queue) {
  const router = express.Router();

  router.get('/status', async (req, res) => {
    try {
      const userId = req.user.id;
      const [lastSaved, itemCount] = await Promise.all([
        itemsDb.getLastSavedItem(userId),
        itemsDb.countItems(userId),
      ]);

      let embed = { ok: false };
      try {
        embed = await embedClient.checkHealth();
      } catch (error) {
        embed = { ok: false };
      }

      res.json({
        ok: true,
        version: config.VERSION,
        itemCount,
        queueLength: queue.getQueueLength(),
        storageBytes: getStorageBytes(),
        paused: queue.isPaused(),
        embed: { ok: Boolean(embed.ok) },
        lastSaved: lastSaved
          ? { id: lastSaved.id, title: lastSaved.title, url: lastSaved.url }
          : null,
      });
    } catch (error) {
      sendError(res, error, 'Failed to load status');
    }
  });

  router.get('/status/:id', async (req, res) => {
    try {
      const item = await itemsDb.getItemById(req.user.id, req.params.id);

      if (!item) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }

      res.json({
        id: item.id,
        processing: item.processing,
        processed_at: item.processed_at,
        title: item.title,
        url: item.url,
        error_message: item.error_message ?? null,
      });
    } catch (error) {
      sendError(res, error, 'Failed to load item status');
    }
  });

  return router;
}

module.exports = {
  createStatusRouter,
};
