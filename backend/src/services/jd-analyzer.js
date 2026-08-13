const crypto = require('crypto');
const profileDb = require('../db/profile');
const careerDb = require('../db/career');
const embedClient = require('./embed-client');
const { LlmError, completeStructured, streamCompletion, resolveExtractionModel } = require('./llm-client');

const JD_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    role_title: { type: 'string' },
    company_name: { type: 'string' },
    seniority_level: {
      type: 'string',
      enum: ['intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'unknown'],
    },
    required_skills: { type: 'array', items: { type: 'string' } },
    preferred_skills: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
    ats_keywords: { type: 'array', items: { type: 'string' } },
  },
  required: ['role_title', 'required_skills', 'keywords', 'ats_keywords'],
  additionalProperties: false,
};

const TOP_PROJECTS_FOR_BULLETS = 5;

function hashJdText(jdText) {
  return crypto.createHash('sha256').update(jdText.trim()).digest('hex');
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function sendSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function parseBulletsFromStream(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/^[\s\-•*\d.)]+/, '').trim())
    .filter(Boolean);
}

function buildExtractionPrompt(jdText) {
  return `Analyze this job description and extract structured hiring signals for ATS resume tailoring.

Return JSON with:
- role_title
- company_name (or "unknown")
- seniority_level
- required_skills
- preferred_skills
- keywords (important technical and domain terms)
- ats_keywords (exact short phrases likely used by ATS filters)

Job description:
"""
${jdText.trim()}
"""`;
}

function buildBulletRewritePrompt({ project, jdText, extraction }) {
  const keywords = [
    ...(extraction.ats_keywords || []),
    ...(extraction.required_skills || []),
    ...(extraction.keywords || []),
  ].slice(0, 20).join(', ');

  const originals = (project.impact_bullets || []).map((bullet) => `- ${bullet}`).join('\n');

  return `Rewrite these resume project bullets to be ATS-friendly for the job below.
Use strong action verbs and naturally include relevant keywords where truthful.
Keep each bullet concise (one line). Output ONLY rewritten bullets, one per line, no numbering.

Job title: ${extraction.role_title || 'Unknown role'}
Company: ${extraction.company_name || 'Unknown'}
Priority ATS keywords: ${keywords}

Project: ${project.name}
${project.tagline ? `Tagline: ${project.tagline}` : ''}
Tech stack: ${(project.tech_stack || []).join(', ')}

Original bullets:
${originals || '- No bullets provided'}

Job description excerpt:
${jdText.trim().slice(0, 2500)}`;
}

async function extractJdFields(jdText, { userId, deepMode = false } = {}) {
  return completeStructured({
    userId,
    prompt: buildExtractionPrompt(jdText),
    schema: JD_EXTRACTION_SCHEMA,
    schemaName: 'jd_extraction',
    model: await resolveExtractionModel({ userId, deepMode }),
  });
}

function extractJdFieldsRegex(jdText) {
  const text = jdText.trim();
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] || '';

  let role_title = 'Unknown role';
  if (firstLine && firstLine.length < 120) {
    role_title = firstLine.replace(/^[^A-Za-z0-9]+/, '').trim() || role_title;
  }

  const techMatches = text.match(
    /\b(?:Node\.?js|TypeScript|JavaScript|Python|React|AWS|Docker|Kubernetes|PostgreSQL|SQL|REST|GraphQL|Java|Go|Rust|C\+\+|Swift|Kotlin|Angular|Vue|Redis|MongoDB|Git)\b/gi,
  ) || [];

  const required_skills = [...new Set(techMatches.map((term) => {
    const normalized = term.toLowerCase();
    if (normalized === 'nodejs' || normalized === 'node.js') {
      return 'Node.js';
    }
    return term.charAt(0).toUpperCase() + term.slice(1);
  }))];

  const words = text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((word) => word.length > 3);

  const keywords = [...new Set(words)].slice(0, 30);
  const ats_keywords = keywords.slice(0, 15);

  let seniority_level = 'unknown';
  if (/\b(principal|staff)\b/i.test(text)) {
    seniority_level = 'staff';
  } else if (/\bsenior\b/i.test(text)) {
    seniority_level = 'senior';
  } else if (/\b(junior|entry)\b/i.test(text)) {
    seniority_level = 'junior';
  } else if (/\bintern\b/i.test(text)) {
    seniority_level = 'intern';
  }

  return {
    role_title,
    company_name: 'unknown',
    seniority_level,
    required_skills,
    preferred_skills: [],
    keywords,
    ats_keywords,
    keyword_only: true,
  };
}

