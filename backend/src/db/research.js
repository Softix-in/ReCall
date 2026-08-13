const crypto = require('crypto');
const { withUserContext, withSecurityBypass, query, formatVector } = require('./pg-pool');
const { parseJsonArray, parseJsonObject } = require('./json-fields');

function rowToCompany(row) {
  if (!row) return null;

  return {
    ...row,
    tags: parseJsonArray(row.tags),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    founded_year: row.founded_year != null ? Number(row.founded_year) : null,
  };
}

function rowToJob(row) {
  if (!row) return null;

  return {
    ...row,
    progress: parseJsonObject(row.progress) || {},
    retry_count: Number(row.retry_count || 0),
    created_at: Number(row.created_at),
    started_at: row.started_at ? Number(row.started_at) : null,
    completed_at: row.completed_at ? Number(row.completed_at) : null,
  };
}

function rowToFounder(row) {
  if (!row) return null;
  return {
    ...row,
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  };
}

function rowToNews(row) {
  if (!row) return null;
  return {
    ...row,
    importance_score: row.importance_score != null ? Number(row.importance_score) : null,
    created_at: Number(row.created_at),
  };
}

function rowToAnalysis(row) {
  if (!row) return null;
  return {
    ...row,
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  };
}

async function findCompanyByYcUrl(userId, ycUrl) {
  if (!ycUrl) return null;

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'SELECT * FROM research_companies WHERE user_id = $1 AND yc_url = $2 LIMIT 1',
      [userId, ycUrl],
    );
    return rowToCompany(result.rows[0]);
  });
}

async function findCompanyByWebsite(userId, website) {
  if (!website) return null;

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM research_companies
       WHERE user_id = $1 AND website = $2
       LIMIT 1`,
      [userId, website],
    );
    return rowToCompany(result.rows[0]);
  });
}

async function createCompany(userId, input) {
  const id = crypto.randomUUID();
  const now = Date.now();

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `INSERT INTO research_companies (
        id, user_id, name, yc_batch, yc_url, website, short_description,
        industry, location, founded_year, team_size, status, source_url,
        item_id, tags, user_note, raw_page_text, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13,
        $14, $15::jsonb, $16, $17, $18, $19
      )
      RETURNING *`,
      [
        id,
        userId,
        input.name,
        input.yc_batch ?? null,
        input.yc_url ?? null,
        input.website ?? null,
        input.short_description ?? null,
        input.industry ?? null,
        input.location ?? null,
        input.founded_year ?? null,
        input.team_size ?? null,
        input.status ?? 'new',
        input.source_url ?? null,
        input.item_id ?? null,
        JSON.stringify(input.tags || []),
        input.user_note ?? null,
        input.raw_page_text ?? null,
        now,
        now,
      ],
    );

    return rowToCompany(result.rows[0]);
  });
}

async function updateCompany(userId, companyId, patch) {
  const allowed = new Set([
    'name', 'yc_batch', 'yc_url', 'website', 'short_description', 'industry',
    'location', 'founded_year', 'team_size', 'status', 'source_url', 'item_id',
    'tags', 'user_note', 'raw_page_text', 'embedding',
    'yc_status', 'revenue_notes', 'funding_summary',
  ]);

  const sets = [];
  const values = [];
  let i = 1;

  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue;

    if (key === 'tags') {
      sets.push(`tags = $${i}::jsonb`);
      values.push(JSON.stringify(value || []));
    } else if (key === 'embedding') {
      sets.push(`embedding = $${i}::vector`);
      values.push(formatVector(value));
    } else {
      sets.push(`${key} = $${i}`);
      values.push(value);
    }
    i += 1;
  }

  if (sets.length === 0) {
    return getCompany(userId, companyId);
  }

  sets.push(`updated_at = $${i}`);
  values.push(Date.now());
  i += 1;

  values.push(companyId);
  values.push(userId);

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `UPDATE research_companies
       SET ${sets.join(', ')}
       WHERE id = $${i} AND user_id = $${i + 1}
       RETURNING *`,
      values,
    );
    return rowToCompany(result.rows[0]);
  });
}

async function getCompany(userId, companyId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'SELECT * FROM research_companies WHERE id = $1 AND user_id = $2',
      [companyId, userId],
    );
    return rowToCompany(result.rows[0]);
  });
}

async function getCompanyInternal(companyId) {
  return withSecurityBypass(async (client) => {
    const result = await client.query('SELECT * FROM research_companies WHERE id = $1', [companyId]);
    return rowToCompany(result.rows[0]);
  });
}

async function listCompanies(userId, { status = null, limit = 50, offset = 0 } = {}) {
  return withUserContext(userId, async (client) => {
    const params = [userId];
    let where = 'user_id = $1';

    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }

    params.push(Math.min(Number(limit) || 50, 200));
    params.push(Math.max(Number(offset) || 0, 0));

    const result = await client.query(
      `SELECT * FROM research_companies
       WHERE ${where}
       ORDER BY updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return result.rows.map(rowToCompany);
  });
}

