const fs = require('fs');
const path = require('path');
const http = require('http');
const config = require('../src/config');
const { getSettings } = require('../src/services/settings-service');
const { runBackup } = require('../src/services/backup-service');

const ROOT = path.join(__dirname, '..', '..');

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function checkInstallArtifacts() {
  const files = [
    'install.ps1',
    'install.sh',
    'scripts/register-daemon.ps1',
    'scripts/register-daemon.sh',
    'recall-tray/windows-tray.ps1',
    'recall-tray/tray.py',
    'recall-tray/start-tray.sh',
    'CONTRIBUTING.md',
    'recall-extension/settings/settings.html',
  ];

  for (const file of files) {
    assert(fs.existsSync(path.join(ROOT, file)), `Missing ${file}`);
  }

  console.log('✓ Install + tray + docs artifacts');
}

async function testSettingsApi() {
  const get = await request('GET', '/settings');
  assert(get.status === 200, 'GET /settings failed');
  assert(get.body.settings.whisperModel, 'settings missing whisperModel');

  const put = await request('PUT', '/settings', {
    defaultSaveMode: 'manual_note',
    backupEnabled: true,
  });
  assert(put.status === 200, 'PUT /settings failed');
  assert(put.body.settings.defaultSaveMode === 'manual_note', 'settings not persisted');

  console.log('✓ Settings API');
}

async function testQueueControls() {
  const pause = await request('POST', '/queue/pause');
  assert(pause.status === 200 && pause.body.paused === true, 'pause failed');

  const resume = await request('POST', '/queue/resume');
  assert(resume.status === 200 && resume.body.paused === false, 'resume failed');

  const status = await request('GET', '/status');
  assert(status.body.paused === false, 'status should report paused flag');

  console.log('✓ Queue pause/resume');
}

async function testJobHistoryAndRetry() {
  const capture = await request('POST', '/capture', {
    url: `https://example.com/fail-job-test?ts=${Date.now()}`,
    save_mode: 'auto_scrape',
    domain: 'example.com',
  });
  assert(capture.status === 201, 'capture for retry test failed');

  const id = capture.body.id;
  let final = null;

  for (let i = 0; i < 30; i += 1) {
    const status = await request('GET', `/status/${id}`);
    if (status.body.processing === 'failed' || status.body.processing === 'done') {
      final = status.body;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  assert(final?.processing === 'failed', 'expected simulated failure');

  const retry = await request('POST', `/items/${id}/retry`);
  assert(retry.status === 200, 'retry endpoint failed');

  const history = await request('GET', '/jobs/history?days=30&limit=10');
  assert(history.status === 200, 'job history failed');
  assert(Array.isArray(history.body.jobs), 'jobs array missing');

  console.log('✓ Job history + retry');
}

async function testBackupAndLogs() {
  const result = runBackup();
  assert(result.ok || result.skipped, 'backup should succeed or skip');

  const daemonLog = path.join(config.LOGS_DIR, 'daemon.log');
  assert(fs.existsSync(daemonLog), 'daemon.log should exist after pipeline errors');

  console.log('✓ Backup + daemon.log');
}

async function main() {
  console.log('Phase 5 polish test\n');

  checkInstallArtifacts();

  const health = await request('GET', '/health');
  assert(health.status === 200, 'Backend not running — start with: npm start');
  console.log('✓ Backend health');

  getSettings();
  await testSettingsApi();
  await testQueueControls();
  await testJobHistoryAndRetry();
  await testBackupAndLogs();

  console.log('\nPhase 5 tests passed.');
}

main().catch((error) => {
  console.error('\nPhase 5 test failed:', error.message);
  process.exit(1);
});
