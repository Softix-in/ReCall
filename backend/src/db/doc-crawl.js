const crypto = require('crypto');
const { withUserContext, withSecurityBypass, query } = require('./pg-pool');

function rowToJob(row) {
  if (!row) return null;

  return {
    ...row,
    max_pages: Number(row.max_pages),
    pages_found: Number(row.pages_found || 0),
    pages_saved: Number(row.pages_saved || 0),
    created_at: Number(row.created_at),
    completed_at: row.completed_at ? Number(row.completed_at) : null,
  };
}

async function createJob(userId, input) {
  const id = crypto.randomUUID();
  const now = Date.now();

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `INSERT INTO doc_crawl_jobs (
        id, user_id, seed_url, path_filter, max_pages, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, 'queued', $6)
      RETURNING *`,
      [
        id,
        userId,
        input.seed_url,
        input.path_filter ?? null,
        input.max_pages ?? 25,
        now,
      ],
    );

    return rowToJob(result.rows[0]);
  });
}

async function getJob(userId, jobId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'SELECT * FROM doc_crawl_jobs WHERE id = $1 AND user_id = $2',
      [jobId, userId],
    );
    return rowToJob(result.rows[0]);
  });
}

async function getJobInternal(jobId) {
  return withSecurityBypass(async (client) => {
    const result = await client.query('SELECT * FROM doc_crawl_jobs WHERE id = $1', [jobId]);
    return rowToJob(result.rows[0]);
  });
}

async function updateJob(userId, jobId, patch) {
  const allowed = new Set([
    'status',
    'pages_found',
    'pages_saved',
    'error_message',
    'completed_at',
  ]);

  const sets = [];
  const values = [jobId, userId];

  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue;
    values.push(value);
    sets.push(`${key} = $${values.length}`);
  }

  if (sets.length === 0) {
    return getJob(userId, jobId);
  }

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `UPDATE doc_crawl_jobs SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
      values,
    );
    return rowToJob(result.rows[0]);
  });
}

async function listJobs(userId, { limit = 20, offset = 0 } = {}) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM doc_crawl_jobs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return result.rows.map(rowToJob);
  });
}

async function listStuckJobs() {
  const result = await query(
    `SELECT * FROM doc_crawl_jobs WHERE status IN ('queued', 'running') ORDER BY created_at ASC`,
  );
  return result.rows.map(rowToJob);
}

module.exports = {
  createJob,
  getJob,
  getJobInternal,
  updateJob,
  listJobs,
  listStuckJobs,
};
