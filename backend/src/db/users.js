const bcrypt = require('bcrypt');
const { query, withUserContext } = require('./pg-pool');
const {
  generateRefreshToken,
  hashRefreshToken,
  getRefreshTokenExpiry,
} = require('../utils/jwt');

const BCRYPT_ROUNDS = 12;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    email_verified: Boolean(row.email_verified),
    pending_email: row.pending_email || null,
    created_at: Number(row.created_at),
    last_login_at: row.last_login_at ? Number(row.last_login_at) : null,
  };
}

async function findUserByEmail(email) {
  const result = await query(
    'SELECT * FROM users WHERE email = $1',
    [normalizeEmail(email)],
  );

  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function createUser({ email, passwordHash, oauthProvider = null, oauthId = null }) {
  const now = Date.now();
  const result = await query(
    `INSERT INTO users (email, password_hash, oauth_provider, oauth_id, created_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [normalizeEmail(email), passwordHash, oauthProvider, oauthId, now],
  );

  return result.rows[0];
}

async function updateLastLogin(userId) {
  await query('UPDATE users SET last_login_at = $1 WHERE id = $2', [Date.now(), userId]);
}

async function storeRefreshToken(userId, refreshToken, device = 'api') {
  const tokenHash = hashRefreshToken(refreshToken);
  const now = Date.now();

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device, created_at, expires_at, revoked)
     VALUES ($1, $2, $3, $4, $5, false)`,
    [userId, tokenHash, device, now, getRefreshTokenExpiry()],
  );
}

async function findRefreshToken(refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken);
  const result = await query(
    `SELECT rt.*, u.email
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1
       AND rt.revoked = false
       AND rt.expires_at > $2`,
    [tokenHash, Date.now()],
  );

  return result.rows[0] || null;
}

async function revokeRefreshToken(refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken);
  await query('UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1', [tokenHash]);
}

async function rotateRefreshToken(oldToken, device = 'api') {
  const existing = await findRefreshToken(oldToken);

  if (!existing) {
    const error = new Error('Invalid or expired refresh token');
    error.status = 401;
    throw error;
  }

  await revokeRefreshToken(oldToken);

  const newToken = generateRefreshToken();
  await storeRefreshToken(existing.user_id, newToken, device);

  return {
    userId: existing.user_id,
    email: existing.email,
    refreshToken: newToken,
  };
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function updatePassword(userId, password) {
  if (!validatePassword(password)) {
    const error = new Error('Password must be at least 8 characters');
    error.status = 400;
    throw error;
  }

  const passwordHash = await hashPassword(password);
  const result = await query(
    'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING *',
    [passwordHash, userId],
  );

  if (!result.rows[0]) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  return result.rows[0];
}

async function verifyPassword(password, passwordHash) {
  if (!passwordHash) {
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}

async function markEmailVerified(userId) {
  const now = Date.now();
  const result = await query(
    `UPDATE users
     SET email_verified = true, email_verified_at = $1, pending_email = NULL
     WHERE id = $2
     RETURNING *`,
    [now, userId],
  );

  return result.rows[0] || null;
}

async function setPendingEmail(userId, pendingEmail) {
  const result = await query(
    'UPDATE users SET pending_email = $1 WHERE id = $2 RETURNING *',
    [normalizeEmail(pendingEmail), userId],
  );

  return result.rows[0] || null;
}

async function confirmEmailChange(userId, newEmail) {
  const normalized = normalizeEmail(newEmail);
  const existing = await findUserByEmail(normalized);

  if (existing && existing.id !== userId) {
    const error = new Error('Email already in use');
    error.status = 409;
    throw error;
  }

  const now = Date.now();
  const result = await query(
    `UPDATE users
     SET email = $1, pending_email = NULL, email_verified = true, email_verified_at = $2
     WHERE id = $3
     RETURNING *`,
    [normalized, now, userId],
  );

  return result.rows[0] || null;
}

async function getOrCreateBootstrapUser(email) {
  const normalized = normalizeEmail(email);
  const existing = await findUserByEmail(normalized);

  if (existing) {
    if (!existing.email_verified) {
      await markEmailVerified(existing.id);
      return findUserById(existing.id);
    }

    return existing;
  }

  const user = await createUser({
    email: normalized,
    passwordHash: null,
  });

  await markEmailVerified(user.id);
  return findUserById(user.id);
}

module.exports = {
  normalizeEmail,
  validateEmail,
  validatePassword,
  publicUser,
  findUserByEmail,
  findUserById,
  createUser,
  updateLastLogin,
  storeRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  hashPassword,
  verifyPassword,
  updatePassword,
  markEmailVerified,
  setPendingEmail,
  confirmEmailChange,
  getOrCreateBootstrapUser,
};
