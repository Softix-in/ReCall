const crypto = require('crypto');
const { getDb } = require('./connection');
const { parseJsonArray, parseJsonObject, stringifyJson } = require('./json-fields');

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
    created_at: row.created_at,
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

function getMasterResume() {
  const row = getDb().prepare(`
    SELECT * FROM resume_template
    WHERE is_master = 1
    ORDER BY created_at DESC
    LIMIT 1
  `).get();

  return rowToResume(row);
}

function getResumeById(id) {
  const row = getDb().prepare('SELECT * FROM resume_template WHERE id = ?').get(id);
  return rowToResume(row);
}

function listResumeHistory() {
  const rows = getDb().prepare(`
    SELECT
      r.*,
      j.role_title,
      j.company_name
    FROM resume_template r
    LEFT JOIN jd_analyses j ON j.id = r.jd_analysis_id
    ORDER BY r.created_at DESC
  `).all();

  return rows.map(rowToResume);
}

function createTailoredResume(input) {
  const id = crypto.randomUUID();
  const version = getNextResumeVersion();
  const now = Date.now();

  getDb().prepare(`
    INSERT INTO resume_template (
      id, version, is_master, label, experience, education, certifications,
      jd_analysis_id, created_at
    ) VALUES (
      @id, @version, 0, @label, @experience, @education, @certifications,
      @jd_analysis_id, @created_at
    )
  `).run({
    id,
    version,
    label: input.label || 'Tailored resume',
    experience: stringifyJson({
      _tailored: true,
      summary: input.summary || '',
      skills_section: input.skills_section || [],
      experience: input.experience || [],
    }),
    education: stringifyJson(input.education ?? []),
    certifications: stringifyJson(input.certifications ?? []),
    jd_analysis_id: input.jd_analysis_id || null,
    created_at: now,
  });

  return getResumeById(id);
}

function getNextResumeVersion() {
  const row = getDb().prepare('SELECT COALESCE(MAX(version), 0) AS max_version FROM resume_template').get();
  return (row?.max_version ?? 0) + 1;
}

function upsertMasterResume(input) {
  const existing = getMasterResume();
  const now = Date.now();

  if (existing) {
    getDb().prepare(`
      UPDATE resume_template
      SET
        experience = @experience,
        education = @education,
        certifications = @certifications,
        label = @label,
        version = @version
      WHERE id = @id
    `).run({
      id: existing.id,
      experience: stringifyJson(input.experience ?? []),
      education: stringifyJson(input.education ?? []),
      certifications: stringifyJson(input.certifications ?? []),
      label: input.label ?? existing.label ?? 'master',
      version: existing.version + 1,
    });

    return getResumeById(existing.id);
  }

  const id = crypto.randomUUID();

  getDb().prepare(`
    INSERT INTO resume_template (
      id, version, is_master, label, experience, education, certifications, created_at
    ) VALUES (
      @id, @version, 1, @label, @experience, @education, @certifications, @created_at
    )
  `).run({
    id,
    version: 1,
    label: input.label ?? 'master',
    experience: stringifyJson(input.experience ?? []),
    education: stringifyJson(input.education ?? []),
    certifications: stringifyJson(input.certifications ?? []),
    created_at: now,
  });

  return getResumeById(id);
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

function getJdAnalysisById(id) {
  const row = getDb().prepare('SELECT * FROM jd_analyses WHERE id = ?').get(id);
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
    created_at: row.created_at,
  };
}

function listJdAnalyses() {
  const rows = getDb().prepare(`
    SELECT id, role_title, company_name, created_at
    FROM jd_analyses
    ORDER BY created_at DESC
  `).all();

  return rows;
}

function getJdAnalysisByHash(jdHash) {
  const row = getDb().prepare('SELECT * FROM jd_analyses WHERE jd_hash = ?').get(jdHash);
  if (!row) {
    return null;
  }

  return getJdAnalysisById(row.id);
}

function saveJdAnalysis(analysis) {
  const existing = getDb().prepare('SELECT id FROM jd_analyses WHERE id = ?').get(analysis.id);

  const payload = {
    id: analysis.id,
    jd_text: analysis.jd_text,
    jd_hash: analysis.jd_hash,
    extracted_keywords: stringifyJson({
      keywords: analysis.extracted_keywords || [],
      ats_keywords: analysis.ats_keywords || [],
    }),
    required_skills: stringifyJson(analysis.required_skills || []),
    preferred_skills: stringifyJson(analysis.preferred_skills || []),
    seniority_level: analysis.seniority_level || null,
    company_name: analysis.company_name || null,
    role_title: analysis.role_title || null,
    project_scores: stringifyJson(analysis.project_scores || {}),
    suggested_project_order: stringifyJson(analysis.suggested_project_order || []),
    tailored_bullets: stringifyJson(analysis.tailored_bullets || {}),
    reasoning_trace: analysis.reasoning_trace || null,
    created_at: analysis.created_at || Date.now(),
  };

  if (existing) {
    getDb().prepare(`
      UPDATE jd_analyses SET
        jd_text = @jd_text,
        jd_hash = @jd_hash,
        extracted_keywords = @extracted_keywords,
        required_skills = @required_skills,
        preferred_skills = @preferred_skills,
        seniority_level = @seniority_level,
        company_name = @company_name,
        role_title = @role_title,
        project_scores = @project_scores,
        suggested_project_order = @suggested_project_order,
        tailored_bullets = @tailored_bullets,
        reasoning_trace = @reasoning_trace
      WHERE id = @id
    `).run(payload);
  } else {
    getDb().prepare(`
      INSERT INTO jd_analyses (
        id, jd_text, jd_hash, extracted_keywords, required_skills, preferred_skills,
        seniority_level, company_name, role_title, project_scores,
        suggested_project_order, tailored_bullets, reasoning_trace, created_at
      ) VALUES (
        @id, @jd_text, @jd_hash, @extracted_keywords, @required_skills, @preferred_skills,
        @seniority_level, @company_name, @role_title, @project_scores,
        @suggested_project_order, @tailored_bullets, @reasoning_trace, @created_at
      )
    `).run(payload);
  }

  return getJdAnalysisById(analysis.id);
}

function updateJdAnalysisTailoredBullets(id, tailoredBullets) {
  getDb().prepare(`
    UPDATE jd_analyses
    SET tailored_bullets = ?
    WHERE id = ?
  `).run(stringifyJson(tailoredBullets || {}), id);

  return getJdAnalysisById(id);
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
