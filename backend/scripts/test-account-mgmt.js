#!/usr/bin/env node
/**
 * Account management acceptance tests — email verify, change password/email, forgot reset.
 * Requires: running backend (set HOST for remote, e.g. HOST=40.81.245.21).
 * With EMAIL_DEV_LOG=true, register/forgot/change-email responses include dev URLs.
 */

const http = require('http');
const config = require('../src/config');

function request(method, reqPath, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};

    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: config.HOST,
        port: config.PORT,
        path: reqPath,
        method,
        headers,
      },
      (res) => {
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
      },
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function tokenFromUrl(url, param = 'token') {
  if (!url) return null;
  const match = String(url).match(new RegExp(`[?&]${param}=([^&]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function verifyFromDevUrl(verificationUrl) {
  const token = tokenFromUrl(verificationUrl);
  assert(token, 'Missing token in verification_url');

  const res = await request('POST', '/auth/verify-email', { body: { token } });
  assert(res.status === 200, `Verify email failed: ${res.status} ${JSON.stringify(res.body)}`);
  assert(res.body.user?.email_verified === true, 'User should be verified');
  return res.body.user;
}

async function main() {
  const suffix = Date.now();
  const email = `acct-${suffix}@test.recall`;
  const password = 'password123';
  const newPassword = 'newpassword456';
  const newEmail = `acct-new-${suffix}@test.recall`;

  console.log(`Testing account flows against http://${config.HOST}:${config.PORT}`);

  const health = await request('GET', '/health');
  assert(health.status === 200, `Health check failed: ${health.status}`);
  console.log(`Backend version: ${health.body?.version}`);

  const registered = await request('POST', '/auth/register', {
    body: { email, password },
  });

  assert(registered.status === 201, `Register failed: ${registered.status} ${JSON.stringify(registered.body)}`);
  assert(registered.body.access_token, 'Missing access_token');
  assert(registered.body.user?.email_verified === false, 'New user should be unverified');

  const blocked = await request('GET', '/items', { token: registered.body.access_token });
  assert(blocked.status === 403, `Unverified user should get 403 on /items, got ${blocked.status}`);
  assert(blocked.body?.error === 'email_not_verified', 'Expected email_not_verified error');
  console.log('Unverified user blocked from protected routes');

  const meUnverified = await request('GET', '/auth/me', { token: registered.body.access_token });
  assert(meUnverified.status === 200, `/auth/me should work while unverified`);
  console.log('Unverified user can access /auth/me');

  assert(
    registered.body.verification_url,
    'Expected verification_url (set EMAIL_DEV_LOG=true on server for remote tests)',
  );

  await verifyFromDevUrl(registered.body.verification_url);
  console.log('Email verification succeeded');

  const items = await request('GET', '/items', { token: registered.body.access_token });
  assert(items.status === 200, `Verified user should access /items: ${items.status}`);
  console.log('Verified user can access protected routes');

  const changed = await request('POST', '/auth/change-password', {
    token: registered.body.access_token,
    body: { current_password: password, new_password: newPassword },
  });

  assert(changed.status === 200, `Change password failed: ${changed.status} ${JSON.stringify(changed.body)}`);
  console.log('Change password succeeded');

  const oldLogin = await request('POST', '/auth/login', {
    body: { email, password },
  });
  assert(oldLogin.status === 401, 'Old password should not login');

  const newLogin = await request('POST', '/auth/login', {
    body: { email, password: newPassword },
  });
  assert(newLogin.status === 200, `Login with new password failed: ${newLogin.status}`);
  const sessionToken = newLogin.body.access_token;
  console.log('Login with new password succeeded');

  const changeEmail = await request('POST', '/auth/change-email', {
    token: sessionToken,
    body: { new_email: newEmail, current_password: newPassword },
  });

  assert(changeEmail.status === 200, `Change email request failed: ${changeEmail.status} ${JSON.stringify(changeEmail.body)}`);
  assert(changeEmail.body.confirm_url, 'Expected confirm_url in dev mode');
  console.log('Change email request succeeded');

  const confirmToken = tokenFromUrl(changeEmail.body.confirm_url);
  const confirmed = await request('POST', '/auth/confirm-email-change', {
    body: { token: confirmToken },
  });

  assert(confirmed.status === 200, `Confirm email change failed: ${confirmed.status}`);
  assert(confirmed.body.user?.email === newEmail, 'Email should be updated');
  console.log('Email change confirmed');

  const forgot = await request('POST', '/auth/forgot-password', {
    body: { email: newEmail },
  });

  assert(forgot.status === 200, `Forgot password failed: ${forgot.status}`);
  assert(forgot.body.reset_url, 'Expected reset_url in dev mode');
  console.log('Forgot password request succeeded');

  const resetToken = tokenFromUrl(forgot.body.reset_url);
  const resetPassword = 'resetpass789';
  const reset = await request('POST', '/auth/reset-password', {
    body: { token: resetToken, new_password: resetPassword },
  });

  assert(reset.status === 200, `Reset password failed: ${reset.status} ${JSON.stringify(reset.body)}`);
  console.log('Password reset succeeded');

  const finalLogin = await request('POST', '/auth/login', {
    body: { email: newEmail, password: resetPassword },
  });

  assert(finalLogin.status === 200, `Final login failed: ${finalLogin.status}`);
  console.log('Login after reset with new email succeeded');

  console.log('\nAll account management tests passed.');
}

main().catch((error) => {
  console.error('Account management tests failed:', error.message);
  process.exit(1);
});
