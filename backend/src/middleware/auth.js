const config = require('../config');

const PUBLIC_PATHS = new Set(['/health']);

function extractApiKey(req) {
  const headerKey = req.headers['x-recall-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }

  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  return null;
}

function createAuthMiddleware() {
  return function auth(req, res, next) {
    if (!config.API_KEY) {
      next();
      return;
    }

    if (PUBLIC_PATHS.has(req.path)) {
      next();
      return;
    }

    const provided = extractApiKey(req);

    if (provided && provided === config.API_KEY) {
      next();
      return;
    }

    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid API key. Send Authorization: Bearer <key> or X-Recall-API-Key.',
    });
  };
}

module.exports = {
  createAuthMiddleware,
};
