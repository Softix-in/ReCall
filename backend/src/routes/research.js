const express = require('express');
const researchDb = require('../db/research');
const { startResearch } = require('../services/research-service');

function createResearchRouter(researchQueue) {
  const router = express.Router();

  router.post('/research/startups', async (req, res) => {
    try {
      const result = await startResearch(req.user.id, req.body, researchQueue);
      res.status(201).json(result);
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({
        error: error.message,
        code: error.code,
      });
    }
  });

  router.get('/research/jobs/:id', async (req, res) => {
    try {
      const job = await researchDb.getJob(req.user.id, req.params.id);
      if (!job) {
        return res.status(404).json({ error: 'Research job not found' });
      }

      const company = await researchDb.getCompany(req.user.id, job.company_id);
      return res.json({ job, company });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/research/companies', async (req, res) => {
    try {
      const status = req.query.status || null;
      const limit = req.query.limit || 50;
      const offset = req.query.offset || 0;

      const [companies, counts] = await Promise.all([
        researchDb.listCompanies(req.user.id, { status, limit, offset }),
        researchDb.getStatusCounts(req.user.id),
      ]);

      res.json({ companies, counts });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/research/companies/:id', async (req, res) => {
    try {
      const detail = await researchDb.getCompanyDetail(req.user.id, req.params.id);
      if (!detail) {
        return res.status(404).json({ error: 'Company not found' });
      }
      return res.json(detail);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.patch('/research/companies/:id', async (req, res) => {
    try {
      const allowedStatus = new Set([
        'new', 'processing', 'processed', 'needs_review',
        'shortlisted', 'rejected', 'idea_generated',
      ]);

      const patch = {};

      if (req.body.status) {
        if (!allowedStatus.has(req.body.status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }
        patch.status = req.body.status;
      }

      if (req.body.user_note !== undefined) {
        patch.user_note = req.body.user_note;
      }

      if (req.body.tags !== undefined) {
        patch.tags = Array.isArray(req.body.tags)
          ? req.body.tags
          : String(req.body.tags || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const company = await researchDb.updateCompany(req.user.id, req.params.id, patch);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      return res.json({ company });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.post('/research/companies/:id/reanalyze', async (req, res) => {
    try {
      const company = await researchDb.getCompany(req.user.id, req.params.id);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      await researchDb.updateCompany(req.user.id, company.id, { status: 'processing' });
      const job = await researchDb.createJob(req.user.id, company.id, {
        job_type: 'full_research',
      });

      researchQueue.addJob({
        jobId: job.id,
        companyId: company.id,
        userId: req.user.id,
      });

      return res.status(201).json({
        company_id: company.id,
        research_job_id: job.id,
        status: job.status,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/research/stats', async (req, res) => {
    try {
      const counts = await researchDb.getStatusCounts(req.user.id);
      res.json({ counts, queue_length: researchQueue.getQueueLength() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = {
  createResearchRouter,
};
