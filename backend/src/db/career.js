const crypto = require('crypto');
const { withUserContext } = require('./pg-pool');
const { parseJsonArray, parseJsonObject } = require('./json-fields');

function rowToResume(row) {
  if (!row) {
    return null;
  }

  const experiencePayload = parseExperienceField(row.experience);

  return {
    id: row.id,
    version: row.version,
    is_master: Boolean(row.is_master),
    label: row.label,
    summary: experiencePayload.summary,
    skills_section: experiencePayload.skills_section,
    experience: experiencePayload.experience,
    education: parseJsonArray(row.education),
    certifications: parseJsonArray(row.certifications),
    jd_analysis_id: row.jd_analysis_id,
    role_title: row.role_title || null,
    company_name: row.company_name || null,
    created_at: Number(row.created_at),
  };
}

function parseExperienceField(raw) {
  const parsed = parseJsonObject(raw);

  if (parsed && parsed._tailored) {
    return {
      summary: parsed.summary || '',
      skills_section: parsed.skills_section || [],
      experience: parseJsonArray(parsed.experience),
    };
  }

  return {
    summary: '',
    skills_section: [],
    experience: parseJsonArray(raw),
  };
}

function parseKeywordFields(raw) {
  const parsed = parseJsonObject(raw);

  if (parsed && !Array.isArray(parsed) && (parsed.keywords || parsed.ats_keywords)) {
    return {
      extracted_keywords: parsed.keywords || [],
      ats_keywords: parsed.ats_keywords || [],
    };
  }

  const keywords = parseJsonArray(raw);
  return {
    extracted_keywords: keywords,
    ats_keywords: [],
  };
}

function rowToJdAnalysis(row) {
  if (!row) {
    return null;
  }

  const keywordFields = parseKeywordFields(row.extracted_keywords);

  return {
    id: row.id,
    jd_text: row.jd_text,
    jd_hash: row.jd_hash,
    extracted_keywords: keywordFields.extracted_keywords,
    ats_keywords: keywordFields.ats_keywords,
    required_skills: parseJsonArray(row.required_skills),
    preferred_skills: parseJsonArray(row.preferred_skills),
    seniority_level: row.seniority_level,
    company_name: row.company_name,
    role_title: row.role_title,
    project_scores: parseJsonObject(row.project_scores, {}),
    suggested_project_order: parseJsonArray(row.suggested_project_order),
    tailored_bullets: parseJsonObject(row.tailored_bullets, {}),
    reasoning_trace: row.reasoning_trace,
    created_at: Number(row.created_at),
  };
}

async function getNextResumeVersion(client, userId) {
  const result = await client.query(
    'SELECT COALESCE(MAX(version), 0) AS max_version FROM resume_template WHERE user_id = $1',
    [userId],
  );

  return Number(result.rows[0]?.max_version ?? 0) + 1;
}

async function getMasterResume(userId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM resume_template
       WHERE user_id = $1 AND is_master = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );

    return rowToResume(result.rows[0]);
  });
}

async function getResumeById(userId, id) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'SELECT * FROM resume_template WHERE id = $1 AND user_id = $2',
      [id, userId],
    );

    return rowToResume(result.rows[0]);
  });
}

async function listResumeHistory(userId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT
         r.*,
         j.role_title,
         j.company_name
       FROM resume_template r
       LEFT JOIN jd_analyses j ON j.id = r.jd_analysis_id AND j.user_id = r.user_id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId],
    );

    return result.rows.map(rowToResume);
  });
}

async function createTailoredResume(userId, input) {
  const id = crypto.randomUUID();
  const now = Date.now();

  return withUserContext(userId, async (client) => {
    const version = await getNextResumeVersion(client, userId);

    await client.query(
      `INSERT INTO resume_template (
         id, user_id, version, is_master, label, experience, education, certifications,
         jd_analysis_id, created_at
       ) VALUES (
         $1, $2, $3, false, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9
       )`,
      [
        id,
        userId,
        version,
        input.label || 'Tailored resume',
        {
          _tailored: true,
          summary: input.summary || '',
          skills_section: input.skills_section || [],
          experience: input.experience || [],
        },
        input.education ?? [],
        input.certifications ?? [],
        input.jd_analysis_id || null,
        now,
      ],
    );

    const result = await client.query(
      'SELECT * FROM resume_template WHERE id = $1 AND user_id = $2',
      [id, userId],
    );

    return rowToResume(result.rows[0]);
  });
}

