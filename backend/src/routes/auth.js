const express = require('express');
const authService = require('../services/auth-service');
const { escapeHtml } = require('../utils/html-escape');
const { sendError } = require('../utils/http-error');

function htmlPage(title, body) {
  const safeTitle = escapeHtml(title);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${safeTitle}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'"/>
<style>body{font-family:Inter,system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 20px;color:#e8e8e8;background:#111}
.card{background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:24px}h1{font-size:1.25rem;margin:0 0 12px}
p{color:#a3a3a3;line-height:1.5}label{display:block;margin:12px 0 4px;font-size:.875rem}
input{width:100%;padding:10px;border-radius:8px;border:1px solid #444;background:#0d0d0d;color:#fff;box-sizing:border-box}
button{margin-top:16px;padding:10px 16px;border:none;border-radius:8px;background:#6366f1;color:#fff;font-weight:600;cursor:pointer}
.error{color:#fca5a5;margin-top:12px}.success{color:#86efac}</style></head>
<body><div class="card"><h1>${safeTitle}</h1>${body}</div></body></html>`;
}

function createAuthRouter() {
  const router = express.Router();

  router.post('/register', async (req, res) => {
    try {
      const { email, password, device } = req.body || {};
      const result = await authService.register(email, password, device);
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error, 'Unable to create account');
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const { email, password, device } = req.body || {};
      const result = await authService.login(email, password, device);
      res.json(result);
    } catch (error) {
      sendError(res, error, 'Invalid email or password');
    }
  });

  router.post('/refresh', async (req, res) => {
    try {
      const refreshToken = req.body?.refresh_token;
      const result = await authService.refresh(refreshToken, req.body?.device);
      res.json(result);
    } catch (error) {
      sendError(res, error, 'Invalid or expired refresh token');
    }
  });

  router.post('/logout', async (req, res) => {
    try {
      const result = await authService.logout(req.body?.refresh_token);
      res.json(result);
    } catch (error) {
      sendError(res, error, 'Logout failed');
    }
  });

  router.get('/me', async (req, res) => {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const user = await authService.getMe(req.user.id);
      res.json({ user });
    } catch (error) {
      sendError(res, error, 'Failed to load account');
    }
  });

  router.get('/verify-email', async (req, res) => {
    const token = req.query.token;

    if (!token) {
      res.status(400).send(htmlPage('Verification failed', '<p class="error">Missing verification token.</p>'));
      return;
    }

    try {
      await authService.verifyEmail(token);
      res.send(htmlPage(
        'Email verified',
        '<p class="success">Your email is verified. You can close this tab and return to the Recall extension.</p>',
      ));
    } catch (error) {
      res.status(error.status || 400).send(htmlPage('Verification failed', '<p class="error">Invalid or expired verification token.</p>'));
    }
  });

  router.post('/verify-email', async (req, res) => {
    try {
      const user = await authService.verifyEmail(req.body?.token);
      res.json({ ok: true, user });
    } catch (error) {
      sendError(res, error, 'Invalid or expired verification token');
    }
  });

  router.post('/resend-verification', async (req, res) => {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const result = await authService.resendVerification(req.user.id);
      res.json(result);
    } catch (error) {
      sendError(res, error, 'Failed to resend verification');
    }
  });

  router.post('/change-password', async (req, res) => {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const { current_password, new_password } = req.body || {};
      const user = await authService.changePassword(req.user.id, current_password, new_password);
      res.json({ ok: true, user });
    } catch (error) {
      sendError(res, error, 'Failed to change password');
    }
  });

  router.post('/forgot-password', async (req, res) => {
    try {
      const result = await authService.requestPasswordReset(req.body?.email);
      res.json(result);
    } catch (error) {
      sendError(res, error, 'If that email exists, a reset link has been sent');
    }
  });

  router.get('/reset-password', (req, res) => {
    const token = req.query.token;

    if (!token) {
      res.status(400).send(htmlPage('Reset password', '<p class="error">Missing reset token.</p>'));
      return;
    }

    res.send(htmlPage(
      'Reset password',
      `<form method="POST" action="/auth/reset-password">
        <input type="hidden" name="token" value="${escapeHtml(token)}" />
        <label>New password<input type="password" name="new_password" minlength="10" required /></label>
        <button type="submit">Update password</button>
      </form>`,
    ));
  });

  router.post('/reset-password', express.urlencoded({ extended: false }), async (req, res) => {
    const token = req.body?.token || req.query?.token;
    const newPassword = req.body?.new_password;

    if (!token || !newPassword) {
      if (req.accepts('html')) {
        res.status(400).send(htmlPage('Reset failed', '<p class="error">Token and new password are required.</p>'));
        return;
      }

      res.status(400).json({ error: 'Token and new_password are required' });
      return;
    }

    try {
      await authService.resetPassword(token, newPassword);

      if (req.accepts('html')) {
        res.send(htmlPage('Password updated', '<p class="success">Your password has been updated. Sign in from the Recall extension.</p>'));
        return;
      }

      res.json({ ok: true, message: 'Password updated' });
    } catch (error) {
      if (req.accepts('html')) {
        res.status(error.status || 400).send(htmlPage('Reset failed', '<p class="error">Invalid token or password. Use at least 10 characters with a letter and a number.</p>'));
        return;
      }

      sendError(res, error, 'Failed to reset password');
    }
  });

  router.post('/change-email', async (req, res) => {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const { new_email, current_password } = req.body || {};
      const result = await authService.requestEmailChange(req.user.id, new_email, current_password);
      res.json(result);
    } catch (error) {
      sendError(res, error, 'Failed to change email');
    }
  });

  router.get('/confirm-email-change', async (req, res) => {
    const token = req.query.token;

    if (!token) {
      res.status(400).send(htmlPage('Confirmation failed', '<p class="error">Missing confirmation token.</p>'));
      return;
    }

    try {
      const user = await authService.confirmEmailChange(token);
      res.send(htmlPage(
        'Email updated',
        `<p class="success">Your email is now <strong>${escapeHtml(user.email)}</strong>. Sign in again in the Recall extension if needed.</p>`,
      ));
    } catch (error) {
      res.status(error.status || 400).send(htmlPage('Confirmation failed', '<p class="error">Invalid or expired confirmation token.</p>'));
    }
  });

  router.post('/confirm-email-change', async (req, res) => {
    try {
      const user = await authService.confirmEmailChange(req.body?.token);
      res.json({ ok: true, user });
    } catch (error) {
      sendError(res, error, 'Invalid or expired confirmation token');
    }
  });

  return router;
}

module.exports = {
  createAuthRouter,
};
