const express = require('express');
const itemsDb = require('../db/items');
const config = require('../config');
const { sendError } = require('../utils/http-error');

function createJobsRouter(queue) {
  const router = express.Router();

  router.get('/jobs/history', async (req, res) => {
    try {
      const jobs = await itemsDb.listJobHistory(req.user.id, {
        days: req.query.days,
        limit: req.query.limit,
      });

      res.json({ jobs });
    } catch (error) {
      sendError(res, error, 'Failed to load job history');
    }
  });

  router.get('/jobs/failed', async (req, res) => {
    try {
      const jobs = await itemsDb.listFailedItems(req.user.id, {
        limit: req.query.limit,
      });

      res.json({ jobs });
    } catch (error) {
      sendError(res, error, 'Failed to load failed jobs');
    }
  });

  router.post('/items/:id/retry', async (req, res) => {
    try {
      const userId = req.user.id;
      const item = await itemsDb.getItemById(userId, req.params.id);

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

      await itemsDb.updateItem(userId, item.id, {
        processing: 'queued',
        error_message: null,
        processed_at: null,
      });

      queue.addJob({ itemId: item.id, userId, url: item.url });

      res.json({
        id: item.id,
        processing: 'queued',
      });
    } catch (error) {
      sendError(res, error, 'Failed to retry item');
    }
  });

  router.post('/queue/pause', (req, res) => {
    if (req.user?.email !== config.BOOTSTRAP_USER_EMAIL) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    queue.pause();
    res.json({ paused: true, queueLength: queue.getQueueLength() });
  });

  router.post('/queue/resume', (req, res) => {
    if (req.user?.email !== config.BOOTSTRAP_USER_EMAIL) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    queue.resume();
    res.json({ paused: false, queueLength: queue.getQueueLength() });
  });

  return router;
}

module.exports = {
  createJobsRouter,
};