async function createJob(userId, companyId, { job_type = 'full_research' } = {}) {
  const id = crypto.randomUUID();
  const now = Date.now();

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `INSERT INTO research_jobs (
        id, company_id, user_id, job_type, status, progress, created_at
      ) VALUES ($1, $2, $3, $4, 'queued', '{}'::jsonb, $5)
      RETURNING *`,
      [id, companyId, userId, job_type, now],
    );
    return rowToJob(result.rows[0]);
  });
}

async function updateJob(userId, jobId, patch) {
  const allowed = new Set([
    'status', 'progress', 'error_message', 'retry_count', 'started_at', 'completed_at',
  ]);

  const sets = [];
  const values = [];
  let i = 1;

  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue;

    if (key === 'progress') {
      sets.push(`progress = $${i}::jsonb`);
      values.push(JSON.stringify(value || {}));
    } else {
      sets.push(`${key} = $${i}`);
      values.push(value);
    }
    i += 1;
  }

  if (sets.length === 0) {
    return getJob(userId, jobId);
  }

  values.push(jobId);
  values.push(userId);

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `UPDATE research_jobs
       SET ${sets.join(', ')}
       WHERE id = $${i} AND user_id = $${i + 1}
       RETURNING *`,
      values,
    );
    return rowToJob(result.rows[0]);
  });
}

async function getJob(userId, jobId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'SELECT * FROM research_jobs WHERE id = $1 AND user_id = $2',
      [jobId, userId],
    );
    return rowToJob(result.rows[0]);
  });
}

async function getJobInternal(jobId) {
  return withSecurityBypass(async (client) => {
    const result = await client.query('SELECT * FROM research_jobs WHERE id = $1', [jobId]);
    return rowToJob(result.rows[0]);
  });
}

async function listJobsForCompany(userId, companyId, limit = 10) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM research_jobs
       WHERE user_id = $1 AND company_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, companyId, limit],
    );
    return result.rows.map(rowToJob);
  });
}

async function listStuckJobs() {
  const result = await query(
    `SELECT * FROM research_jobs
     WHERE status IN ('queued', 'running')
     ORDER BY created_at ASC
     LIMIT 50`,
  );
  return result.rows.map(rowToJob);
}

