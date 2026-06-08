const Database = require('better-sqlite3');
const config = require('../src/config');

const db = new Database(config.DB_PATH);

db.prepare(`
  INSERT INTO items (id, url, source_type, save_mode, processing, created_at, title, summary)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  'test-uuid-1',
  'https://example.com',
  'link',
  'auto_scrape',
  'queued',
  Date.now(),
  'Example Title',
  'Kafka exactly once delivery'
);

const ftsResults = db.prepare(
  "SELECT rowid, title FROM items_fts WHERE items_fts MATCH 'kafka'"
).all();

console.log('FTS search results:', ftsResults);

db.prepare('DELETE FROM items WHERE id = ?').run('test-uuid-1');
db.close();

console.log('FTS trigger test passed:', ftsResults.length === 1);
