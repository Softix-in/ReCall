const config = require('../config');
const { verifyAccessToken } = require('../utils/jwt');
const usersDb = require('../db/users');

const PUBLIC_PATHS = new Set([
  '/health',
  '/auth/register',
  '/auth/login',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/verify-email',
  '/auth/reset-password',
  '/auth/confirm-email-change',
]);

function extractBearerToken(req) {
  const auth = req.headers.authorization;

  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  return null;
}

function extractApiKey(req) {
  const headerKey = req.headers['x-recall-api-key'];

  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }

  return extractBearerToken(req);
}

async function resolveLegacyUser() {
  return usersDb.getOrCreateBootstrapUser(config.BOOTSTRAP_USER_EMAIL);
}

function createAuthMiddleware() {
  return async function authMiddleware(req, res, next) {
    if (PUBLIC_PATHS.has(req.path)) {
      next();
      return;
    }

    const bearer = extractBearerToken(req);

    if (bearer && config.JWT_PUBLIC_KEY) {
      try {
        const user = verifyAccessToken(bearer);
        req.user = user;
        next();
        return;
      } catch (error) {
        if (!config.AUTH_LEGACY_API_KEY || !config.API_KEY) {
          res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired access token' });
          return;
        }
      }
    }

    if (config.AUTH_LEGACY_API_KEY && config.API_KEY) {
      const provided = extractApiKey(req);

      if (provided && provided === config.API_KEY) {
        try {
          const bootstrapUser = await resolveLegacyUser();
          req.user = { id: bootstrapUser.id, email: bootstrapUser.email };
          req.legacyAuth = true;
          next();
          return;
        } catch (error) {
          res.status(500).json({ error: 'Failed to resolve legacy auth user' });
          return;
        }
      }
    }

    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid authentication. Use Authorization: Bearer <access_token>.',
    });
  };
}

module.exports = {
  createAuthMiddleware,
  extractBearerToken,
  extractApiKey,
};