async function upsertAnalysis(userId, companyId, analysis) {
  const now = Date.now();

  return withUserContext(userId, async (client) => {
    const existing = await client.query(
      'SELECT id FROM research_company_analysis WHERE company_id = $1 AND user_id = $2',
      [companyId, userId],
    );

    const fields = [
      'problem_statement', 'target_customer', 'current_solution', 'why_now',
      'market_size_notes', 'business_model', 'competitors', 'moat',
      'technical_depth', 'ai_or_deeptech_angle', 'go_to_market_strategy', 'risks',
      'insight_summary', 'adjacent_opportunities', 'one_line_understanding',
      'opportunity_score', 'personal_fit_score', 'market_demand_score',
      'problem_pain_score', 'technical_depth_score', 'competition_score',
      'buildability_score', 'long_term_score',
      'revenue_notes', 'funding_notes',
    ];

    if (existing.rows[0]) {
      const sets = fields.map((f, idx) => `${f} = $${idx + 1}`);
      const values = fields.map((f) => analysis[f] ?? null);
      values.push(now);
      values.push(existing.rows[0].id);
      values.push(userId);

      const result = await client.query(
        `UPDATE research_company_analysis
         SET ${sets.join(', ')}, updated_at = $${fields.length + 1}
         WHERE id = $${fields.length + 2} AND user_id = $${fields.length + 3}
         RETURNING *`,
        values,
      );
      return rowToAnalysis(result.rows[0]);
    }

    const id = crypto.randomUUID();
    const placeholders = fields.map((_, idx) => `$${idx + 5}`).join(', ');
    const values = [
      id,
      companyId,
      userId,
      now,
      ...fields.map((f) => analysis[f] ?? null),
      now,
    ];

    const result = await client.query(
      `INSERT INTO research_company_analysis (
        id, company_id, user_id, created_at,
        ${fields.join(', ')},
        updated_at
      ) VALUES (
        $1, $2, $3, $4,
        ${placeholders},
        $${fields.length + 5}
      )
      RETURNING *`,
      values,
    );
    return rowToAnalysis(result.rows[0]);
  });
}

async function getAnalysis(userId, companyId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'SELECT * FROM research_company_analysis WHERE company_id = $1 AND user_id = $2',
      [companyId, userId],
    );
    return rowToAnalysis(result.rows[0]);
  });
}

async function createFounder(userId, input) {
  const id = crypto.randomUUID();
  const now = Date.now();

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `INSERT INTO research_founders (
        id, user_id, full_name, "current_role", linkedin_url, twitter_url,
        github_url, personal_website, location, education, previous_companies,
        previous_startups, technical_background, domain_expertise, achievements,
        public_bio, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18
      )
      RETURNING *`,
      [
        id,
        userId,
        input.full_name,
        input.current_role ?? null,
        input.linkedin_url ?? null,
        input.twitter_url ?? null,
        input.github_url ?? null,
        input.personal_website ?? null,
        input.location ?? null,
        input.education ?? null,
        input.previous_companies ?? null,
        input.previous_startups ?? null,
        input.technical_background ?? null,
        input.domain_expertise ?? null,
        input.achievements ?? null,
        input.public_bio ?? null,
        now,
        now,
      ],
    );
    return rowToFounder(result.rows[0]);
  });
}

async function updateFounder(userId, founderId, patch) {
  const allowed = new Set([
    'full_name', 'current_role', 'linkedin_url', 'twitter_url', 'github_url',
    'personal_website', 'location', 'education', 'previous_companies',
    'previous_startups', 'technical_background', 'domain_expertise',
    'achievements', 'public_bio',
  ]);

  const sets = [];
  const values = [];
  let i = 1;

  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue;
    const column = key === 'current_role' ? '"current_role"' : key;
    sets.push(`${column} = $${i}`);
    values.push(value);
    i += 1;
  }

  if (sets.length === 0) {
    return withUserContext(userId, async (client) => {
      const result = await client.query(
        'SELECT * FROM research_founders WHERE id = $1 AND user_id = $2',
        [founderId, userId],
      );
      return rowToFounder(result.rows[0]);
    });
  }

  sets.push(`updated_at = $${i}`);
  values.push(Date.now());
  i += 1;

  values.push(founderId);
  values.push(userId);

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `UPDATE research_founders
       SET ${sets.join(', ')}
       WHERE id = $${i} AND user_id = $${i + 1}
       RETURNING *`,
      values,
    );
    return rowToFounder(result.rows[0]);
  });
}

async function linkFounderToCompany(userId, companyId, founderId, { role = null, source_url = null } = {}) {
  const id = crypto.randomUUID();
  const now = Date.now();

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `INSERT INTO research_company_founders (
        id, company_id, founder_id, user_id, role, is_current, source_url, created_at
      ) VALUES ($1, $2, $3, $4, $5, true, $6, $7)
      ON CONFLICT (company_id, founder_id) DO UPDATE SET role = EXCLUDED.role
      RETURNING *`,
      [id, companyId, founderId, userId, role, source_url, now],
    );
    return result.rows[0];
  });
}

