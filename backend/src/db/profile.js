const crypto = require('crypto');
const config = require('../config');
const { getDb } = require('./connection');
const { decrypt } = require('../utils/crypto-util');
const { parseJsonArray, stringifyJson } = require('./json-fields');

const PROFILE_UPDATABLE = new Set([
  'display_name',
  'headline',
  'github_url',
  'linkedin_url',
  'twitter_url',
  'website_url',
  'bio_short',
  'skills',
]);

const AI_SETTINGS_UPDATABLE = new Set([
  'fireworks_api_key_enc',
  'ai_quality_model',
  'ai_chat_model',
  'ai_reasoning_model',
  'ai_deep_analysis_enabled',
]);

const PROJECT_UPDATABLE = new Set([
  'name',
  'tagline',
  'description',
  'tech_stack',
  'impact_bullets',
  'github_url',
  'live_url',
  'start_date',
  'end_date',
  'is_featured',
  'sort_order',
]);

const DEFAULT_AI_QUALITY_MODEL = 'accounts/fireworks/models/deepseek-v3p1';
const DEFAULT_AI_CHAT_MODEL = 'accounts/fireworks/models/kimi-k2-instruct-0905';
const DEFAULT_AI_REASONING_MODEL = 'accounts/fireworks/models/glm-5p2';

