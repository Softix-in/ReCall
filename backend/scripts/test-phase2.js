const fs = require('fs');
const http = require('http');
const path = require('path');
const config = require('../src/config');
const { summariseText } = require('../src/pipeline/summarise');

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
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
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
    const state = status.body.processing;

    if (state === 'done' || state === 'failed') {
      return status.body;
    }

    await sleep(1000);
  }

  throw new Error(`Timed out waiting for item ${id}`);
}

async function testSummariser() {
  console.log('Testing TF-IDF summariser...');

  const sample = `
    Apache Kafka is a distributed event streaming platform.
    It is used by thousands of companies for high-performance data pipelines.
    Exactly-once semantics can be achieved using idempotent producers and transactions.
    Consumers read from topics using consumer groups for scalable processing.
    Kafka stores records in topics that are split into partitions.
  `;

  const result = await summariseText(sample);

  if (!result.title || !result.summary) {
    throw new Error('Summariser returned empty title or summary');
  }

  console.log('  title:', result.title.slice(0, 80));
  console.log('  summary length:', result.summary.length);
}

async function testLinkCapture() {
  console.log('\nTesting link capture (example.com)...');

  const uniqueUrl = `https://example.com/?recall-phase2=${Date.now()}`;
  const capture = await request('POST', '/capture', {
    url: uniqueUrl,
    source_type: 'link',
    save_mode: 'auto_scrape',
    domain: 'example.com',
  });

  if (capture.status !== 201) {
    throw new Error(`Capture failed: ${capture.status}`);
  }

  const final = await waitForDone(capture.body.id, 30_000);

  if (final.processing !== 'done') {
    throw new Error(`Link capture failed: ${final.error_message}`);
  }

  const item = await request('GET', `/status/${capture.body.id}`);

  if (!item.body.title) {
    throw new Error('Link capture missing title');
  }

  console.log('  done:', item.body.title);
}

async function testManualNote() {
  console.log('\nTesting manual note capture...');

  const capture = await request('POST', '/capture', {
    url: `https://example.org/?note=${Date.now()}`,
    save_mode: 'manual_note',
    note: 'Kafka exactly-once delivery. Remember to review idempotent producers.',
    domain: 'example.org',
  });

  const final = await waitForDone(capture.body.id, 30_000);

  if (final.processing !== 'done') {
    throw new Error(`Manual note failed: ${final.error_message}`);
  }

  if (!final.title.includes('Kafka')) {
    throw new Error(`Expected note first sentence as title, got: ${final.title}`);
  }

  console.log('  title:', final.title);
}

async function testOptionalVideo() {
  if (process.env.SKIP_VIDEO_TEST === '1') {
    console.log('\nSkipping video test (SKIP_VIDEO_TEST=1)');
    return;
  }

  const videoUrl = process.env.PHASE2_VIDEO_URL;
  if (!videoUrl) {
    console.log('\nSkipping video test (set PHASE2_VIDEO_URL to run)');
    return;
  }

  console.log('\nTesting video capture (requires yt-dlp + Whisper)...');

  const capture = await request('POST', '/capture', {
    url: videoUrl,
    save_mode: 'auto_scrape',
  });

  const final = await waitForDone(capture.body.id, 180_000);

  if (final.processing !== 'done') {
    throw new Error(`Video capture failed: ${final.error_message}`);
  }

  const transcriptPath = path.join(
    config.TRANSCRIPTS_DIR,
    `${capture.body.id}.txt`
  );

  if (!fs.existsSync(transcriptPath)) {
    throw new Error(`Transcript file missing: ${transcriptPath}`);
  }

  console.log('  transcript bytes:', fs.statSync(transcriptPath).size);
  console.log('  title:', final.title);
}

async function main() {
  await testSummariser();
  await testLinkCapture();
  await testManualNote();
  await testOptionalVideo();
  console.log('\nPhase 2 tests passed.');
}

main().catch((error) => {
  console.error('\nPhase 2 test failed:', error.message);
  process.exit(1);
});
