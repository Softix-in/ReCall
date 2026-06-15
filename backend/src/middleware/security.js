const config = require('../config');

function parseCorsOrigins(value) {
  if (!value || value === '*') {
    return '*';
  }

  return value.split(',').map((origin) => origin.trim()).filter(Boolean);
}

function corsMiddleware(req, res, next) {
  const allowed = parseCorsOrigins(config.CORS_ORIGIN);
  const requestOrigin = req.headers.origin;

  if (allowed === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (requestOrigin && allowed.includes(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Recall-Api-Key');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}

function extractApiKey(req) {
  const headerKey = req.headers['x-recall-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }

  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim();
  }

  return null;
}

function authMiddleware(req, res, next) {
  if (!config.API_KEY) {
    next();
    return;
  }

  if (req.path === '/health') {
    next();
    return;
  }

  const provided = extractApiKey(req);

  if (provided && provided === config.API_KEY) {
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized — invalid or missing API key' });
}

module.exports = {
  corsMiddleware,
  authMiddleware,
};