function rowToProfile(row, { includeSecrets = false } = {}) {
  if (!row) {
    return null;
  }

  const profile = {
    id: row.id,
    display_name: row.display_name,
    headline: row.headline,
    github_url: row.github_url,
    linkedin_url: row.linkedin_url,
    twitter_url: row.twitter_url,
    website_url: row.website_url,
    bio_short: row.bio_short,
    skills: parseJsonArray(row.skills),
    ai_quality_model: row.ai_quality_model || DEFAULT_AI_QUALITY_MODEL,
    ai_chat_model: row.ai_chat_model || DEFAULT_AI_CHAT_MODEL,
    ai_reasoning_model: row.ai_reasoning_model || DEFAULT_AI_REASONING_MODEL,
    ai_deep_analysis_enabled: Boolean(row.ai_deep_analysis_enabled),
    has_fireworks_api_key: Boolean(row.fireworks_api_key_enc),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  if (includeSecrets) {
    profile.fireworks_api_key_enc = row.fireworks_api_key_enc;
  }

  return profile;
}

function rowToProject(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    tech_stack: parseJsonArray(row.tech_stack),
    impact_bullets: parseJsonArray(row.impact_bullets),
    github_url: row.github_url,
    live_url: row.live_url,
    start_date: row.start_date,
    end_date: row.end_date,
    is_featured: Boolean(row.is_featured),
    sort_order: row.sort_order ?? 0,
    has_embedding: Boolean(row.embedding),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function emptyProfileDefaults() {
  return {
    id: null,
    display_name: null,
    headline: null,
    github_url: null,
    linkedin_url: null,
    twitter_url: null,
    website_url: null,
    bio_short: null,
    skills: [],
    ai_quality_model: DEFAULT_AI_QUALITY_MODEL,
    ai_chat_model: DEFAULT_AI_CHAT_MODEL,
    ai_reasoning_model: DEFAULT_AI_REASONING_MODEL,
    ai_deep_analysis_enabled: false,
    has_fireworks_api_key: false,
    created_at: null,
    updated_at: null,
  };
}

function getProfileRow() {
  return getDb().prepare('SELECT * FROM user_profile ORDER BY created_at ASC LIMIT 1').get();
}

function getOrCreateProfile() {
  const existing = getProfileRow();
  if (existing) {
    return rowToProfile(existing);
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  getDb().prepare(`
    INSERT INTO user_profile (
      id, created_at, updated_at,
      ai_quality_model, ai_chat_model, ai_reasoning_model, ai_deep_analysis_enabled
    ) VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(
    id,
    now,
    now,
    DEFAULT_AI_QUALITY_MODEL,
    DEFAULT_AI_CHAT_MODEL,
    DEFAULT_AI_REASONING_MODEL,
  );

  return rowToProfile(getProfileRow());
}

function getProfile({ includeSecrets = false } = {}) {
  const row = getProfileRow();
  if (!row) {
    return emptyProfileDefaults();
  }

  return rowToProfile(row, { includeSecrets });
}

function updateProfile(fields) {
  const profile = getOrCreateProfile();
  const keys = Object.keys(fields).filter((key) => PROFILE_UPDATABLE.has(key));

  if (keys.length === 0) {
    return getProfile();
  }

  const params = { id: profile.id, updated_at: Date.now() };
  const assignments = ['updated_at = @updated_at'];

  for (const key of keys) {
    assignments.push(`${key} = @${key}`);
    params[key] = key === 'skills' ? stringifyJson(fields[key] ?? []) : (fields[key] ?? null);
  }

  getDb().prepare(`UPDATE user_profile SET ${assignments.join(', ')} WHERE id = @id`).run(params);
  return getProfile();
}

function updateAiSettings(fields) {
  const profile = getOrCreateProfile();
  const keys = Object.keys(fields).filter((key) => AI_SETTINGS_UPDATABLE.has(key));

  if (keys.length === 0) {
    return getProfile();
  }

  const params = { id: profile.id, updated_at: Date.now() };
  const assignments = ['updated_at = @updated_at'];

  for (const key of keys) {
    assignments.push(`${key} = @${key}`);

    if (key === 'ai_deep_analysis_enabled') {
      params[key] = fields[key] ? 1 : 0;
    } else {
      params[key] = fields[key] ?? null;
    }
  }

  getDb().prepare(`UPDATE user_profile SET ${assignments.join(', ')} WHERE id = @id`).run(params);
  return getProfile();
}

function listProjects() {
  const rows = getDb().prepare(`
    SELECT * FROM projects
    ORDER BY sort_order ASC, created_at ASC
  `).all();

  return rows.map(rowToProject);
}

function getProjectById(id) {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id);
  return rowToProject(row);
}

function getProjectEmbedding(id) {
  const row = getDb().prepare('SELECT embedding FROM projects WHERE id = ?').get(id);
  if (!row?.embedding) {
    return null;
  }

  return parseJsonArray(row.embedding);
}

function getNextProjectSortOrder() {
  const row = getDb().prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM projects').get();
  return (row?.max_order ?? -1) + 1;
}

function createProject(input) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const sortOrder = input.sort_order ?? getNextProjectSortOrder();

  getDb().prepare(`
    INSERT INTO projects (
      id, name, tagline, description, tech_stack, impact_bullets,
      github_url, live_url, start_date, end_date, is_featured, sort_order,
      created_at, updated_at
    ) VALUES (
      @id, @name, @tagline, @description, @tech_stack, @impact_bullets,
      @github_url, @live_url, @start_date, @end_date, @is_featured, @sort_order,
      @created_at, @updated_at
    )
  `).run({
    id,
    name: input.name,
    tagline: input.tagline ?? null,
    description: input.description ?? null,
    tech_stack: stringifyJson(input.tech_stack ?? []),
    impact_bullets: stringifyJson(input.impact_bullets ?? []),
    github_url: input.github_url ?? null,
    live_url: input.live_url ?? null,
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
    is_featured: input.is_featured ? 1 : 0,
    sort_order: sortOrder,
    created_at: now,
    updated_at: now,
  });

  return getProjectById(id);
}

function updateProject(id, fields) {
  const keys = Object.keys(fields).filter((key) => PROJECT_UPDATABLE.has(key));

  if (keys.length === 0) {
    return getProjectById(id);
  }

  const params = { id, updated_at: Date.now() };
  const assignments = ['updated_at = @updated_at'];

  for (const key of keys) {
    assignments.push(`${key} = @${key}`);

    if (key === 'tech_stack' || key === 'impact_bullets') {
      params[key] = stringifyJson(fields[key] ?? []);
    } else if (key === 'is_featured') {
      params[key] = fields[key] ? 1 : 0;
    } else {
      params[key] = fields[key] ?? null;
    }
  }

  const result = getDb().prepare(`UPDATE projects SET ${assignments.join(', ')} WHERE id = @id`).run(params);

  if (result.changes === 0) {
    return null;
  }

  return getProjectById(id);
}

function updateProjectEmbedding(id, embedding) {
  const result = getDb().prepare(`
    UPDATE projects
    SET embedding = @embedding, updated_at = @updated_at
    WHERE id = @id
  `).run({
    id,
    embedding: embedding ? stringifyJson(embedding) : null,
    updated_at: Date.now(),
  });

  return result.changes > 0;
}

function deleteProject(id) {
  const result = getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
  return result.changes > 0;
}

function reorderProjects(orderedIds) {
  const db = getDb();
  const reorder = db.transaction((ids) => {
    ids.forEach((projectId, index) => {
      db.prepare(`
        UPDATE projects
        SET sort_order = ?, updated_at = ?
        WHERE id = ?
      `).run(index, Date.now(), projectId);
    });
  });

  reorder(orderedIds);
  return listProjects();
}

function getFireworksApiKey() {
  const row = getProfileRow();

  if (row?.fireworks_api_key_enc) {
    try {
      return decrypt(row.fireworks_api_key_enc);
    } catch (error) {
      console.warn('Failed to decrypt stored Fireworks API key, falling back to env:', error.message);
    }
  }

  return config.FIREWORKS_API_KEY || process.env.FIREWORKS_API_KEY || null;
}

function getAiModelSettings() {
  const profile = getProfile();

  return {
    qualityModel: profile.ai_quality_model || DEFAULT_AI_QUALITY_MODEL,
    chatModel: profile.ai_chat_model || DEFAULT_AI_CHAT_MODEL,
    reasoningModel: profile.ai_reasoning_model || DEFAULT_AI_REASONING_MODEL,
    deepAnalysisEnabled: profile.ai_deep_analysis_enabled,
  };
}

function buildProjectEmbedText(project) {
  if (!project) {
    return '';
  }

  return [
    project.name,
    project.tagline || '',
    project.description || '',
    ...(project.impact_bullets || []),
  ].filter(Boolean).join(' ').trim();
}

function shouldReembedProject(previous, nextFields) {
  if (!previous) {
    return true;
  }

  if (Object.prototype.hasOwnProperty.call(nextFields, 'description')) {
    const nextDescription = nextFields.description ?? null;
    if (nextDescription !== previous.description) {
      return true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(nextFields, 'impact_bullets')) {
    const nextBullets = JSON.stringify(nextFields.impact_bullets ?? []);
    const previousBullets = JSON.stringify(previous.impact_bullets ?? []);
    if (nextBullets !== previousBullets) {
      return true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(nextFields, 'name')) {
    const nextName = nextFields.name ?? null;
    if (nextName !== previous.name) {
      return true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(nextFields, 'tagline')) {
    const nextTagline = nextFields.tagline ?? null;
    if (nextTagline !== previous.tagline) {
      return true;
    }
  }

  return false;
}

module.exports = {
  getProfile,
  getOrCreateProfile,
  updateProfile,
  updateAiSettings,
  listProjects,
  getProjectById,
  getProjectEmbedding,
  createProject,
  updateProject,
  updateProjectEmbedding,
  deleteProject,
  reorderProjects,
  buildProjectEmbedText,
  shouldReembedProject,
  getFireworksApiKey,
  getAiModelSettings,
};