async function listFoundersForCompany(userId, companyId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT f.*, cf.role AS company_role, cf.source_url AS link_source_url
       FROM research_company_founders cf
       JOIN research_founders f ON f.id = cf.founder_id
       WHERE cf.company_id = $1 AND cf.user_id = $2
       ORDER BY f.full_name ASC`,
      [companyId, userId],
    );
    return result.rows.map((row) => ({
      ...rowToFounder(row),
      company_role: row.company_role,
      link_source_url: row.link_source_url,
    }));
  });
}

async function addFounderSource(userId, input) {
  const id = crypto.randomUUID();
  const now = Date.now();

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `INSERT INTO research_founder_sources (
        id, founder_id, company_id, user_id, source_type, source_title,
        source_url, raw_text, extracted_summary, credibility_score, date_found, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        id,
        input.founder_id,
        input.company_id ?? null,
        userId,
        input.source_type,
        input.source_title ?? null,
        input.source_url ?? null,
        input.raw_text ?? null,
        input.extracted_summary ?? null,
        input.credibility_score ?? null,
        input.date_found ?? now,
        now,
      ],
    );
    return result.rows[0];
  });
}

function rowToFunding(row) {
  if (!row) return null;
  return {
    ...row,
    confidence: row.confidence != null ? Number(row.confidence) : null,
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  };
}

async function addFunding(userId, input) {
  const id = crypto.randomUUID();
  const now = Date.now();

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `INSERT INTO research_company_funding (
        id, company_id, user_id, round_name, amount, currency, announced_date,
        investors, valuation, source_url, source_title, evidence_quote,
        confidence, notes, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16
      )
      RETURNING *`,
      [
        id,
        input.company_id,
        userId,
        input.round_name ?? null,
        input.amount ?? null,
        input.currency ?? null,
        input.announced_date ?? null,
        input.investors ?? null,
        input.valuation ?? null,
        input.source_url ?? null,
        input.source_title ?? null,
        input.evidence_quote ?? null,
        input.confidence ?? null,
        input.notes ?? null,
        now,
        now,
      ],
    );
    return rowToFunding(result.rows[0]);
  });
}

async function listFundingForCompany(userId, companyId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM research_company_funding
       WHERE company_id = $1 AND user_id = $2
       ORDER BY created_at DESC`,
      [companyId, userId],
    );
    return result.rows.map(rowToFunding);
  });
}

async function clearFundingForCompany(userId, companyId) {
  return withUserContext(userId, async (client) => {
    await client.query(
      'DELETE FROM research_company_funding WHERE company_id = $1 AND user_id = $2',
      [companyId, userId],
    );
  });
}

async function addNews(userId, input) {
  const id = crypto.randomUUID();
  const now = Date.now();

  return withUserContext(userId, async (client) => {
    if (input.url) {
      const existing = await client.query(
        `SELECT * FROM research_startup_news
         WHERE user_id = $1 AND url = $2 LIMIT 1`,
        [userId, input.url],
      );
      if (existing.rows[0]) {
        return rowToNews(existing.rows[0]);
      }
    }

    const result = await client.query(
      `INSERT INTO research_startup_news (
        id, company_id, user_id, title, url, publisher, published_date,
        news_type, raw_text, summary, key_signal, sentiment, importance_score, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14
      )
      RETURNING *`,
      [
        id,
        input.company_id,
        userId,
        input.title,
        input.url ?? null,
        input.publisher ?? null,
        input.published_date ?? null,
        input.news_type ?? null,
        input.raw_text ?? null,
        input.summary ?? null,
        input.key_signal ?? null,
        input.sentiment ?? null,
        input.importance_score ?? null,
        now,
      ],
    );
    return rowToNews(result.rows[0]);
  });
}

async function listNewsForCompany(userId, companyId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM research_startup_news
       WHERE company_id = $1 AND user_id = $2
       ORDER BY created_at DESC`,
      [companyId, userId],
    );
    return result.rows.map(rowToNews);
  });
}