async function upsertMasterResume(userId, input) {
  const now = Date.now();

  return withUserContext(userId, async (client) => {
    const existingResult = await client.query(
      `SELECT * FROM resume_template
       WHERE user_id = $1 AND is_master = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );
    const existing = rowToResume(existingResult.rows[0]);

    if (existing) {
      await client.query(
        `UPDATE resume_template
         SET
           experience = $1::jsonb,
           education = $2::jsonb,
           certifications = $3::jsonb,
           label = $4,
           version = $5
         WHERE id = $6 AND user_id = $7`,
        [
          input.experience ?? [],
          input.education ?? [],
          input.certifications ?? [],
          input.label ?? existing.label ?? 'master',
          existing.version + 1,
          existing.id,
          userId,
        ],
      );

      const result = await client.query(
        'SELECT * FROM resume_template WHERE id = $1 AND user_id = $2',
        [existing.id, userId],
      );

      return rowToResume(result.rows[0]);
    }

    const id = crypto.randomUUID();

    await client.query(
      `INSERT INTO resume_template (
         id, user_id, version, is_master, label, experience, education, certifications, created_at
       ) VALUES (
         $1, $2, 1, true, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7
       )`,
      [
        id,
        userId,
        input.label ?? 'master',
        input.experience ?? [],
        input.education ?? [],
        input.certifications ?? [],
        now,
      ],
    );

    const result = await client.query(
      'SELECT * FROM resume_template WHERE id = $1 AND user_id = $2',
      [id, userId],
    );

    return rowToResume(result.rows[0]);
  });
}

async function getJdAnalysisById(userId, id) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'SELECT * FROM jd_analyses WHERE id = $1 AND user_id = $2',
      [id, userId],
    );

    return rowToJdAnalysis(result.rows[0]);
  });
}

async function listJdAnalyses(userId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT id, role_title, company_name, created_at
       FROM jd_analyses
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      role_title: row.role_title,
      company_name: row.company_name,
      created_at: Number(row.created_at),
    }));
  });
}

async function getJdAnalysisByHash(userId, jdHash) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'SELECT * FROM jd_analyses WHERE jd_hash = $1 AND user_id = $2',
      [jdHash, userId],
    );

    return rowToJdAnalysis(result.rows[0]);
  });
}

async function saveJdAnalysis(userId, analysis) {
  return withUserContext(userId, async (client) => {
    const existingResult = await client.query(
      'SELECT id FROM jd_analyses WHERE id = $1 AND user_id = $2',
      [analysis.id, userId],
    );
    const existing = existingResult.rows[0];

    const extractedKeywords = {
      keywords: analysis.extracted_keywords || [],
      ats_keywords: analysis.ats_keywords || [],
    };

    const commonParams = [
      analysis.jd_text,
      analysis.jd_hash,
      extractedKeywords,
      analysis.required_skills || [],
      analysis.preferred_skills || [],
      analysis.seniority_level || null,
      analysis.company_name || null,
      analysis.role_title || null,
      analysis.project_scores || {},
      analysis.suggested_project_order || [],
      analysis.tailored_bullets || {},
      analysis.reasoning_trace || null,
    ];

    if (existing) {
      await client.query(
        `UPDATE jd_analyses SET
           jd_text = $3,
           jd_hash = $4,
           extracted_keywords = $5::jsonb,
           required_skills = $6::jsonb,
           preferred_skills = $7::jsonb,
           seniority_level = $8,
           company_name = $9,
           role_title = $10,
           project_scores = $11::jsonb,
           suggested_project_order = $12::jsonb,
           tailored_bullets = $13::jsonb,
           reasoning_trace = $14
         WHERE id = $1 AND user_id = $2`,
        [analysis.id, userId, ...commonParams],
      );
    } else {
      await client.query(
        `INSERT INTO jd_analyses (
           id, user_id, jd_text, jd_hash, extracted_keywords, required_skills, preferred_skills,
           seniority_level, company_name, role_title, project_scores,
           suggested_project_order, tailored_bullets, reasoning_trace, created_at
         ) VALUES (
           $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb,
           $8, $9, $10, $11::jsonb,
           $12::jsonb, $13::jsonb, $14, $15
         )`,
        [
          analysis.id,
          userId,
          ...commonParams,
          analysis.created_at || Date.now(),
        ],
      );
    }

    const result = await client.query(
      'SELECT * FROM jd_analyses WHERE id = $1 AND user_id = $2',
      [analysis.id, userId],
    );

    return rowToJdAnalysis(result.rows[0]);
  });
}

async function updateJdAnalysisTailoredBullets(userId, id, tailoredBullets) {
  return withUserContext(userId, async (client) => {
    await client.query(
      `UPDATE jd_analyses
       SET tailored_bullets = $1::jsonb
       WHERE id = $2 AND user_id = $3`,
      [tailoredBullets || {}, id, userId],
    );

    const result = await client.query(
      'SELECT * FROM jd_analyses WHERE id = $1 AND user_id = $2',
      [id, userId],
    );

    return rowToJdAnalysis(result.rows[0]);
  });
}

module.exports = {
  getMasterResume,
  getResumeById,
  listResumeHistory,
  upsertMasterResume,
  createTailoredResume,
  getJdAnalysisById,
  listJdAnalyses,
  getJdAnalysisByHash,
  saveJdAnalysis,
  updateJdAnalysisTailoredBullets,
};