async function scoreProjects(userId, jdText) {
  let jdEmbedding = null;

  try {
    jdEmbedding = await embedClient.embedText(jdText);
  } catch (error) {
    console.error(`JD embedding failed: ${error.message}`);
  }

  const projects = await profileDb.listProjects(userId);
  const projectScores = {};
  const scored = [];

  for (const project of projects) {
    let score = 0;

    if (jdEmbedding) {
      const projectEmbedding = await profileDb.getProjectEmbedding(userId, project.id);
      if (projectEmbedding?.length) {
        score = cosineSimilarity(jdEmbedding, projectEmbedding);
      }
    }

    if (score === 0) {
      const haystack = [
        project.name,
        project.tagline,
        project.description,
        ...(project.tech_stack || []),
        ...(project.impact_bullets || []),
      ].join(' ').toLowerCase();

      const terms = jdText.toLowerCase().split(/[^a-z0-9+#.]+/).filter((term) => term.length > 2);
      const uniqueTerms = [...new Set(terms)].slice(0, 40);
      let hits = 0;

      for (const term of uniqueTerms) {
        if (haystack.includes(term)) {
          hits += 1;
        }
      }

      score = uniqueTerms.length ? hits / uniqueTerms.length : 0;
    }

    projectScores[project.id] = Number(score.toFixed(4));
    scored.push({ project, score: projectScores[project.id] });
  }

  scored.sort((a, b) => b.score - a.score);

  return {
    project_scores: projectScores,
    suggested_project_order: scored.map((entry) => entry.project.id),
    ranked_projects: scored,
  };
}

async function enrichAnalysis(userId, analysis) {
  const projectsById = new Map(
    (await profileDb.listProjects(userId)).map((project) => [project.id, project]),
  );

  const ranked_projects = (analysis.suggested_project_order || []).map((projectId) => {
    const project = projectsById.get(projectId);
    return {
      id: projectId,
      name: project?.name || 'Unknown project',
      tagline: project?.tagline || null,
      score: analysis.project_scores?.[projectId] ?? 0,
      original_bullets: project?.impact_bullets || [],
      tailored_bullets: analysis.tailored_bullets?.[projectId] || [],
    };
  });

  return {
    ...analysis,
    ranked_projects,
    keyword_only: analysis.reasoning_trace === 'keyword_only_fallback',
  };
}

function getExpectedBulletProjectIds(analysis) {
  const order = analysis?.suggested_project_order || [];
  return order.slice(0, TOP_PROJECTS_FOR_BULLETS);
}

function isAnalysisComplete(cached) {
  if (!cached) {
    return false;
  }

  if (cached.reasoning_trace === 'keyword_only_fallback') {
    return true;
  }

  const expectedIds = getExpectedBulletProjectIds(cached);

  if (expectedIds.length === 0) {
    return true;
  }

  const bullets = cached.tailored_bullets || {};
  return expectedIds.every((id) => Array.isArray(bullets[id]) && bullets[id].length > 0);
}

function shouldUseCachedAnalysis(cached, hasApiKey) {
  if (!isAnalysisComplete(cached)) {
    return false;
  }

  const cachedKeywordOnly = cached.reasoning_trace === 'keyword_only_fallback';
  const currentKeywordOnly = !hasApiKey;

  if (cachedKeywordOnly !== currentKeywordOnly) {
    return false;
  }

  return true;
}

async function rewriteProjectBullets({
  userId,
  project,
  jdText,
  extraction,
  onBulletStart,
  onBulletToken,
  onBulletEnd,
}) {
  onBulletStart?.(project.id);

  const streamed = await streamCompletion({
    userId,
    messages: [{ role: 'user', content: buildBulletRewritePrompt({ project, jdText, extraction }) }],
    temperature: 0.35,
    onToken: (token) => onBulletToken?.(project.id, token),
  });

  const tailored = parseBulletsFromStream(streamed);
  onBulletEnd?.(project.id, tailored);

  return tailored;
}

async function analyzeJd({
  userId,
  jdText,
  streamBullets = false,
  res = null,
  deepMode = false,
}) {
  const trimmed = jdText?.trim();

  if (!trimmed) {
    throw new LlmError('jd_text is required', { code: 'validation_error', status: 400 });
  }

  if (!userId) {
    throw new LlmError('userId is required', { code: 'validation_error', status: 400 });
  }

  const hasApiKey = Boolean(await profileDb.getFireworksApiKey(userId));
  let keywordOnly = !hasApiKey;

  const jd_hash = hashJdText(trimmed);
  const cached = await careerDb.getJdAnalysisByHash(userId, jd_hash);

  if (cached && shouldUseCachedAnalysis(cached, hasApiKey)) {
    const enriched = await enrichAnalysis(userId, cached);

    if (streamBullets && res) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      sendSse(res, { type: 'progress', stage: 'cached' });
      sendSse(res, { type: 'analysis', analysis: enriched });
      sendSse(res, { type: 'done', analysis: enriched });
      res.end();
      return enriched;
    }

    return enriched;
  }

  const emit = (payload) => {
    if (streamBullets && res) {
      sendSse(res, payload);
    }
  };

  if (streamBullets && res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  }

  emit({ type: 'progress', stage: 'extracting' });

  let extraction;

  if (keywordOnly) {
    extraction = extractJdFieldsRegex(trimmed);
  } else {
    try {
      extraction = await extractJdFields(trimmed, { userId, deepMode });
    } catch (error) {
      if (error instanceof LlmError && error.code === 'invalid_api_key') {
        throw error;
      }

      if (error instanceof LlmError && error.code !== 'validation_error') {
        keywordOnly = true;
        extraction = extractJdFieldsRegex(trimmed);
        emit({ type: 'progress', stage: 'fallback' });
      } else {
        throw error;
      }
    }
  }

  emit({ type: 'progress', stage: 'scoring' });
  const scoring = await scoreProjects(userId, trimmed);

  const analysisId = cached?.id || crypto.randomUUID();
  const tailored_bullets = { ...(cached?.tailored_bullets || {}) };

  const baseAnalysis = {
    id: analysisId,
    jd_text: trimmed,
    jd_hash,
    extracted_keywords: extraction.keywords || [],
    ats_keywords: extraction.ats_keywords || [],
    required_skills: extraction.required_skills || [],
    preferred_skills: extraction.preferred_skills || [],
    seniority_level: extraction.seniority_level || 'unknown',
    company_name: extraction.company_name || null,
    role_title: extraction.role_title || null,
    project_scores: scoring.project_scores,
    suggested_project_order: scoring.suggested_project_order,
    tailored_bullets,
    reasoning_trace: keywordOnly ? 'keyword_only_fallback' : null,
    created_at: cached?.created_at || Date.now(),
  };

  await careerDb.saveJdAnalysis(userId, baseAnalysis);

  const partial = await enrichAnalysis(userId, baseAnalysis);
  emit({ type: 'analysis', analysis: partial });

  const projects = await profileDb.listProjects(userId);

  if (projects.length === 0 || keywordOnly) {
    const finalAnalysis = await enrichAnalysis(userId, {
      ...(await careerDb.getJdAnalysisById(userId, analysisId)),
      keyword_only: keywordOnly,
    });
    emit({ type: 'done', analysis: finalAnalysis });
    if (streamBullets && res) {
      res.end();
    }
    return finalAnalysis;
  }

  emit({ type: 'progress', stage: 'rewriting' });

  const topProjects = scoring.ranked_projects
    .slice(0, TOP_PROJECTS_FOR_BULLETS)
    .map((entry) => entry.project)
    .filter(Boolean);

  for (const project of topProjects) {
    const rewritten = await rewriteProjectBullets({
      userId,
      project,
      jdText: trimmed,
      extraction,
      onBulletStart: (projectId) => emit({ type: 'bullet_start', project_id: projectId }),
      onBulletToken: (projectId, text) => emit({ type: 'bullet_token', project_id: projectId, text }),
      onBulletEnd: (projectId, bullets) => emit({ type: 'bullet_end', project_id: projectId, bullets }),
    });

    tailored_bullets[project.id] = rewritten;
    await careerDb.updateJdAnalysisTailoredBullets(userId, analysisId, tailored_bullets);
  }

  const finalRow = await careerDb.getJdAnalysisById(userId, analysisId);
  const finalAnalysis = await enrichAnalysis(userId, finalRow);
  emit({ type: 'done', analysis: finalAnalysis });

  if (streamBullets && res) {
    res.end();
  }

  return finalAnalysis;
}

module.exports = {
  analyzeJd,
  hashJdText,
  enrichAnalysis,
  extractJdFieldsRegex,
  JD_EXTRACTION_SCHEMA,
};
