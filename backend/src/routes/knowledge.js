const express = require('express');
const docCrawlDb = require('../db/doc-crawl');
const { startCrawl } = require('../services/doc-crawl-service');

function createKnowledgeRouter(docCrawlQueue) {
  const router = express.Router();

  router.post('/knowledge/crawl', async (req, res) => {
    try {
      const result = await startCrawl(req.user.id, req.body, docCrawlQueue);
      res.status(201).json(result);
    } catch (error) {
      res.status(error.status || 500).json({
        error: error.message,
        code: error.code,
      });
    }
  });

  router.get('/knowledge/jobs', async (req, res) => {
    try {
      const jobs = await docCrawlDb.listJobs(req.user.id, {
        limit: req.query.limit,
        offset: req.query.offset,
      });
      res.json({ jobs });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/knowledge/jobs/:id', async (req, res) => {
    try {
      const job = await docCrawlDb.getJob(req.user.id, req.params.id);

      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.json({ job });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = {
  createKnowledgeRouter,
};
