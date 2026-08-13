const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');

const ACCESS_TOKEN_TTL_SEC = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getPrivateKey() {
  if (!config.JWT_PRIVATE_KEY) {
    throw new Error('JWT_PRIVATE_KEY is not configured');
  }

  return config.JWT_PRIVATE_KEY;
}

function getPublicKey() {
  if (!config.JWT_PUBLIC_KEY) {
    throw new Error('JWT_PUBLIC_KEY is not configured');
  }

  return config.JWT_PUBLIC_KEY;
}

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
    },
    getPrivateKey(),
    {
      algorithm: 'RS256',
      expiresIn: ACCESS_TOKEN_TTL_SEC,
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
    },
  );
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, getPublicKey(), {
    algorithms: ['RS256'],
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
  });

  return {
    id: payload.sub,
    email: payload.email,
  };
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function generateRefreshFamilyId() {
  return crypto.randomUUID();
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getRefreshTokenExpiry() {
  return Date.now() + REFRESH_TOKEN_TTL_MS;
}

function decodeAccessTokenUnsafe(token) {
  const decoded = jwt.decode(token);
  if (!decoded?.sub) {
    return null;
  }

  return {
    id: decoded.sub,
    email: decoded.email,
    exp: decoded.exp,
  };
}

module.exports = {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_MS,
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  generateRefreshFamilyId,
  hashRefreshToken,
  getRefreshTokenExpiry,
  decodeAccessTokenUnsafe,
};
