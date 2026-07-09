const crypto = require('crypto');
const config = require('../config');
const { withUserContext, formatVector } = require('./pg-pool');
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
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
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
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
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

async function getProfileRow(userId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'SELECT * FROM user_profile WHERE user_id = $1 LIMIT 1',
      [userId],
    );
    return result.rows[0] ?? null;
  });
}

async function getOrCreateProfile(userId) {
  const existing = await getProfileRow(userId);
  if (existing) {
    return rowToProfile(existing);
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  return withUserContext(userId, async (client) => {
    await client.query(
      `INSERT INTO user_profile (
        id, user_id, created_at, updated_at,
        ai_quality_model, ai_chat_model, ai_reasoning_model, ai_deep_analysis_enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
      [
        id,
        userId,
        now,
        now,
        DEFAULT_AI_QUALITY_MODEL,
        DEFAULT_AI_CHAT_MODEL,
        DEFAULT_AI_REASONING_MODEL,
      ],
    );

    const result = await client.query(
      'SELECT * FROM user_profile WHERE user_id = $1 LIMIT 1',
      [userId],
    );
    return rowToProfile(result.rows[0]);
  });
}

async function getProfile(userId, { includeSecrets = false } = {}) {
  const row = await getProfileRow(userId);
  if (!row) {
    return emptyProfileDefaults();
  }

  return rowToProfile(row, { includeSecrets });
}

async function updateProfile(userId, fields) {
  const profile = await getOrCreateProfile(userId);
  const keys = Object.keys(fields).filter((key) => PROFILE_UPDATABLE.has(key));

  if (keys.length === 0) {
    return getProfile(userId);
  }

  const values = [profile.id, userId];
  const assignments = keys.map((key, index) => {
    const paramIndex = index + 3;

    if (key === 'skills') {
      values.push(stringifyJson(fields[key] ?? []));
      return `${key} = $${paramIndex}::jsonb`;
    }

    values.push(fields[key] ?? null);
    return `${key} = $${paramIndex}`;
  });

  const updatedAtIndex = keys.length + 3;
  assignments.push(`updated_at = $${updatedAtIndex}`);
  values.push(Date.now());

  await withUserContext(userId, async (client) => {
    await client.query(
      `UPDATE user_profile SET ${assignments.join(', ')} WHERE id = $1 AND user_id = $2`,
      values,
    );
  });

  return getProfile(userId);
}

async function updateAiSettings(userId, fields) {
  const profile = await getOrCreateProfile(userId);
  const keys = Object.keys(fields).filter((key) => AI_SETTINGS_UPDATABLE.has(key));

  if (keys.length === 0) {
    return getProfile(userId);
  }

  const values = [profile.id, userId];
  const assignments = keys.map((key, index) => {
    const paramIndex = index + 3;

    if (key === 'ai_deep_analysis_enabled') {
      values.push(Boolean(fields[key]));
    } else {
      values.push(fields[key] ?? null);
    }

    return `${key} = $${paramIndex}`;
  });

  const updatedAtIndex = keys.length + 3;
  assignments.push(`updated_at = $${updatedAtIndex}`);
  values.push(Date.now());

  await withUserContext(userId, async (client) => {
    await client.query(
      `UPDATE user_profile SET ${assignments.join(', ')} WHERE id = $1 AND user_id = $2`,
      values,
    );
  });

  return getProfile(userId);
}

async function listProjects(userId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM projects
       WHERE user_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [userId],
    );

    return result.rows.map(rowToProject);
  });
}

async function getProjectById(userId, id) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return rowToProject(result.rows[0]);
  });
}

async function getProjectEmbedding(userId, id) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'SELECT embedding FROM projects WHERE id = $1 AND user_id = $2',
      [id, userId],
    );

    if (!result.rows[0]?.embedding) {
      return null;
    }

    return parseJsonArray(result.rows[0].embedding);
  });
}

async function getNextProjectSortOrder(userId, client) {
  const result = await client.query(
    'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM projects WHERE user_id = $1',
    [userId],
  );
  return (result.rows[0]?.max_order ?? -1) + 1;
}

async function createProject(userId, input) {
  const id = crypto.randomUUID();
  const now = Date.now();

  return withUserContext(userId, async (client) => {
    const sortOrder = input.sort_order ?? await getNextProjectSortOrder(userId, client);

    await client.query(
      `INSERT INTO projects (
        id, user_id, name, tagline, description, tech_stack, impact_bullets,
        github_url, live_url, start_date, end_date, is_featured, sort_order,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb,
        $8, $9, $10, $11, $12, $13,
        $14, $15
      )`,
      [
        id,
        userId,
        input.name,
        input.tagline ?? null,
        input.description ?? null,
        stringifyJson(input.tech_stack ?? []),
        stringifyJson(input.impact_bullets ?? []),
        input.github_url ?? null,
        input.live_url ?? null,
        input.start_date ?? null,
        input.end_date ?? null,
        Boolean(input.is_featured),
        sortOrder,
        now,
        now,
      ],
    );

    const result = await client.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return rowToProject(result.rows[0]);
  });
}

async function updateProject(userId, id, fields) {
  const keys = Object.keys(fields).filter((key) => PROJECT_UPDATABLE.has(key));

  if (keys.length === 0) {
    return getProjectById(userId, id);
  }

  const values = [id, userId];
  const assignments = keys.map((key, index) => {
    const paramIndex = index + 3;

    if (key === 'tech_stack' || key === 'impact_bullets') {
      values.push(stringifyJson(fields[key] ?? []));
      return `${key} = $${paramIndex}::jsonb`;
    }

    if (key === 'is_featured') {
      values.push(Boolean(fields[key]));
    } else {
      values.push(fields[key] ?? null);
    }

    return `${key} = $${paramIndex}`;
  });

  const updatedAtIndex = keys.length + 3;
  assignments.push(`updated_at = $${updatedAtIndex}`);
  values.push(Date.now());

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `UPDATE projects SET ${assignments.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
      values,
    );

    if (result.rowCount === 0) {
      return null;
    }

    return rowToProject(result.rows[0]);
  });
}

async function updateProjectEmbedding(userId, id, embedding) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `UPDATE projects
       SET embedding = $3::vector, updated_at = $4
       WHERE id = $1 AND user_id = $2`,
      [id, userId, embedding ? formatVector(embedding) : null, Date.now()],
    );

    return result.rowCount > 0;
  });
}

