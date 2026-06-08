const http = require('http');
const config = require('../src/config');
const itemsDb = require('../src/db/items');
const chromaDb = require('../src/db/chroma');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const req = http.request(
      {
        hostname: config.HOST,
        port: config.PORT,
        path,
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
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : null,
          });
        });
      }
    );

    req.on('error', reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('Phase 1 test — POST /capture');

  const capture = await request('POST', '/capture', {
    url: `https://example.com/?phase1-test=${Date.now()}`,
    title: 'Phase 1 Test Item',
    source_type: 'link',
    save_mode: 'auto_scrape',
    domain: 'example.com',
  });

  if (capture.status !== 201) {
    throw new Error(`Expected 201, got ${capture.status}: ${JSON.stringify(capture.body)}`);
  }

  const { id, processing } = capture.body;

  if (processing !== 'queued') {
    throw new Error(`Expected processing=queued, got ${processing}`);
  }

  const sqliteItem = itemsDb.getItemById(id);

  if (!sqliteItem) {
    throw new Error('Item missing from SQLite');
  }

  const chromaVector = chromaDb.getVector(id);

  if (!chromaVector) {
    throw new Error('Item missing from Chroma vector store');
  }

  console.log('SQLite row:', {
    id: sqliteItem.id,
    processing: sqliteItem.processing,
    url: sqliteItem.url,
  });

  console.log('Chroma vector:', {
    id: chromaVector.id,
    document: chromaVector.document,
  });

  console.log('Polling /status/:id until done...');

  let finalStatus = processing;

  for (let i = 0; i < 60; i += 1) {
    await sleep(1000);
    const status = await request('GET', `/status/${id}`);
    finalStatus = status.body.processing;
    console.log(`  attempt ${i + 1}: ${finalStatus}`);

    if (finalStatus === 'done' || finalStatus === 'failed') {
      break;
    }
  }

  if (finalStatus !== 'done') {
    throw new Error(`Expected processing=done, got ${finalStatus}`);
  }

  const list = await request('GET', '/items?limit=5');
  const aggregate = await request('GET', '/status');
  const duplicate = await request('POST', '/capture', {
    url: sqliteItem.url,
    source_type: 'link',
    save_mode: 'auto_scrape',
  });

  console.log('GET /items count:', list.body.items.length);
  console.log('GET /status:', aggregate.body);

  if (duplicate.status !== 409) {
    throw new Error(`Expected duplicate capture to return 409, got ${duplicate.status}`);
  }

  console.log('Duplicate capture correctly rejected with 409');

  const search = await request('GET', `/search?q=${encodeURIComponent('Phase 1')}`);

  if (search.status !== 200) {
    throw new Error(`Search failed: ${search.status}`);
  }

  console.log('GET /search results:', search.body.results.length);

  console.log('\nPhase 1 test passed.');
}

main().catch((error) => {
  console.error('\nPhase 1 test failed:', error.message);
  process.exit(1);
});
