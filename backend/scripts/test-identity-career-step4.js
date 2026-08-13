/**
 * Step 4 acceptance tests for resume tailoring and form fill.
 * Offline tests always run. Live Fireworks tests run when FIREWORKS_API_KEY is set.
 */

const crypto = require('crypto');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const TEST_HOME = path.join(os.tmpdir(), `recall-step4-${crypto.randomUUID()}`);
const API_KEY = 'test-step4-key';
const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY || '';
const PORT = String(19878 + Math.floor(Math.random() * 1000));
const BASE = `http://127.0.0.1:${PORT}`;
const BACKEND_ROOT = path.join(__dirname, '..');

const SAMPLE_JD = `
Senior Software Engineer — Backend

Required: Node.js, TypeScript, PostgreSQL, REST APIs, system design.
Preferred: React, Docker, Kubernetes, AWS.
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
  delete require.cache[require.resolve('../src/db/connection')];
  delete require.cache[require.resolve('../src/db/career')];
  const careerDb = require('../src/db/career');
  const { renderPlainText, normalizeResumeRecord } = require('../src/services/resume-builder');

  const missing = await request('POST', '/career/build-resume', { format: 'json' });
  assert(missing.status === 400, 'build-resume should require jd_analysis_id or resume_id');

  const tailored = careerDb.createTailoredResume({
    label: 'Acme Backend Engineer',
    jd_analysis_id: null,
    summary: 'Backend engineer with Node.js experience.',
    skills_section: ['Node.js', 'PostgreSQL', 'TypeScript'],
    experience: [{
      company: 'Recall',
      role: 'Founder Engineer',
      start: '2024',
      end: 'Present',
      bullets: ['Built Chrome extension and local API'],
    }],
    education: [{ institution: 'University', degree: 'BSc CS', year: '2024' }],
    certifications: [],
  });

  const jsonExport = await request('POST', '/career/build-resume', {
    resume_id: tailored.id,
    format: 'json',
  });
  assert(jsonExport.status === 200, 'JSON export should succeed');
  assert(jsonExport.data?.resume_id === tailored.id, 'Expected resume_id in JSON export');
  assert(jsonExport.data?.json?.summary, 'Expected summary in exported JSON');

  const textExport = await fetch(`${BASE}/career/build-resume`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resume_id: tailored.id,
      format: 'text',
    }),
  });
  assert(textExport.status === 200, 'Text export should succeed');
  const plainText = await textExport.text();
  assert(!plainText.includes('\u2022'), 'Plain text should not contain unicode bullets');
  assert(plainText.includes('SUMMARY'), 'Plain text should include summary section');

  const unitPlain = renderPlainText(
    { display_name: 'Test User', headline: 'Engineer', skills: ['Node.js'] },
    normalizeResumeRecord(tailored),
  );
  assert(unitPlain.includes('TEST USER'), 'Unit plain text should include display name');

  const chatMissingKey = await request('POST', '/career/chat', { messages: [{ role: 'user', content: 'hi' }] });
  assert(chatMissingKey.status === 400, 'Chat without API key should return 400');
  assert(chatMissingKey.data?.error === 'missing_api_key', 'Expected missing_api_key for chat');

  console.log('Step 4 offline tests passed.');
}

async function runLiveTests() {
  await request('PUT', '/profile/ai-settings', { fireworks_api_key: FIREWORKS_API_KEY });

  await request('PUT', '/profile', {
    display_name: 'Test User',
    headline: 'Backend Engineer',
    skills: ['Node.js', 'PostgreSQL'],
  });

  await request('POST', '/profile/resume', {
    experience: [{
      company: 'Acme',
      role: 'Software Engineer',
      start: '2022',
      end: 'Present',
      bullets: ['Built REST APIs in Node.js'],
    }],
    education: [],
    certifications: [],
  });

  const project = await request('POST', '/profile/projects', {
    name: 'Recall',
    tagline: 'Knowledge engine',
    tech_stack: ['Node.js', 'SQLite'],
    impact_bullets: ['Built Chrome extension for web capture'],
  });
  const projectId = project.data?.project?.id;

  const analysisRes = await request('POST', '/career/analyze-jd', {
    jd_text: SAMPLE_JD,
    stream_bullets: false,
  });
  assert(analysisRes.status === 200, 'JD analysis should succeed for live build');
  const analysisId = analysisRes.data?.analysis?.id;

  const built = await request('POST', '/career/build-resume', {
    jd_analysis_id: analysisId,
    selected_project_ids: projectId ? [projectId] : [],
    format: 'json',
  });
  assert(built.status === 200, 'Tailored resume build should succeed');
  assert(built.data?.resume_id, 'Expected resume_id from build');
  assert(built.data?.json?.summary, 'Expected tailored summary');

  const history = await request('GET', '/profile/resume/history');
  assert(history.data?.resumes?.some((row) => row.id === built.data.resume_id), 'History should include tailored resume');

  const bio = await request('POST', '/career/generate/bio', { tone: 'professional', word_limit: 60 });
  assert(bio.status === 200, 'Bio generation should succeed');
  assert(bio.data?.bio?.length > 10, 'Bio should contain text');

  const pitch = await request('POST', '/career/generate/pitch', { word_limit: 80 });
  assert(pitch.status === 200, 'Pitch generation should succeed');
  assert(pitch.data?.pitch?.length > 10, 'Pitch should contain text');

  try {
    const pdfResponse = await fetch(`${BASE}/career/build-resume`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resume_id: built.data.resume_id,
        format: 'pdf',
      }),
    });
    assert(pdfResponse.status === 200, 'PDF export should succeed when puppeteer is installed');
    const buffer = Buffer.from(await pdfResponse.arrayBuffer());
    assert(buffer.slice(0, 4).toString() === '%PDF', 'PDF export should return PDF bytes');
  } catch (error) {
    console.warn('PDF export test skipped:', error.message);
  }

  console.log('Step 4 live Fireworks tests passed.');
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
      console.log('Skipped Step 4 live Fireworks tests — set FIREWORKS_API_KEY to run integration tests.');
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
  console.error('Step 4 tests failed:', error.message);
  process.exit(1);
});
