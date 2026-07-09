const Database = require('better-sqlite3');
const db = new Database('/data/recall/data/recall.db', { readonly: true });

const items = db.prepare('SELECT COUNT(*) AS c FROM items').get();
const done = db.prepare("SELECT COUNT(*) AS c FROM items WHERE processing = 'done'").get();
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
const recent = db.prepare('SELECT id, title, url, processing, created_at FROM items ORDER BY created_at DESC LIMIT 10').all();

console.log(JSON.stringify({ items: items.c, done: done.c, tables: tables.map((t) => t.name), recent }, null, 2));
