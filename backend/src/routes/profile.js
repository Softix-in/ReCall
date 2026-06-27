const express = require('express');
const profileDb = require('../db/profile');
const careerDb = require('../db/career');
const { encrypt } = require('../utils/crypto-util');
const { createProjectEmbedEnqueuer } = require('../utils/project-embed');
const { LlmError, testApiKey, mapClientError } = require('../services/llm-client');

function createProfileRouter(projectEmbedQueue) {
  const router = express.Router();
  const enqueueProjectEmbedding = createProjectEmbedEnqueuer(projectEmbedQueue);

  router.get('/profile', (req, res) => {
    try {
      const user_profile = profileDb.getProfile();
      const projects = profileDb.listProjects();
      const master_resume = careerDb.getMasterResume();

      res.json({ user_profile, projects, master_resume });
    } catch (error) {
      console.error('GET /profile failed:', error);
      res.status(500).json({ error: 'Failed to load profile', detail: error.message });
    }
  });

  router.put('/profile', (req, res) => {
    try {
      const body = req.body || {};

      if (body.skills !== undefined && !Array.isArray(body.skills)) {
        res.status(400).json({ error: 'skills must be an array of strings' });
        return;
      }

      const user_profile = profileDb.updateProfile(body);
      res.json({ user_profile });
    } catch (error) {
      console.error('PUT /profile failed:', error);
      res.status(500).json({ error: 'Failed to update profile', detail: error.message });
    }
  });

  router.put('/profile/ai-settings', (req, res) => {
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
        updates.ai_quality_model = body.ai_quality_model || null;
      }

      if (body.ai_chat_model !== undefined) {
        updates.ai_chat_model = body.ai_chat_model || null;
      }

      if (body.ai_reasoning_model !== undefined) {
        updates.ai_reasoning_model = body.ai_reasoning_model || null;
      }

      if (body.ai_deep_analysis_enabled !== undefined) {
        updates.ai_deep_analysis_enabled = Boolean(body.ai_deep_analysis_enabled);
      }

      const user_profile = profileDb.updateAiSettings(updates);
      res.json({ user_profile });
    } catch (error) {
      console.error('PUT /profile/ai-settings failed:', error);
      res.status(500).json({ error: 'Failed to update AI settings', detail: error.message });
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
        apiKey = profileDb.getFireworksApiKey();
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
          error: error.code === 'invalid_api_key' ? 'invalid_api_key' : error.message,
        });
        return;
      }

      const mapped = mapClientError(error);
      res.status(mapped.status || 502).json({ ok: false, error: mapped.message });
    }
  });

  router.get('/profile/projects', (req, res) => {
    try {
      res.json({ projects: profileDb.listProjects() });
    } catch (error) {
      console.error('GET /profile/projects failed:', error);
      res.status(500).json({ error: 'Failed to list projects', detail: error.message });
    }
  });

  router.post('/profile/projects', (req, res) => {
    try {
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

      const project = profileDb.createProject({
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

      enqueueProjectEmbedding(project.id);
      res.status(201).json({ project });
    } catch (error) {
      console.error('POST /profile/projects failed:', error);
      res.status(500).json({ error: 'Failed to create project', detail: error.message });
    }
  });

  router.put('/profile/projects/reorder', (req, res) => {
    try {
      const orderedIds = req.body?.ordered_ids;

      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        res.status(400).json({ error: 'ordered_ids must be a non-empty array' });
        return;
      }

      const existingProjects = profileDb.listProjects();
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

      const projects = profileDb.reorderProjects(orderedIds);
      res.json({ projects });
    } catch (error) {
      console.error('PUT /profile/projects/reorder failed:', error);
      res.status(500).json({ error: 'Failed to reorder projects', detail: error.message });
    }
  });

  router.put('/profile/projects/:id', (req, res) => {
    try {
      const { id } = req.params;
      const existing = profileDb.getProjectById(id);

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

      const shouldReembed = profileDb.shouldReembedProject(existing, updates);
      const project = profileDb.updateProject(id, updates);

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      if (shouldReembed) {
        enqueueProjectEmbedding(project.id);
      }

      res.json({ project });
    } catch (error) {
      console.error('PUT /profile/projects/:id failed:', error);
      res.status(500).json({ error: 'Failed to update project', detail: error.message });
    }
  });

  router.delete('/profile/projects/:id', (req, res) => {
    try {
      const deleted = profileDb.deleteProject(req.params.id);

      if (!deleted) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('DELETE /profile/projects/:id failed:', error);
      res.status(500).json({ error: 'Failed to delete project', detail: error.message });
    }
  });

  router.get('/profile/resume', (req, res) => {
    try {
      const resume = careerDb.getMasterResume();
      res.json({ resume });
    } catch (error) {
      console.error('GET /profile/resume failed:', error);
      res.status(500).json({ error: 'Failed to load resume', detail: error.message });
    }
  });

  router.post('/profile/resume', (req, res) => {
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

      const resume = careerDb.upsertMasterResume({
        experience: body.experience,
        education: body.education,
        certifications: body.certifications,
        label: body.label,
      });

      res.json({ resume });
    } catch (error) {
      console.error('POST /profile/resume failed:', error);
      res.status(500).json({ error: 'Failed to save resume', detail: error.message });
    }
  });

  router.get('/profile/resume/history', (req, res) => {
    try {
      const resumes = careerDb.listResumeHistory();
      res.json({ resumes });
    } catch (error) {
      console.error('GET /profile/resume/history failed:', error);
      res.status(500).json({ error: 'Failed to list resume history', detail: error.message });
    }
  });

  router.get('/profile/resume/:id', (req, res) => {
    try {
      const resume = careerDb.getResumeById(req.params.id);

      if (!resume) {
        res.status(404).json({ error: 'Resume not found' });
        return;
      }

      res.json({ resume });
    } catch (error) {
      console.error('GET /profile/resume/:id failed:', error);
      res.status(500).json({ error: 'Failed to load resume', detail: error.message });
    }
  });

  return router;
}

module.exports = {
  createProfileRouter,
};
