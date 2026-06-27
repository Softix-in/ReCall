/**
 * Step 1 acceptance tests for Identity & Career backend foundation.
 * Usage: node scripts/test-identity-career-step1.js
 */

const crypto = require('crypto');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const TEST_HOME = path.join(os.tmpdir(), `recall-step1-${crypto.randomUUID()}`);
const API_KEY = 'test-step1-key';
const PORT = String(17878 + Math.floor(Math.random() * 1000));
const BASE = `http://127.0.0.1:${PORT}`;
const BACKEND_ROOT = path.join(__dirname, '..');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs = 15_000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // server not ready
    }

    await sleep(200);
  }

  throw new Error('Backend health check timed out');
}

async function request(method, route, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };

  if (auth) {
    headers.Authorization = `Bearer ${API_KEY}`;
  }

  const response = await fetch(`${BASE}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  return { status: response.status, data };
}

async function waitForEmbedding(projectId, timeoutMs = 15_000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const response = await request('GET', `/profile/projects`);
    const project = response.data.projects.find((entry) => entry.id === projectId);

    if (project?.has_embedding) {
      return project;
    }

    await sleep(200);
  }

  throw new Error(`Timed out waiting for embedding on project ${projectId}`);
}

function startServer() {
  return spawn('node', ['src/server.js'], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      RECALL_HOME: TEST_HOME,
      RECALL_API_KEY: API_KEY,
      EMBED_AUTO_START: 'true',
      PORT,
      HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function run() {
  fs.mkdirSync(path.join(TEST_HOME, 'data'), { recursive: true });

  const migrate = spawn('node', ['src/migrate.js'], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, RECALL_HOME: TEST_HOME },
    stdio: 'inherit',
  });

  await new Promise((resolve, reject) => {
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

    const unauthorized = await request('GET', '/profile', null, { auth: false });
    assert(unauthorized.status === 401, 'Expected 401 without API key');

    const initial = await request('GET', '/profile');
    assert(initial.status === 200, 'GET /profile should succeed');
    assert(initial.data.user_profile.id === null, 'Profile should start empty');
    assert(Array.isArray(initial.data.projects), 'Projects should be an array');
    assert(initial.data.master_resume === null, 'Master resume should be null initially');

    const updated = await request('PUT', '/profile', {
      display_name: 'Test User',
      skills: ['React', 'Node.js'],
    });
    assert(updated.status === 200, 'PUT /profile should succeed');
    assert(updated.data.user_profile.display_name === 'Test User', 'Display name should persist');

    const project = await request('POST', '/profile/projects', {
      name: 'Recall',
      tagline: 'Knowledge engine',
      impact_bullets: ['Built Chrome extension'],
    });
    assert(project.status === 201, 'POST /profile/projects should succeed');

    const projectId = project.data.project.id;
    const reordered = await request('PUT', '/profile/projects/reorder', {
      ordered_ids: [projectId],
    });
    assert(reordered.status === 200, 'PUT /profile/projects/reorder should succeed');

    const health = await request('GET', '/health');
    if (health.data?.embed?.ok) {
      const embedded = await waitForEmbedding(projectId);
      assert(embedded.has_embedding === true, 'Project embedding should be stored');
    } else {
      console.warn('Embed service unavailable — skipping embedding assertion');
    }

    const resume = await request('POST', '/profile/resume', {
      experience: [{ company: 'Acme', role: 'Engineer', bullets: ['Shipped features'] }],
      education: [{ institution: 'University', degree: 'BSc CS', year: '2024' }],
      certifications: [],
    });
    assert(resume.status === 200, 'POST /profile/resume should succeed');
    assert(resume.data.resume.is_master === true, 'Saved resume should be master');

    const chatInvalid = await request('POST', '/career/chat', {});
    assert(chatInvalid.status === 400, 'Chat should require messages array');

    const items = await request('GET', '/items?limit=1');
    assert(items.status === 200, 'Existing /items route should still work');

    console.log('Step 1 tests passed.');
  } finally {
    server.kill('SIGTERM');
    await sleep(500);

    try {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors on Windows file locks
    }
  }
}

run().catch((error) => {
  console.error('Step 1 tests failed:', error.message);
  process.exit(1);
});
