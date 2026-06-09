const http = require('http');
const config = require('../src/config');
const embedClient = require('../src/services/embed-client');

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDone(id, timeoutMs = 60_000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const status = await request('GET', `/status/${id}`);
    if (status.body.processing === 'done' || status.body.processing === 'failed') {
      return status.body;
    }
    await sleep(1000);
  }

  throw new Error(`Timed out waiting for item ${id}`);
}

async function main() {
  console.log('Phase 3 test — semantic search');

  await embedClient.checkHealth();

  const unique = Date.now();
  const capture = await request('POST', '/capture', {
    url: `https://example.com/?phase3=${unique}`,
    save_mode: 'manual_note',
    note: 'Kafka exactly-once delivery requires idempotent producers and transactional writes.',
    domain: 'example.com',
  });

  if (capture.status !== 201) {
    throw new Error(`Capture failed: ${capture.status}`);
  }

  const itemId = capture.body.id;
  const final = await waitForDone(itemId);

  if (final.processing !== 'done') {
    throw new Error(`Item failed: ${final.error_message}`);
  }

  const searchStarted = Date.now();
  const search = await request(
    'GET',
    `/search?q=${encodeURIComponent('how does kafka achieve exactly once delivery')}`
  );
  const searchMs = Date.now() - searchStarted;

  if (search.status !== 200) {
    throw new Error(`Search failed: ${search.status} ${JSON.stringify(search.body)}`);
  }

  if (search.body.mode !== 'semantic' && search.body.mode !== 'hybrid') {
    throw new Error(`Unexpected search mode: ${search.body.mode}`);
  }

  const found = search.body.results.find((result) => result.id === itemId);

  if (!found) {
    throw new Error('Semantic search did not return the saved item');
  }

  console.log('Search latency:', `${searchMs}ms`);
  console.log('Search mode:', search.body.mode);
  console.log('Top result:', found.title);
  console.log('Score:', found.score);

  const keywordSearch = await request(
    'GET',
    `/search?q=${encodeURIComponent('"exactly-once"')}`
  );

  if (keywordSearch.status !== 200) {
    throw new Error(`Hybrid search failed: ${keywordSearch.status}`);
  }

  console.log('Hybrid search mode:', keywordSearch.body.mode);
  console.log('Hybrid results:', keywordSearch.body.results.length);

  const filtered = await request(
    'GET',
    `/search?q=${encodeURIComponent('kafka')}&mode=manual_note`
  );

  if (!filtered.body.results.every((row) => row.save_mode === 'manual_note')) {
    throw new Error('Filter mode=manual_note did not apply correctly');
  }

  if (searchMs > 500) {
    console.warn(`Warning: search took ${searchMs}ms (target <50ms after warm-up; first query may be slower)`);
  }

  console.log('\nPhase 3 test passed.');
}

main().catch((error) => {
  console.error('\nPhase 3 test failed:', error.message);
  process.exit(1);
});
