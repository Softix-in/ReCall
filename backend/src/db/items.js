const crypto = require('crypto');
const { getDb } = require('./connection');

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
  'processing',
  'processed_at',
  'capture_meta',
  'error_message',
]);

function rowToItem(row) {
  if (!row) {
    return null;
  }

  return { ...row };
}

function createItem(input) {
  const id = crypto.randomUUID();
  const created_at = input.created_at ?? Date.now();

  getDb().prepare(`
    INSERT INTO items (
      id, url, title, summary, content, source_type, save_mode, note, tags,
      domain, thumbnail, transcript, processing, created_at, processed_at,
      capture_meta, error_message
    ) VALUES (
      @id, @url, @title, @summary, @content, @source_type, @save_mode, @note, @tags,
      @domain, @thumbnail, @transcript, @processing, @created_at, @processed_at,
      @capture_meta, @error_message
    )
  `).run({
    id,
    url: input.url,
    title: input.title ?? null,
    summary: input.summary ?? null,
    content: input.content ?? null,
    source_type: input.source_type,
    save_mode: input.save_mode,
    note: input.note ?? null,
    tags: input.tags ?? null,
    domain: input.domain ?? null,
    thumbnail: input.thumbnail ?? null,
    transcript: input.transcript ?? null,
    processing: input.processing ?? 'queued',
    created_at,
    processed_at: input.processed_at ?? null,
    capture_meta: input.capture_meta ?? null,
    error_message: input.error_message ?? null,
  });

  return getItemById(id);
}

function getItemById(id) {
  const row = getDb().prepare('SELECT * FROM items WHERE id = ?').get(id);
  return rowToItem(row);
}

function updateItem(id, fields) {
  const keys = Object.keys(fields).filter((key) => UPDATABLE_COLUMNS.has(key));

  if (keys.length === 0) {
    return getItemById(id);
  }

  const assignments = keys.map((key) => `${key} = @${key}`).join(', ');
  const params = { id };

  for (const key of keys) {
    params[key] = fields[key];
  }

  getDb().prepare(`UPDATE items SET ${assignments} WHERE id = @id`).run(params);
  return getItemById(id);
}

function listItems({ limit = 20, sort = 'created_at' } = {}) {
  const safeSort = SORTABLE_COLUMNS.has(sort) ? sort : 'created_at';
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const rows = getDb().prepare(`
    SELECT * FROM items
    ORDER BY ${safeSort} DESC
    LIMIT ?
  `).all(safeLimit);

  return rows.map(rowToItem);
}

function countItems() {
  const row = getDb().prepare('SELECT COUNT(*) AS count FROM items').get();
  return row.count;
}

function findRecentByUrl(url, sinceMs) {
  const row = getDb().prepare(`
    SELECT * FROM items
    WHERE url = ?
      AND created_at >= ?
      AND processing IN ('queued', 'processing', 'done')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(url, sinceMs);

  return rowToItem(row);
}

function getItemsByIds(ids) {
  if (!ids?.length) {
    return [];
  }

  const placeholders = ids.map(() => '?').join(', ');
  const rows = getDb().prepare(`
    SELECT * FROM items WHERE id IN (${placeholders})
  `).all(...ids);

  const byId = new Map(rows.map((row) => [row.id, rowToItem(row)]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

function buildFtsQuery(query) {
  const phraseMatch = query.match(/"([^"]+)"/);
  if (phraseMatch) {
    return `"${phraseMatch[1].replace(/"/g, '""')}"`;
  }

  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return '""';
  }

  return terms
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(' AND ');
}

function searchFts(query, limit = 20) {
  const ftsQuery = buildFtsQuery(query);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const rows = getDb().prepare(`
    SELECT
      items.id AS id,
      bm25(items_fts) AS rank
    FROM items_fts
    JOIN items ON items.rowid = items_fts.rowid
    WHERE items_fts MATCH @query
      AND items.processing = 'done'
    ORDER BY rank ASC
    LIMIT @limit
  `).all({ query: ftsQuery, limit: safeLimit });

  return rows.map((row) => ({
    id: row.id,
    score: 1 / (1 + Math.abs(row.rank ?? 0)),
  }));
}

function listFailedItems({ limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const rows = getDb().prepare(`
    SELECT * FROM items
    WHERE processing = 'failed'
    ORDER BY processed_at DESC, created_at DESC
    LIMIT ?
  `).all(safeLimit);

  return rows.map(rowToItem);
}

function listJobHistory({ days = 30, limit = 100 } = {}) {
  const safeDays = Math.min(Math.max(Number(days) || 30, 1), 90);
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const sinceMs = Date.now() - safeDays * 24 * 60 * 60 * 1000;

  const rows = getDb().prepare(`
    SELECT * FROM items
    WHERE created_at >= ?
      AND processing IN ('done', 'failed', 'queued', 'processing')
    ORDER BY COALESCE(processed_at, created_at) DESC
    LIMIT ?
  `).all(sinceMs, safeLimit);

  return rows.map(rowToItem);
}

function listStuckItems() {
  const rows = getDb().prepare(`
    SELECT * FROM items
    WHERE processing IN ('queued', 'processing')
    ORDER BY created_at ASC
  `).all();

  return rows.map(rowToItem);
}

function getLastSavedItem() {
  const row = getDb().prepare(`
    SELECT * FROM items
    WHERE processing = 'done'
    ORDER BY processed_at DESC
    LIMIT 1
  `).get();

  return rowToItem(row);
}

function listDoneItems({ limit = 1000, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 1000, 1), 10_000);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const rows = getDb().prepare(`
    SELECT * FROM items
    WHERE processing = 'done'
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(safeLimit, safeOffset);

  return rows.map(rowToItem);
}

module.exports = {
  createItem,
  getItemById,
  updateItem,
  listItems,
  countItems,
  findRecentByUrl,
  getItemsByIds,
  searchFts,
  listDoneItems,
  listFailedItems,
  listJobHistory,
  listStuckItems,
  getLastSavedItem,
};
