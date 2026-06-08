const express = require('express');
const itemsDb = require('../db/items');
const { getStorageBytes } = require('../fs');

function createStatusRouter(queue) {
  const router = express.Router();

  router.get('/status', (req, res) => {
    res.json({
      ok: true,
      itemCount: itemsDb.countItems(),
      queueLength: queue.getQueueLength(),
      storageBytes: getStorageBytes(),
    });
  });

  router.get('/status/:id', (req, res) => {
    const item = itemsDb.getItemById(req.params.id);

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
  });

  return router;
}

module.exports = {
  createStatusRouter,
};