async function addCompanyPage(userId, input) {
  const id = crypto.randomUUID();
  const now = Date.now();

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `INSERT INTO research_company_pages (
        id, company_id, user_id, page_type, title, url, raw_text, summary,
        extracted_features, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (company_id, url) DO UPDATE SET
        title = EXCLUDED.title,
        raw_text = EXCLUDED.raw_text,
        summary = EXCLUDED.summary,
        extracted_features = EXCLUDED.extracted_features
      RETURNING *`,
      [
        id,
        input.company_id,
        userId,
        input.page_type ?? null,
        input.title ?? null,
        input.url,
        input.raw_text ?? null,
        input.summary ?? null,
        input.extracted_features ?? null,
        now,
      ],
    );
    return result.rows[0];
  });
}

async function listPagesForCompany(userId, companyId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM research_company_pages
       WHERE company_id = $1 AND user_id = $2
       ORDER BY created_at DESC`,
      [companyId, userId],
    );
    return result.rows;
  });
}

async function addSource(userId, input) {
  const id = crypto.randomUUID();
  const now = Date.now();

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `INSERT INTO research_sources (
        id, company_id, founder_id, user_id, item_id, source_type, title,
        url, extracted_text, credibility_score, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        id,
        input.company_id ?? null,
        input.founder_id ?? null,
        userId,
        input.item_id ?? null,
        input.source_type,
        input.title ?? null,
        input.url ?? null,
        input.extracted_text ?? null,
        input.credibility_score ?? null,
        now,
      ],
    );
    return result.rows[0];
  });
}

async function listSourcesForCompany(userId, companyId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM research_sources
       WHERE company_id = $1 AND user_id = $2
       ORDER BY created_at DESC`,
      [companyId, userId],
    );
    return result.rows.map((row) => ({
      ...row,
      created_at: Number(row.created_at),
    }));
  });
}

async function getCompanyDetail(userId, companyId) {
  const company = await getCompany(userId, companyId);
  if (!company) return null;

  const [analysis, founders, news, pages, sources, jobs, funding] = await Promise.all([
    getAnalysis(userId, companyId),
    listFoundersForCompany(userId, companyId),
    listNewsForCompany(userId, companyId),
    listPagesForCompany(userId, companyId),
    listSourcesForCompany(userId, companyId),
    listJobsForCompany(userId, companyId, 5),
    listFundingForCompany(userId, companyId),
  ]);

  return {
    company,
    analysis,
    founders,
    news,
    pages,
    sources,
    jobs,
    funding,
  };
}

async function getStatusCounts(userId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT status, COUNT(*)::int AS count
       FROM research_companies
       WHERE user_id = $1
       GROUP BY status`,
      [userId],
    );

    const counts = {
      new: 0,
      processing: 0,
      processed: 0,
      needs_review: 0,
      shortlisted: 0,
      rejected: 0,
      idea_generated: 0,
      total: 0,
    };

    for (const row of result.rows) {
      counts[row.status] = row.count;
      counts.total += row.count;
    }

    return counts;
  });
}

module.exports = {
  findCompanyByYcUrl,
  findCompanyByWebsite,
  createCompany,
  updateCompany,
  getCompany,
  getCompanyInternal,
  listCompanies,
  createJob,
  updateJob,
  getJob,
  getJobInternal,
  listJobsForCompany,
  listStuckJobs,
  upsertAnalysis,
  getAnalysis,
  createFounder,
  updateFounder,
  linkFounderToCompany,
  listFoundersForCompany,
  addFounderSource,
  addFunding,
  listFundingForCompany,
  clearFundingForCompany,
  addNews,
  listNewsForCompany,
  addCompanyPage,
  listPagesForCompany,
  addSource,
  listSourcesForCompany,
  getCompanyDetail,
  getStatusCounts,
};
