/**
 * Step 3 acceptance tests for JD analysis engine.
 * Offline tests always run. Live Fireworks tests run when FIREWORKS_API_KEY is set.
 *
 * Usage: npm run test:identity-career-step3
 *        FIREWORKS_API_KEY=... npm run test:identity-career-step3
 */

const crypto = require('crypto');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const TEST_HOME = path.join(os.tmpdir(), `recall-step3-${crypto.randomUUID()}`);
const API_KEY = 'test-step3-key';
const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY || '';
const PORT = String(18878 + Math.floor(Math.random() * 1000));
const BASE = `http://127.0.0.1:${PORT}`;
const BACKEND_ROOT = path.join(__dirname, '..');

const SAMPLE_JD = `
Senior Software Engineer — Backend

We are looking for a Senior Software Engineer to build APIs and distributed systems.
Required: Node.js, TypeScript, PostgreSQL, REST APIs, system design.
Preferred: React, Docker, Kubernetes, AWS.
You will design scalable services and collaborate with product teams.
`.trim();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs = 20_000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // not ready
    }

    await sleep(200);
  }

  throw new Error('Backend health check timed out');
}

async function request(method, route, body) {
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { status: response.status, data, response };
}

async function parseSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) {
        continue;
      }

      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') {
        continue;
      }

      events.push(JSON.parse(payload));
    }
  }

  return events;
}

function startServer(extraEnv = {}) {
  return spawn('node', ['src/server.js'], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      RECALL_HOME: TEST_HOME,
      RECALL_API_KEY: API_KEY,
      FIREWORKS_API_KEY: '',
      EMBED_AUTO_START: 'true',
      PORT,
      HOST: '127.0.0.1',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function runOfflineTests() {
  const emptyJd = await request('POST', '/career/analyze-jd', { jd_text: '   ' });
  assert(emptyJd.status === 400, 'Empty jd_text should return 400');

  const missingKey = await request('POST', '/career/analyze-jd', {
    jd_text: SAMPLE_JD,
    stream_bullets: false,
  });
  assert(missingKey.status === 200, 'Missing API key should use keyword-only fallback');
  assert(missingKey.data?.analysis?.keyword_only === true, 'Expected keyword_only analysis');

  const cachedFirst = await request('POST', '/career/analyze-jd', {
    jd_text: SAMPLE_JD,
    stream_bullets: false,
  });
  assert(cachedFirst.status === 200, 'Keyword-only analyze should succeed');

  const cachedSecond = await request('POST', '/career/analyze-jd', {
    jd_text: SAMPLE_JD,
    stream_bullets: false,
  });
  assert(
    cachedSecond.data?.analysis?.id === cachedFirst.data?.analysis?.id,
    'Cached keyword-only analysis should reuse same id',
  );

  await request('PUT', '/profile/ai-settings', { fireworks_api_key: 'fw_invalid_test_key_000' });

  const invalidKey = await request('POST', '/career/analyze-jd', {
    jd_text: SAMPLE_JD,
    stream_bullets: false,
  });
  assert(invalidKey.status === 401, 'Invalid API key should return 401');
  assert(invalidKey.data?.error === 'invalid_api_key', 'Expected invalid_api_key error');

  const list = await request('GET', '/career/analyses');
  assert(list.status === 200, 'List analyses should succeed');
  assert(Array.isArray(list.data?.analyses), 'Expected analyses array');

  const buildResume = await request('POST', '/career/build-resume', {
    format: 'json',
  });
  assert(buildResume.status === 400, 'build-resume should require ids');

  await request('PUT', '/profile/ai-settings', { fireworks_api_key: '' });

  const chatMissingKey = await request('POST', '/career/chat', {
    messages: [{ role: 'user', content: 'hi' }],
  });
  assert(chatMissingKey.status === 400, 'Chat without API key should return 400');
  assert(chatMissingKey.data?.error === 'missing_api_key', 'Expected missing_api_key for chat');

  console.log('Step 3 offline tests passed.');
}

async function runLiveTests() {
  await request('PUT', '/profile/ai-settings', { fireworks_api_key: FIREWORKS_API_KEY });

  await request('POST', '/profile/projects', {
    name: 'Recall',
    tagline: 'Personal knowledge engine',
    tech_stack: ['Node.js', 'PostgreSQL', 'Chrome Extension'],
    impact_bullets: ['Built a Chrome extension for saving web content'],
  });

  await sleep(3000);

  const first = await request('POST', '/career/analyze-jd', {
    jd_text: SAMPLE_JD,
    stream_bullets: false,
  });
  assert(first.status === 200, 'First analyze should succeed');
  assert(first.data?.analysis?.role_title, 'Expected role_title in analysis');
  assert(first.data?.analysis?.ranked_projects?.length >= 1, 'Expected ranked projects');

  const second = await request('POST', '/career/analyze-jd', {
    jd_text: SAMPLE_JD,
    stream_bullets: false,
  });
  assert(second.data?.analysis?.id === first.data?.analysis?.id, 'Cached analysis should reuse same id');

  const streamReq = await request('POST', '/career/analyze-jd', {
    jd_text: `${SAMPLE_JD}\nBonus keyword: GraphQL`,
    stream_bullets: true,
  });
  assert(streamReq.status === 200, 'Streaming analyze should succeed');
  const events = await parseSse(streamReq.response);
  assert(events.some((event) => event.type === 'analysis'), 'Expected analysis event');
  assert(events.some((event) => event.type === 'done'), 'Expected done event');

  const list = await request('GET', '/career/analyses');
  assert(list.data?.analyses?.length >= 1, 'Expected analysis history');

  const detail = await request('GET', `/career/analyses/${first.data.analysis.id}`);
  assert(detail.status === 200, 'GET analysis by id should succeed');
  assert(detail.data?.analysis?.tailored_bullets, 'Expected tailored_bullets on detail');

  console.log('Step 3 live Fireworks tests passed.');
}

async function run() {
  fs.mkdirSync(path.join(TEST_HOME, 'data'), { recursive: true });

  await new Promise((resolve, reject) => {
    const migrate = spawn('node', ['src/migrate.js'], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, RECALL_HOME: TEST_HOME },
      stdio: 'inherit',
    });

    migrate.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Migration failed with code ${code}`));
      }
    });
  });

  const server = startServer();

  try {
    await waitForHealth();
    await runOfflineTests();

    if (FIREWORKS_API_KEY) {
      await runLiveTests();
    } else {
      console.log('Skipped Step 3 live Fireworks tests — set FIREWORKS_API_KEY to run integration tests.');
    }
  } finally {
    server.kill('SIGTERM');
    await sleep(500);

    try {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

run().catch((error) => {
  console.error('Step 3 tests failed:', error.message);
  process.exit(1);
});
