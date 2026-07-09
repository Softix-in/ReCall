const crypto = require('crypto');
const { withUserContext, formatVector } = require('./pg-pool');

const SORTABLE_COLUMNS = new Set(['created_at', 'processed_at', 'title', 'domain']);

const UPDATABLE_COLUMNS = new Set([
  'url',
  'title',
  'summary',
  'content',
  'source_type',
  'save_mode',
  'note',
  'tags',
  'domain',
  'thumbnail',
  'transcript',
  'thumbnail_url',
  'transcript_url',
  'processing',
  'processed_at',
  'capture_meta',
  'error_message',
  'embedding',
]);

function rowToItem(row) {
  if (!row) {
    return null;
  }

  const item = { ...row };

  if (item.capture_meta && typeof item.capture_meta === 'object') {
    item.capture_meta = JSON.stringify(item.capture_meta);
  }

  item.created_at = Number(item.created_at);
  item.processed_at = item.processed_at ? Number(item.processed_at) : null;

  return item;
}

async function createItem(userId, input) {
  const id = crypto.randomUUID();
  const created_at = input.created_at ?? Date.now();

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `INSERT INTO items (
        id, user_id, url, title, summary, content, source_type, save_mode, note, tags,
        domain, thumbnail, transcript, thumbnail_url, transcript_url, processing,
        created_at, processed_at, capture_meta, error_message
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16,
        $17, $18, $19::jsonb, $20
      )
      RETURNING *`,
      [
        id,
        userId,
        input.url,
        input.title ?? null,
        input.summary ?? null,
        input.content ?? null,
        input.source_type,
        input.save_mode,
        input.note ?? null,
        input.tags ?? null,
        input.domain ?? null,
        input.thumbnail ?? null,
        input.transcript ?? null,
        input.thumbnail_url ?? null,
        input.transcript_url ?? null,
        input.processing ?? 'queued',
        created_at,
        input.processed_at ?? null,
        input.capture_meta ?? null,
        input.error_message ?? null,
      ],
    );

    return rowToItem(result.rows[0]);
  });
}

async function getItemById(userId, id) {
  return withUserContext(userId, async (client) => {
    const result = await client.query('SELECT * FROM items WHERE id = $1 AND user_id = $2', [id, userId]);
    return rowToItem(result.rows[0]);
  });
}

async function getItemByIdInternal(id) {
  const { query } = require('./pg-pool');
  const result = await query('SELECT * FROM items WHERE id = $1', [id]);
  return rowToItem(result.rows[0]);
}

async function updateItem(userId, id, fields) {
  const keys = Object.keys(fields).filter((key) => UPDATABLE_COLUMNS.has(key));

  if (keys.length === 0) {
    return getItemById(userId, id);
  }

  const values = [id, userId];
  const assignments = keys.map((key, index) => {
    const paramIndex = index + 3;
    const value = key === 'embedding' ? formatVector(fields[key]) : fields[key];
    values.push(value);

    if (key === 'capture_meta') {
      return `${key} = $${paramIndex}::jsonb`;
    }

    if (key === 'embedding') {
      return `${key} = $${paramIndex}::vector`;
    }

    return `${key} = $${paramIndex}`;
  });

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `UPDATE items SET ${assignments.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
      values,
    );

    return rowToItem(result.rows[0]);
  });
}

async function listItems(userId, { limit = 20, sort = 'created_at' } = {}) {
  const safeSort = SORTABLE_COLUMNS.has(sort) ? sort : 'created_at';
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM items WHERE user_id = $1 ORDER BY ${safeSort} DESC LIMIT $2`,
      [userId, safeLimit],
    );

    return result.rows.map(rowToItem);
  });
}

async function countItems(userId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'SELECT COUNT(*)::int AS count FROM items WHERE user_id = $1',
      [userId],
    );

    return result.rows[0].count;
  });
}

async function findRecentByUrl(userId, url, sinceMs) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM items
       WHERE user_id = $1 AND url = $2 AND created_at >= $3
         AND processing IN ('queued', 'processing', 'done')
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, url, sinceMs],
    );

    return rowToItem(result.rows[0]);
  });
}

