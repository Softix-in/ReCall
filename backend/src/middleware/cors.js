const config = require('../config');

function parseAllowedOrigins(raw) {
  if (!raw || raw.trim() === '' || raw.trim() === '*') {
    return '*';
  }

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function createCorsMiddleware() {
  const allowed = parseAllowedOrigins(config.CORS_ORIGINS);

  return function cors(req, res, next) {
    const origin = req.headers.origin;
    let allowOrigin = null;

    if (allowed === '*') {
      allowOrigin = origin || '*';
    } else if (origin && allowed.includes(origin)) {
      allowOrigin = origin;
    }

    if (allowOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowOrigin);
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Recall-API-Key');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

module.exports = {
  createCorsMiddleware,
};
