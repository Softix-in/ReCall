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

module.exports = {
  createItem,
  getItemById,
  updateItem,
  listItems,
  countItems,
  findRecentByUrl,
};