async function getItemsByIds(userId, ids) {
  if (!ids?.length) {
    return [];
  }

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM items WHERE user_id = $1 AND id = ANY($2::uuid[])`,
      [userId, ids],
    );

    const byId = new Map(result.rows.map((row) => [row.id, rowToItem(row)]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  });
}

async function searchFts(userId, queryText, limit = 20) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT id, ts_rank(fts_vector, plainto_tsquery('english', $2)) AS rank
       FROM items
       WHERE user_id = $1
         AND processing = 'done'
         AND fts_vector @@ plainto_tsquery('english', $2)
       ORDER BY rank DESC
       LIMIT $3`,
      [userId, queryText, safeLimit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      score: Number(row.rank) || 0,
    }));
  });
}

async function searchSemantic(userId, embedding, limit = 20) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const vector = formatVector(embedding);

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT id, 1 - (embedding <=> $2::vector) AS score
       FROM items
       WHERE user_id = $1
         AND processing = 'done'
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector
       LIMIT $3`,
      [userId, vector, safeLimit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      score: Math.max(0, Number(row.score) || 0),
    }));
  });
}

async function listFailedItems(userId, { limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM items
       WHERE user_id = $1 AND processing = 'failed'
       ORDER BY processed_at DESC NULLS LAST, created_at DESC
       LIMIT $2`,
      [userId, safeLimit],
    );

    return result.rows.map(rowToItem);
  });
}

async function listJobHistory(userId, { days = 30, limit = 100 } = {}) {
  const safeDays = Math.min(Math.max(Number(days) || 30, 1), 90);
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const sinceMs = Date.now() - safeDays * 24 * 60 * 60 * 1000;

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM items
       WHERE user_id = $1
         AND created_at >= $2
         AND processing IN ('done', 'failed', 'queued', 'processing')
       ORDER BY COALESCE(processed_at, created_at) DESC
       LIMIT $3`,
      [userId, sinceMs, safeLimit],
    );

    return result.rows.map(rowToItem);
  });
}

async function listStuckItems() {
  const { query } = require('./pg-pool');
  const result = await query(
    `SELECT * FROM items
     WHERE processing IN ('queued', 'processing')
     ORDER BY created_at ASC`,
  );

  return result.rows.map(rowToItem);
}

async function deleteItem(userId, id) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'DELETE FROM items WHERE id = $1 AND user_id = $2',
      [id, userId],
    );

    return result.rowCount > 0;
  });
}

async function listTestItems(userId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM items
       WHERE user_id = $1
         AND (
           url LIKE '%benchmark.recall.local%'
           OR url LIKE '%fail-job-test%'
           OR (
             url LIKE '%example.com%'
             AND (
               url LIKE '%phase%'
               OR url LIKE '%recall-phase%'
               OR url LIKE '%phase4-note%'
             )
           )
         )
       ORDER BY created_at DESC`,
      [userId],
    );

    return result.rows.map(rowToItem);
  });
}

async function listAllItems(userId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'SELECT * FROM items WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );

    return result.rows.map(rowToItem);
  });
}

async function getLastSavedItem(userId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM items
       WHERE user_id = $1 AND processing = 'done'
       ORDER BY processed_at DESC NULLS LAST
       LIMIT 1`,
      [userId],
    );

    return rowToItem(result.rows[0]);
  });
}

async function listDoneItems(userId, { limit = 1000, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 1000, 1), 10_000);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  return withUserContext(userId, async (client) => {
    const result = await client.query(
      `SELECT * FROM items
       WHERE user_id = $1 AND processing = 'done'
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, safeLimit, safeOffset],
    );

    return result.rows.map(rowToItem);
  });
}

async function updateItemEmbedding(userId, id, embedding) {
  return updateItem(userId, id, { embedding });
}

module.exports = {
  createItem,
  getItemById,
  getItemByIdInternal,
  updateItem,
  updateItemEmbedding,
  listItems,
  countItems,
  findRecentByUrl,
  getItemsByIds,
  searchFts,
  searchSemantic,
  listDoneItems,
  listFailedItems,
  listJobHistory,
  listStuckItems,
  getLastSavedItem,
  deleteItem,
  listAllItems,
  listTestItems,
};
