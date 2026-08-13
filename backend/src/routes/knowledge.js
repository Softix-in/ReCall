const express = require('express');
const docCrawlDb = require('../db/doc-crawl');
const { startCrawl } = require('../services/doc-crawl-service');
const { sendError } = require('../utils/http-error');

function createKnowledgeRouter(docCrawlQueue) {
  const router = express.Router();

  router.post('/knowledge/crawl', async (req, res) => {
    try {
      const result = await startCrawl(req.user.id, req.body, docCrawlQueue);
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error, 'Failed to start crawl');
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
      sendError(res, error, 'Failed to list crawl jobs');
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
      sendError(res, error, 'Failed to load crawl job');
    }
  });

  return router;
}

module.exports = {
  createKnowledgeRouter,
};
