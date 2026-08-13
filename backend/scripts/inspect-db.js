const Database = require('better-sqlite3');
const config = require('../src/config');

const db = new Database(config.DB_PATH, { readonly: true });

const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
).all();

console.log('Tables:', tables.map((t) => t.name).join(', '));

const migrations = db.prepare('SELECT * FROM schema_migrations ORDER BY id').all();
console.log('Migrations:', migrations);

const itemCount = db.prepare('SELECT COUNT(*) AS count FROM items').get();
console.log('Item count:', itemCount.count);

db.close();
