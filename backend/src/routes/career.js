const express = require('express');
const { analyzeJd, enrichAnalysis } = require('../services/jd-analyzer');
const { buildOrExportResume } = require('../services/resume-builder');
const { generateBio, generatePitch, generateCoverLetter } = require('../services/form-generator');
const { handleChat } = require('../services/chat-handler');
const { handleLlmError, sendAnalyzeError } = require('../utils/llm-route-helpers');
const { sendError } = require('../utils/http-error');
const {
  analyzeJdLimiter,
  chatLimiter,
  buildResumeLimiter,
} = require('../middleware/career-rate-limit');
const careerDb = require('../db/career');

function createCareerRouter({ projectEmbedQueue } = {}) {
  const router = express.Router();

  router.post('/career/analyze-jd', analyzeJdLimiter, async (req, res) => {
    const streamBullets = req.body?.stream_bullets !== false;
    const deepMode = req.body?.deep_mode === true;

    try {
      const jdText = req.body?.jd_text;

      if (!jdText || typeof jdText !== 'string' || !jdText.trim()) {
        res.status(400).json({ error: 'jd_text is required' });
        return;
      }

      const analysis = await analyzeJd({
        userId: req.user.id,
        jdText,
        streamBullets,
        res: streamBullets ? res : null,
        deepMode,
      });

      if (!streamBullets) {
        res.json({ analysis });
      }
    } catch (error) {
      if (sendAnalyzeError(res, error, streamBullets)) {
        return;
      }

      if (handleLlmError(res, error)) {
        return;
      }

      if (!res.headersSent) {
        sendError(res, error, 'Failed to analyze job description');
      }
    }
  });

  router.get('/career/analyses', async (req, res) => {
    try {
      const analyses = await careerDb.listJdAnalyses(req.user.id);
      res.json({ analyses });
    } catch (error) {
      sendError(res, error, 'Failed to list analyses');
    }
  });

  router.get('/career/analyses/:id', async (req, res) => {
    try {
      const analysis = await careerDb.getJdAnalysisById(req.user.id, req.params.id);

      if (!analysis) {
        res.status(404).json({ error: 'Analysis not found' });
        return;
      }

      res.json({ analysis: await enrichAnalysis(req.user.id, analysis) });
    } catch (error) {
      sendError(res, error, 'Failed to load analysis');
    }
  });

  router.post('/career/build-resume', buildResumeLimiter, async (req, res) => {
    try {
      const body = req.body || {};
      const format = body.format || 'json';
      const resumeId = body.resume_id;
      const jdAnalysisId = body.jd_analysis_id;

      if (!resumeId && !jdAnalysisId) {
        res.status(400).json({ error: 'jd_analysis_id or resume_id is required' });
        return;
      }

      if (!['json', 'text', 'pdf'].includes(format)) {
        res.status(400).json({ error: 'format must be json, text, or pdf' });
        return;
      }

      const result = await buildOrExportResume({
        userId: req.user.id,
        resume_id: resumeId,
        jd_analysis_id: jdAnalysisId,
        selected_project_ids: Array.isArray(body.selected_project_ids) ? body.selected_project_ids : [],
        format,
      });

      if (format === 'pdf') {
        const filename = `resume-${result.resume_id}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('X-Resume-Id', result.resume_id);
        res.send(result.pdf);
        return;
      }

      if (format === 'text') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('X-Resume-Id', result.resume_id);
        res.send(result.plain_text || '');
        return;
      }

      res.json({
        resume_id: result.resume_id,
        resume: result.resume,
        json: result.json,
        plain_text: result.plain_text,
      });
    } catch (error) {
      if (handleLlmError(res, error)) {
        return;
      }

      sendError(res, error, 'Failed to build resume');
    }
  });

  router.post('/career/generate/bio', async (req, res) => {
    try {
      const result = await generateBio({ userId: req.user.id, ...req.body });
      res.json(result);
    } catch (error) {
      if (handleLlmError(res, error)) {
        return;
      }

      sendError(res, error, 'Failed to generate bio');
    }
  });

  router.post('/career/generate/pitch', async (req, res) => {
    try {
      const result = await generatePitch({ userId: req.user.id, ...req.body });
      res.json(result);
    } catch (error) {
      if (handleLlmError(res, error)) {
        return;
      }

      sendError(res, error, 'Failed to generate pitch');
    }
  });

  router.post('/career/generate/cover-letter', async (req, res) => {
    try {
      await generateCoverLetter({
        userId: req.user.id,
        jd_analysis_id: req.body?.jd_analysis_id,
        tone: req.body?.tone,
        res,
      });
    } catch (error) {
      if (!res.headersSent && handleLlmError(res, error)) {
        return;
      }

      if (!res.headersSent) {
        sendError(res, error, 'Failed to generate cover letter');
      }
    }
  });

  router.post('/career/chat', chatLimiter, async (req, res) => {
    try {
      const messages = req.body?.messages;

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'messages array is required' });
        return;
      }

      const result = await handleChat(messages, { userId: req.user.id, projectEmbedQueue });
      res.json(result);
    } catch (error) {
      if (handleLlmError(res, error)) {
        return;
      }

      sendError(res, error, 'Failed to process chat');
    }
  });

  return router;
}

module.exports = {
  createCareerRouter,
};
