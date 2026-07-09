const config = require('../config');
const { createAuthMiddleware } = require('./auth');

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

const authMiddleware = createAuthMiddleware();

module.exports = {
  corsMiddleware,
  authMiddleware,
};
