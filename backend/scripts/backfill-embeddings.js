const itemsDb = require('../src/db/items');
const embeddingService = require('../src/services/embedding-service');
const { startEmbedService } = require('../src/services/embed-launcher');
const usersDb = require('../src/db/users');
const config = require('../src/config');

async function main() {
  await startEmbedService();

  const bootstrapUser = await usersDb.getOrCreateBootstrapUser(config.BOOTSTRAP_USER_EMAIL);
  const userId = bootstrapUser.id;

  const items = await itemsDb.listDoneItems(userId, { limit: 10_000 });
  let embedded = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Backfilling embeddings for ${items.length} done items (user ${userId})...`);

  for (const item of items) {
    try {
      if (item.embedding) {
        skipped += 1;
        continue;
      }

      await embeddingService.embedAndStoreItem(userId, item);
      embedded += 1;
      console.log(`Embedded: ${item.id} — ${item.title || item.url}`);
    } catch (error) {
      failed += 1;
      console.error(`Failed ${item.id}: ${error.message}`);
    }
  }

  console.log(`\nBackfill complete. embedded=${embedded}, skipped=${skipped}, failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Backfill failed:', error.message);
  process.exit(1);
});