async function deleteProject(userId, id) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'DELETE FROM projects WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return result.rowCount > 0;
  });
}

async function reorderProjects(userId, orderedIds) {
  return withUserContext(userId, async (client) => {
    const now = Date.now();

    for (let index = 0; index < orderedIds.length; index += 1) {
      await client.query(
        `UPDATE projects
         SET sort_order = $3, updated_at = $4
         WHERE id = $1 AND user_id = $2`,
        [orderedIds[index], userId, index, now],
      );
    }

    const result = await client.query(
      `SELECT * FROM projects
       WHERE user_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [userId],
    );

    return result.rows.map(rowToProject);
  });
}

async function getFireworksApiKey(userId) {
  const row = await getProfileRow(userId);

  if (row?.fireworks_api_key_enc) {
    try {
      return decrypt(row.fireworks_api_key_enc);
    } catch (error) {
      console.warn('Failed to decrypt stored Fireworks API key, falling back to env:', error.message);
    }
  }

  return config.FIREWORKS_API_KEY || process.env.FIREWORKS_API_KEY || null;
}

async function getAiModelSettings(userId) {
  const profile = await getProfile(userId);

  return {
    qualityModel: profile.ai_quality_model || DEFAULT_AI_QUALITY_MODEL,
    chatModel: profile.ai_chat_model || DEFAULT_AI_CHAT_MODEL,
    reasoningModel: profile.ai_reasoning_model || DEFAULT_AI_REASONING_MODEL,
    deepAnalysisEnabled: profile.ai_deep_analysis_enabled,
  };
}

function buildProjectEmbedText(_userId, project) {
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

function shouldReembedProject(_userId, previous, nextFields) {
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
