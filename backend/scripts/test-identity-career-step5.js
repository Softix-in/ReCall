/**
 * Step 5 acceptance tests — chat, AI settings test, rate limits.
 */

const crypto = require('crypto');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const TEST_HOME = path.join(os.tmpdir(), `recall-step5-${crypto.randomUUID()}`);
const API_KEY = 'test-step5-key';
const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY || '';
const PORT = String(20878 + Math.floor(Math.random() * 1000));
const BASE = `http://127.0.0.1:${PORT}`;
const BACKEND_ROOT = path.join(__dirname, '..');

const SAMPLE_JD = `
Senior Backend Engineer

Required: Node.js, TypeScript, PostgreSQL, REST APIs.
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

function startServer() {
  return spawn('node', ['src/server.js'], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      RECALL_HOME: TEST_HOME,
      RECALL_API_KEY: API_KEY,
      FIREWORKS_API_KEY: '',
      EMBED_AUTO_START: 'false',
      PORT,
      HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function runOfflineTests() {
  const chatInvalid = await request('POST', '/career/chat', {});
  assert(chatInvalid.status === 400, 'Chat should require messages');

  const chatMissingKey = await request('POST', '/career/chat', {
    messages: [{ role: 'user', content: 'hello' }],
  });
  assert(chatMissingKey.status === 400, 'Chat without API key should return 400');
  assert(chatMissingKey.data?.error === 'missing_api_key', 'Expected missing_api_key for chat');

  const testMissing = await request('POST', '/profile/ai-settings/test', {});
  assert(testMissing.status === 400, 'AI settings test should require key');
  assert(testMissing.data?.error === 'missing_api_key', 'Expected missing_api_key on test');

  const keywordAnalyze = await request('POST', '/career/analyze-jd', {
    jd_text: SAMPLE_JD,
    stream_bullets: false,
  });
  assert(keywordAnalyze.status === 200, 'Keyword-only analyze should succeed');
  assert(keywordAnalyze.data?.analysis?.keyword_only === true, 'Expected keyword_only flag');

  delete require.cache[require.resolve('../src/db/connection')];
  delete require.cache[require.resolve('../src/db/profile')];
  delete require.cache[require.resolve('../src/services/chat-handler')];
  const profileDb = require('../src/db/profile');
  const { executeTool } = require('../src/services/chat-handler');

  profileDb.getOrCreateProfile();
  const toolResult = await executeTool('update_profile_field', {
    field: 'github_url',
    value: 'https://github.com/step5-test',
  });
  assert(toolResult.ok === true, 'update_profile_field tool should succeed');
  assert(toolResult.profile.github_url === 'https://github.com/step5-test', 'Tool should persist profile field');

  const emptyName = await executeTool('add_project', { name: '   ' });
  assert(emptyName.ok === false, 'add_project should reject empty name');

  for (let i = 0; i < 9; i += 1) {
    const ok = await request('POST', '/career/analyze-jd', {
      jd_text: `${SAMPLE_JD}\nRate limit variant ${i}`,
      stream_bullets: false,
    });
    assert(ok.status === 200, `Analyze request ${i + 2} should succeed before rate limit`);
  }

  const rateLimited = await request('POST', '/career/analyze-jd', {
    jd_text: `${SAMPLE_JD}\nRate limit overflow`,
    stream_bullets: false,
  });
  assert(rateLimited.status === 429, '11th analyze should hit rate limit');
  assert(rateLimited.data?.error === 'rate_limit_exceeded', 'Expected rate_limit_exceeded error');

  console.log('Step 5 offline tests passed.');
}

async function runLiveTests() {
  await request('PUT', '/profile/ai-settings', { fireworks_api_key: FIREWORKS_API_KEY });

  const testKey = await request('POST', '/profile/ai-settings/test', {});
  assert(testKey.status === 200, 'API key test should succeed');
  assert(testKey.data?.ok === true, 'Expected ok from API key test');

  await request('PUT', '/profile', {
    display_name: 'Test User',
    linkedin_url: 'https://linkedin.com/in/old',
  });

  const chat = await request('POST', '/career/chat', {
    messages: [{ role: 'user', content: 'Update my linkedin_url to https://linkedin.com/in/test-user' }],
  });
  assert(chat.status === 200, 'Chat should succeed');
  assert(chat.data?.reply, 'Chat should return reply');
  assert(Array.isArray(chat.data?.actions_taken), 'Chat should return actions_taken');

  const profile = await request('GET', '/profile');
  assert(
    profile.data?.user_profile?.linkedin_url === 'https://linkedin.com/in/test-user',
    'Chat should update LinkedIn URL',
  );

  console.log('Step 5 live Fireworks tests passed.');
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
    process.env.RECALL_HOME = TEST_HOME;
    await runOfflineTests();

    if (FIREWORKS_API_KEY) {
      await runLiveTests();
    } else {
      console.log('Skipped Step 5 live Fireworks tests — set FIREWORKS_API_KEY to run integration tests.');
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
  console.error('Step 5 tests failed:', error.message);
  process.exit(1);
});
