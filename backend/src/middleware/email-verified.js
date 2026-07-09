const usersDb = require('../db/users');

const PUBLIC_OR_AUTH_ONLY = new Set([
  '/health',
  '/auth/register',
  '/auth/login',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/verify-email',
  '/auth/reset-password',
  '/auth/confirm-email-change',
]);

const ALLOWED_UNVERIFIED = new Set([
  '/auth/me',
  '/auth/logout',
  '/auth/resend-verification',
]);

function createEmailVerifiedMiddleware() {
  return async function emailVerifiedMiddleware(req, res, next) {
    if (PUBLIC_OR_AUTH_ONLY.has(req.path) || ALLOWED_UNVERIFIED.has(req.path)) {
      next();
      return;
    }

    if (!req.user?.id) {
      next();
      return;
    }

    try {
      const user = await usersDb.findUserById(req.user.id);

      if (!user || user.email_verified) {
        next();
        return;
      }

      res.status(403).json({
        error: 'email_not_verified',
        message: 'Verify your email to use Recall. Check your inbox or resend from Settings.',
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to check email verification status' });
    }
  };
}

module.exports = {
  createEmailVerifiedMiddleware,
};
