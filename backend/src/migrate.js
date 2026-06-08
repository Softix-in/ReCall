const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');
const { ensureRecallDirs } = require('./fs');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function getMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

function runMigrations() {
  ensureRecallDirs();

  const db = new Database(config.DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((row) => row.name)
  );

  const files = getMigrationFiles();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skip (already applied): ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`Applying: ${file}`);

    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)'
      ).run(file, Date.now());
    });

    apply();
    console.log(`Applied: ${file}`);
  }

  db.close();
  console.log(`Migrations complete. DB: ${config.DB_PATH}`);
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
