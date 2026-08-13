const { runMigrations } = require('../src/migrate');
const { ensureRecallDirs } = require('../src/fs');
const { closeDb } = require('../src/db/connection');
const { clearTestItems, countTestItems } = require('../src/services/item-deletion-service');

async function main() {
  ensureRecallDirs();
  runMigrations();

  const before = countTestItems();
  console.log(`Found ${before} example/test item(s) to remove`);

  if (before === 0) {
    console.log('Nothing to clear.');
    closeDb();
    return;
  }

  const result = await clearTestItems();
  console.log(`Removed ${result.count} item(s) from database and vector index.`);

  for (const entry of result.deleted) {
    console.log(`  - ${entry.url}`);
  }

  closeDb();
}

main().catch((error) => {
  console.error('Clear test data failed:', error.message);
  closeDb();
  process.exit(1);
});
