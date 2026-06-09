const itemsDb = require('../src/db/items');
const chromaDb = require('../src/db/chroma');
const { startEmbedService } = require('../src/services/embed-launcher');

async function main() {
  await startEmbedService();

  const items = itemsDb.listDoneItems({ limit: 10_000 });
  let embedded = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Backfilling embeddings for ${items.length} done items...`);

  for (const item of items) {
    try {
      const existing = await chromaDb.getVector(item.id);
      if (existing?.embedding?.length) {
        skipped += 1;
        continue;
      }

      await chromaDb.upsertItemVector(item);
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
