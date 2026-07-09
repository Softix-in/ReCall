const fs = require('fs');
const path = require('path');
const { getPool } = require('./db/pg-pool');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations', 'pg');

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

async function runMigrations() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    let applied = new Set();

    try {
      const appliedResult = await client.query('SELECT name FROM schema_migrations');
      applied = new Set(appliedResult.rows.map((row) => row.name));
    } catch (error) {
      if (error.code !== '42P01') {
        throw error;
      }
    }

    const files = getMigrationFiles();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`Skip (already applied): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`Applying: ${file}`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
          [file],
        );
        await client.query('COMMIT');
        console.log(`Applied: ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log('PostgreSQL migrations complete.');
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations };
