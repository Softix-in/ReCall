const express = require('express');
const itemsDb = require('../db/items');

function createJobsRouter(queue) {
  const router = express.Router();

  router.get('/jobs/history', (req, res) => {
    const days = req.query.days;
    const limit = req.query.limit;

    res.json({
      jobs: itemsDb.listJobHistory({ days, limit }),
    });
  });

  router.get('/jobs/failed', (req, res) => {
    const limit = req.query.limit;
    res.json({
      jobs: itemsDb.listFailedItems({ limit }),
    });
  });

  router.post('/items/:id/retry', (req, res) => {
    const item = itemsDb.getItemById(req.params.id);

    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    if (item.processing !== 'failed' && item.processing !== 'done') {
      res.status(409).json({
        error: 'Only failed or completed items can be retried',
        processing: item.processing,
      });
      return;
    }

    itemsDb.updateItem(item.id, {
      processing: 'queued',
      error_message: null,
      processed_at: null,
    });

    queue.addJob({ itemId: item.id, url: item.url });

    res.json({
      id: item.id,
      processing: 'queued',
    });
  });

  router.post('/queue/pause', (req, res) => {
    queue.pause();
    res.json({ paused: true, queueLength: queue.getQueueLength() });
  });

  router.post('/queue/resume', (req, res) => {
    queue.resume();
    res.json({ paused: false, queueLength: queue.getQueueLength() });
  });

  return router;
}

module.exports = {
  createJobsRouter,
};
