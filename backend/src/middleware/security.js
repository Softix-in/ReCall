const config = require('../config');
const { createAuthMiddleware } = require('./auth');

function parseCorsOrigins(value) {
  if (!value || value === 'extension') {
    return 'extension';
  }

  if (value === '*') {
    return '*';
  }

  return value.split(',').map((origin) => origin.trim()).filter(Boolean);
}

function isLocalhostOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:'
      && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
  } catch {
    return false;
  }
}

function resolveAllowOrigin(allowed, requestOrigin) {
  if (allowed === '*') {
    return '*';
  }

  if (!requestOrigin) {
    return null;
  }

  if (allowed === 'extension') {
    if (requestOrigin.startsWith('chrome-extension://')) {
      return requestOrigin;
    }
    if (isLocalhostOrigin(requestOrigin)) {
      return requestOrigin;
    }
    return null;
  }

  if (Array.isArray(allowed) && allowed.includes(requestOrigin)) {
    return requestOrigin;
  }

  return null;
}

function corsMiddleware(req, res, next) {
  const allowed = parseCorsOrigins(config.CORS_ORIGIN);
  const allowOrigin = resolveAllowOrigin(allowed, req.headers.origin);

  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Vary', 'Origin');
    if (allowOrigin !== '*') {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Recall-Api-Key');
  res.setHeader('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}

function securityHeaders(req, res, next) {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');

  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

const authMiddleware = createAuthMiddleware();

module.exports = {
  corsMiddleware,
  securityHeaders,
  authMiddleware,
};
