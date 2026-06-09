const http = require('http');
const crypto = require('crypto');
const config = require('../src/config');
const { runMigrations } = require('../src/migrate');
const { ensureRecallDirs } = require('../src/fs');
const { closeDb } = require('../src/db/connection');
const itemsDb = require('../src/db/items');
const embedClient = require('../src/services/embed-client');

const TARGET_ITEMS = Number(process.env.BENCHMARK_ITEMS) || 1000;
const QUERY_COUNT = Number(process.env.BENCHMARK_QUERIES) || 50;

const SAMPLE_TOPICS = [
  'distributed systems consensus',
  'machine learning embeddings',
  'browser extension architecture',
  'sqlite full text search',
  'video transcription whisper',
  'semantic search ranking',
  'local first applications',
  'knowledge management workflows',
];

function request(method, reqPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const req = http.request(
      {
        hostname: config.HOST,
        port: config.PORT,
        path: reqPath,
        method,
        headers: body
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            ms: 0,
            body: data ? JSON.parse(data) : null,
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function timedSearch(query) {
  const start = Date.now();
  const result = await request('GET', `/search?q=${encodeURIComponent(query)}`);
  return { ms: Date.now() - start, status: result.status, count: result.body?.results?.length ?? 0 };
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function seedItems(count) {
  const existing = itemsDb.countItems();
  const needed = Math.max(0, count - existing);

  if (needed === 0) {
    console.log(`Database already has ${existing} items — skipping seed`);
    return;
  }

  console.log(`Seeding ${needed} synthetic items...`);

  for (let i = 0; i < needed; i += 1) {
    const topic = SAMPLE_TOPICS[i % SAMPLE_TOPICS.length];
    const note = `${topic} benchmark item ${existing + i} with unique token zeta${existing + i}`;
    const item = itemsDb.createItem({
      url: `https://benchmark.recall.local/item/${existing + i}`,
      title: `Benchmark: ${topic} #${existing + i}`,
      summary: note,
      content: note,
      source_type: i % 3 === 0 ? 'video' : 'article',
      save_mode: 'manual_note',
      note,
      domain: 'benchmark.recall.local',
      processing: 'done',
      processed_at: Date.now(),
      created_at: Date.now() - i * 1000,
    });

    const embedding = await embedClient.embedText(note);
    await embedClient.upsertVector(item.id, embedding);
  }
}

async function main() {
  console.log('Recall search benchmark\n');

  ensureRecallDirs();
  runMigrations();

  try {
    await embedClient.checkHealth();
  } catch {
    console.error('Embed service must be running on port 7879. Start backend with: npm start');
    process.exit(1);
  }

  await seedItems(TARGET_ITEMS);

  const latencies = [];

  for (let i = 0; i < QUERY_COUNT; i += 1) {
    const topic = SAMPLE_TOPICS[i % SAMPLE_TOPICS.length];
    const { ms, status, count } = await timedSearch(`${topic} ${crypto.randomUUID().slice(0, 6)}`);
    latencies.push(ms);
    console.log(`Query ${i + 1}/${QUERY_COUNT}: ${ms}ms (${status}, ${count} results)`);
  }

  console.log('\n--- Results ---');
  console.log(`Items in DB: ${itemsDb.countItems()}`);
  console.log(`p50: ${percentile(latencies, 50)}ms`);
  console.log(`p95: ${percentile(latencies, 95)}ms`);
  console.log(`p99: ${percentile(latencies, 99)}ms`);
  console.log(`max: ${Math.max(...latencies)}ms`);

  const p99 = percentile(latencies, 99);
  const target = TARGET_ITEMS >= 10_000 ? 100 : 200;

  if (p99 > target) {
    console.warn(`\nWarning: p99 ${p99}ms exceeds target ${target}ms for ${TARGET_ITEMS} items`);
    process.exitCode = 1;
  } else {
    console.log(`\nPass: p99 within ${target}ms target`);
  }

  closeDb();
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  closeDb();
  process.exit(1);
});
