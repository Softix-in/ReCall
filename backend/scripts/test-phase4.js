const fs = require('fs');
const path = require('path');
const http = require('http');
const config = require('../src/config');

const EXTENSION_ROOT = path.join(__dirname, '..', '..', 'recall-extension');

function request(method, route, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const req = http.request(
      {
        hostname: config.HOST,
        port: config.PORT,
        path: route,
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function checkExtensionFiles() {
  const required = [
    'manifest.json',
    'popup/popup.html',
    'popup/popup.js',
    'popup/popup.css',
    'content/content.js',
    'background/service-worker.js',
    'search/search.html',
    'search/search.js',
    'search/search.css',
    'shared/api.js',
    'shared/utils.js',
    'icons/icon-16.png',
    'icons/icon-48.png',
    'icons/icon-128.png',
  ];

  for (const file of required) {
    const absolute = path.join(EXTENSION_ROOT, file);
    assert(fs.existsSync(absolute), `Missing extension file: ${file}`);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION_ROOT, 'manifest.json'), 'utf8'));
  assert(manifest.manifest_version === 3, 'manifest_version must be 3');
  assert(manifest.commands?.['quick-save'], 'quick-save command missing');
  console.log('✓ Extension file structure');
}

async function testCapturePayload() {
  const payload = {
    url: `https://example.com/phase4-test?ts=${Date.now()}`,
    title: 'Phase 4 Extension Test',
    og_title: 'Phase 4 Extension Test',
    og_description: 'Testing extension capture payload',
    og_image: 'https://example.com/image.png',
    og_type: 'article',
    domain: 'example.com',
    has_video: false,
    save_mode: 'auto_scrape',
  };

  const capture = await request('POST', '/capture', payload);
  assert(capture.status === 201, `Expected 201 from /capture, got ${capture.status}`);
  assert(capture.body.id, 'Capture response missing id');

  const status = await request('GET', `/status/${capture.body.id}`);
  assert(status.status === 200, `Expected 200 from /status/:id, got ${status.status}`);
  assert(status.body.processing, 'Status response missing processing field');

  const item = await request('GET', `/items/${capture.body.id}`);
  assert(item.status === 200, `Expected 200 from /items/:id, got ${item.status}`);
  assert(item.body.item.url === payload.url, 'Item URL mismatch');

  const transcriptItem = await request('GET', `/items/${capture.body.id}?include_transcript=1`);
  assert(transcriptItem.status === 200, 'include_transcript query failed');

  console.log('✓ Capture + status + item detail endpoints');
  return capture.body.id;
}

async function testVaultNoteMode() {
  const payload = {
    url: `https://example.com/phase4-note?ts=${Date.now()}`,
    domain: 'example.com',
    save_mode: 'manual_note',
    note: 'Saved from link vault in note mode',
  };

  const capture = await request('POST', '/link', payload);
  assert(capture.status === 201, `Expected 201 from /link, got ${capture.status}`);
  console.log('✓ Link vault endpoint (/link)');
}

async function testListAndSearch() {
  const items = await request('GET', '/items?limit=5');
  assert(items.status === 200, `Expected 200 from /items, got ${items.status}`);
  assert(Array.isArray(items.body.items), 'Items response missing items array');

  const search = await request('GET', '/search?q=extension');
  assert(search.status === 200, `Expected 200 from /search, got ${search.status}`);
  assert(Array.isArray(search.body.results), 'Search response missing results array');

  console.log('✓ Items list + search endpoints');
}

async function main() {
  console.log('Phase 4 extension integration test\n');

  checkExtensionFiles();

  const health = await request('GET', '/health');
  assert(health.status === 200, 'Backend is not running. Start with: npm start');
  console.log('✓ Backend health');

  await testCapturePayload();
  await testVaultNoteMode();
  await testListAndSearch();

  console.log('\nPhase 4 tests passed.');
}

main().catch((error) => {
  console.error('\nPhase 4 test failed:', error.message);
  process.exit(1);
});
