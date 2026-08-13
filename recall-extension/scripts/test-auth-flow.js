#!/usr/bin/env node
/**
 * Phase 3 extension auth milestone — exercises the same JWT API contract as the extension.
 * Requires: DATABASE_URL, JWT keys, backend on PORT (default 7878).
 *
 *   cd backend && npm run migrate && npm start
 *   node ../recall-extension/scripts/test-auth-flow.js
 */

const crypto = require('crypto');
const http = require('http');

const HOST = process.env.RECALL_HOST || '127.0.0.1';
const PORT = Number(process.env.RECALL_PORT || 7878);
const DEVICE = 'chrome-extension';

function request(method, path, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { Accept: 'application/json' };

    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const req = http.request({ hostname: HOST, port: PORT, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        if (data) {
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = { raw: data };
          }
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function assertOk(label, res, expectedStatus = 200) {
  if (res.status !== expectedStatus) {
    throw new Error(`${label}: expected ${expectedStatus}, got ${res.status} — ${JSON.stringify(res.body)}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDone(id, token, timeoutMs = 60_000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const status = await request('GET', `/status/${id}`, { token });
    const processing = status.body?.processing;

    if (processing === 'done' || processing === 'failed') {
      return status.body;
    }

    await sleep(1000);
  }

  throw new Error(`Timed out waiting for item ${id}`);
}

async function main() {
  console.log('Phase 3 extension auth flow test');

  const health = await request('GET', '/health');
  assertOk('health', health);

  const email = `phase3-${Date.now()}@example.com`;
  const password = 'test-password-phase3';

  const register = await request('POST', '/auth/register', {
    body: { email, password, device: DEVICE },
  });
  assertOk('register', register, 201);

  let accessToken = register.body.access_token;
  let refreshToken = register.body.refresh_token;

  const me = await request('GET', '/auth/me', { token: accessToken });
  assertOk('auth/me', me);
  if (me.body.user?.email !== email) {
    throw new Error('auth/me email mismatch');
  }

  const itemIds = [];

  for (let i = 0; i < 5; i += 1) {
    const capture = await request('POST', '/capture', {
      token: accessToken,
      body: {
        url: `https://example.com/phase3-item-${Date.now()}-${i}`,
        title: `Phase 3 test item ${i + 1}`,
        save_mode: 'manual_note',
        note: `Extension auth milestone note ${i + 1}`,
        domain: 'example.com',
      },
    });
    assertOk(`capture ${i + 1}`, capture, 201);
    itemIds.push(capture.body.id);
    await waitForDone(capture.body.id, accessToken);
  }

  const itemsAfterCapture = await request('GET', '/items?limit=20', { token: accessToken });
  assertOk('items after capture', itemsAfterCapture);
  const capturedVisible = itemIds.filter((id) => itemsAfterCapture.body.items?.some((item) => item.id === id));
  if (capturedVisible.length < 5) {
    throw new Error(`Expected 5 captured items visible, found ${capturedVisible.length}`);
  }

  const search = await request('GET', `/search?q=${encodeURIComponent('Phase 3 test')}`, {
    token: accessToken,
  });
  assertOk('search', search);

  const logout = await request('POST', '/auth/logout', {
    token: accessToken,
    body: { refresh_token: refreshToken },
  });
  assertOk('logout', logout);

  const login = await request('POST', '/auth/login', {
    body: { email, password, device: DEVICE },
  });
  assertOk('login', login);
  accessToken = login.body.access_token;
  refreshToken = login.body.refresh_token;

  const items = await request('GET', '/items?limit=20', { token: accessToken });
  assertOk('items after re-login', items);
  const found = itemIds.filter((id) => items.body.items?.some((item) => item.id === id));
  if (found.length < 5) {
    throw new Error(`Expected 5 saved items after re-login, found ${found.length}`);
  }

  const refresh = await request('POST', '/auth/refresh', {
    body: { refresh_token: refreshToken, device: DEVICE },
  });
  assertOk('refresh', refresh);
  accessToken = refresh.body.access_token;
  refreshToken = refresh.body.refresh_token;

  const meAfterRefresh = await request('GET', '/auth/me', { token: accessToken });
  assertOk('auth/me after refresh', meAfterRefresh);

  const staleRefresh = await request('POST', '/auth/refresh', {
    body: { refresh_token: refreshToken, device: DEVICE },
  });
  // Old refresh token should be rotated — using new one above succeeded; verify old is invalid
  const oldToken = register.body.refresh_token;
  const rejected = await request('POST', '/auth/refresh', {
    body: { refresh_token: oldToken, device: DEVICE },
  });
  if (rejected.status === 200) {
    throw new Error('Expected rotated refresh token to be rejected');
  }

  console.log('Phase 3 extension auth flow: PASS');
  console.log(`  user: ${email}`);
  console.log(`  items: ${itemIds.length} captured, ${found.length} visible after re-login`);
}

main().catch((error) => {
  console.error('Phase 3 extension auth flow: FAIL');
  console.error(error.message);
  process.exit(1);
});
