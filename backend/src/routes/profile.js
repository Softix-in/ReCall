const express = require('express');
const profileDb = require('../db/profile');
const careerDb = require('../db/career');
const { encrypt } = require('../utils/crypto-util');
const { sanitizeModelId, QUALITY_MODELS, CHAT_MODELS, REASONING_MODELS } = require('../services/fireworks-models');
const { createProjectEmbedEnqueuer } = require('../utils/project-embed');
const { LlmError, testApiKey, mapClientError } = require('../services/llm-client');
const { sendError, clientErrorMessage } = require('../utils/http-error');

function createProfileRouter(projectEmbedQueue) {
  const router = express.Router();
  const enqueueProjectEmbedding = createProjectEmbedEnqueuer(projectEmbedQueue);

  router.get('/profile', async (req, res) => {
    try {
      const userId = req.user.id;
      const user_profile = await profileDb.getProfile(userId);
      const projects = await profileDb.listProjects(userId);
      const master_resume = await careerDb.getMasterResume(userId);

      res.json({ user_profile, projects, master_resume });
    } catch (error) {
      sendError(res, error, 'Failed to load profile');
    }
  });

  router.put('/profile', async (req, res) => {
    try {
      const body = req.body || {};

      if (body.skills !== undefined && !Array.isArray(body.skills)) {
        res.status(400).json({ error: 'skills must be an array of strings' });
        return;
      }

      const user_profile = await profileDb.updateProfile(req.user.id, body);
      res.json({ user_profile });
    } catch (error) {
      sendError(res, error, 'Failed to update profile');
    }
  });

  router.put('/profile/ai-settings', async (req, res) => {
    try {
      const body = req.body || {};
      const updates = {};

      if (body.fireworks_api_key !== undefined) {
        const trimmed = typeof body.fireworks_api_key === 'string'
          ? body.fireworks_api_key.trim()
          : '';

        updates.fireworks_api_key_enc = trimmed ? encrypt(trimmed) : null;
      }

      if (body.ai_quality_model !== undefined) {
        updates.ai_quality_model = sanitizeModelId(body.ai_quality_model, QUALITY_MODELS);
      }

      if (body.ai_chat_model !== undefined) {
        updates.ai_chat_model = sanitizeModelId(body.ai_chat_model, CHAT_MODELS);
      }

      if (body.ai_reasoning_model !== undefined) {
        updates.ai_reasoning_model = sanitizeModelId(body.ai_reasoning_model, REASONING_MODELS);
      }

      if (body.ai_deep_analysis_enabled !== undefined) {
        updates.ai_deep_analysis_enabled = Boolean(body.ai_deep_analysis_enabled);
      }

      const user_profile = await profileDb.updateAiSettings(req.user.id, updates);
      res.json({ user_profile });
    } catch (error) {
      sendError(res, error, 'Failed to update AI settings');
    }
  });

  router.post('/profile/ai-settings/test', async (req, res) => {
    try {
      const body = req.body || {};
      let apiKey = null;

      if (body.fireworks_api_key !== undefined) {
        const trimmed = typeof body.fireworks_api_key === 'string'
          ? body.fireworks_api_key.trim()
          : '';
        apiKey = trimmed || null;
      } else {
        apiKey = await profileDb.getFireworksApiKey(req.user.id);
      }

      if (!apiKey) {
        res.status(400).json({ ok: false, error: 'missing_api_key' });
        return;
      }

      const result = await testApiKey(apiKey);
      res.json(result);
    } catch (error) {
      if (error instanceof LlmError) {
        const status = error.code === 'invalid_api_key' ? 401 : (error.status || 502);
        res.status(status).json({
          ok: false,
          error: error.code === 'invalid_api_key' ? 'invalid_api_key' : clientErrorMessage(error, 'API key test failed'),
        });
        return;
      }

      const mapped = mapClientError(error);
      res.status(mapped.status || 502).json({ ok: false, error: mapped.message });
    }
  });

  router.get('/profile/projects', async (req, res) => {
    try {
      res.json({ projects: await profileDb.listProjects(req.user.id) });
    } catch (error) {
      sendError(res, error, 'Failed to list projects');
    }
  });

  router.post('/profile/projects', async (req, res) => {
    try {
      const userId = req.user.id;
      const body = req.body || {};

      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        res.status(400).json({ error: 'name is required' });
        return;
      }

      if (body.tech_stack !== undefined && !Array.isArray(body.tech_stack)) {
        res.status(400).json({ error: 'tech_stack must be an array of strings' });
        return;
      }

      if (body.impact_bullets !== undefined && !Array.isArray(body.impact_bullets)) {
        res.status(400).json({ error: 'impact_bullets must be an array of strings' });
        return;
      }

      const project = await profileDb.createProject(userId, {
        name: body.name.trim(),
        tagline: body.tagline,
        description: body.description,
        tech_stack: body.tech_stack,
        impact_bullets: body.impact_bullets,
        github_url: body.github_url,
        live_url: body.live_url,
        start_date: body.start_date,
        end_date: body.end_date,
        is_featured: body.is_featured,
      });

      enqueueProjectEmbedding(userId, project.id);
      res.status(201).json({ project });
    } catch (error) {
      sendError(res, error, 'Failed to create project');
    }
  });

  router.put('/profile/projects/reorder', async (req, res) => {
    try {
      const userId = req.user.id;
      const orderedIds = req.body?.ordered_ids;

      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        res.status(400).json({ error: 'ordered_ids must be a non-empty array' });
        return;
      }

      const existingProjects = await profileDb.listProjects(userId);
      const existingIds = new Set(existingProjects.map((project) => project.id));
      const invalidId = orderedIds.find((id) => !existingIds.has(id));

      if (invalidId) {
        res.status(400).json({ error: `Unknown project id: ${invalidId}` });
        return;
      }

      if (orderedIds.length !== existingProjects.length) {
        res.status(400).json({ error: 'ordered_ids must include every project exactly once' });
        return;
      }

      const uniqueIds = new Set(orderedIds);
      if (uniqueIds.size !== orderedIds.length) {
        res.status(400).json({ error: 'ordered_ids must not contain duplicates' });
        return;
      }

      const projects = await profileDb.reorderProjects(userId, orderedIds);
      res.json({ projects });
    } catch (error) {
      sendError(res, error, 'Failed to reorder projects');
    }
  });

  router.put('/profile/projects/:id', async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const existing = await profileDb.getProjectById(userId, id);

      if (!existing) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const body = req.body || {};

      if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
        res.status(400).json({ error: 'name must be a non-empty string' });
        return;
      }

      if (body.tech_stack !== undefined && !Array.isArray(body.tech_stack)) {
        res.status(400).json({ error: 'tech_stack must be an array of strings' });
        return;
      }

      if (body.impact_bullets !== undefined && !Array.isArray(body.impact_bullets)) {
        res.status(400).json({ error: 'impact_bullets must be an array of strings' });
        return;
      }

      const updates = { ...body };
      if (updates.name) {
        updates.name = updates.name.trim();
      }

      const shouldReembed = profileDb.shouldReembedProject(userId, existing, updates);
      const project = await profileDb.updateProject(userId, id, updates);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      if (shouldReembed) {
        enqueueProjectEmbedding(userId, project.id);
      }

      res.json({ project });
    } catch (error) {
      sendError(res, error, 'Failed to update project');
    }
  });

  router.delete('/profile/projects/:id', async (req, res) => {
    try {
      const deleted = await profileDb.deleteProject(req.user.id, req.params.id);

      if (!deleted) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      sendError(res, error, 'Failed to delete project');
    }
  });

  router.get('/profile/resume', async (req, res) => {
    try {
      const resume = await careerDb.getMasterResume(req.user.id);
      res.json({ resume });
    } catch (error) {
      sendError(res, error, 'Failed to load resume');
    }
  });

  router.post('/profile/resume', async (req, res) => {
    try {
      const body = req.body || {};

      if (body.experience !== undefined && !Array.isArray(body.experience)) {
        res.status(400).json({ error: 'experience must be an array' });
        return;
      }

      if (body.education !== undefined && !Array.isArray(body.education)) {
        res.status(400).json({ error: 'education must be an array' });
        return;
      }

      if (body.certifications !== undefined && !Array.isArray(body.certifications)) {
        res.status(400).json({ error: 'certifications must be an array' });
        return;
      }

      const resume = await careerDb.upsertMasterResume(req.user.id, {
        experience: body.experience,
        education: body.education,
        certifications: body.certifications,
        label: body.label,
      });

      res.json({ resume });
    } catch (error) {
      sendError(res, error, 'Failed to save resume');
    }
  });

  router.get('/profile/resume/history', async (req, res) => {
    try {
      const resumes = await careerDb.listResumeHistory(req.user.id);
      res.json({ resumes });
    } catch (error) {
      sendError(res, error, 'Failed to list resume history');
    }
  });

  router.get('/profile/resume/:id', async (req, res) => {
    try {
      const resume = await careerDb.getResumeById(req.user.id, req.params.id);

      if (!resume) {
        res.status(404).json({ error: 'Resume not found' });
        return;
      }

      res.json({ resume });
    } catch (error) {
      sendError(res, error, 'Failed to load resume');
    }
  });

  return router;
}

module.exports = {
  createProfileRouter,
};
