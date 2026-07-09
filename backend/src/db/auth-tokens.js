const crypto = require('crypto');
const { query } = require('./pg-pool');

const TOKEN_TTL_MS = {
  email_verify: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
  email_change: 24 * 60 * 60 * 1000,
};

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function createToken(userId, type, payload = null) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const now = Date.now();
  const ttl = TOKEN_TTL_MS[type] || TOKEN_TTL_MS.email_verify;

  await query(
    `INSERT INTO auth_tokens (user_id, token_hash, type, payload, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, tokenHash, type, payload ? JSON.stringify(payload) : null, now + ttl, now],
  );

  return token;
}

async function consumeToken(token, expectedType) {
  const tokenHash = hashToken(token);
  const result = await query(
    `SELECT * FROM auth_tokens
     WHERE token_hash = $1 AND type = $2 AND used_at IS NULL AND expires_at > $3`,
    [tokenHash, expectedType, Date.now()],
  );

  const row = result.rows[0];

  if (!row) {
    const error = new Error('Invalid or expired token');
    error.status = 400;
    throw error;
  }

  await query('UPDATE auth_tokens SET used_at = $1 WHERE id = $2', [Date.now(), row.id]);

  return {
    ...row,
    payload: row.payload ? (typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload) : null,
  };
}

async function revokeTokensForUser(userId, type) {
  await query(
    'UPDATE auth_tokens SET used_at = $1 WHERE user_id = $2 AND type = $3 AND used_at IS NULL',
    [Date.now(), userId, type],
  );
}

module.exports = {
  createToken,
  consumeToken,
  revokeTokensForUser,
  TOKEN_TTL_MS,
};
