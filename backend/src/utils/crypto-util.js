const crypto = require('crypto');
const config = require('../config');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_V2 = 'recall-profile-key-v2';
const SALT_LEGACY = 'recall-profile-key-v1';
const LEGACY_FALLBACK = 'recall-local-dev-key';

function deriveKey(source, salt) {
  return crypto.scryptSync(String(source), salt, 32);
}

function getPrimaryKeySource() {
  if (config.ENCRYPTION_KEY) {
    return config.ENCRYPTION_KEY;
  }

  if (config.JWT_PRIVATE_KEY) {
    return crypto.createHash('sha256').update(config.JWT_PRIVATE_KEY).digest('hex');
  }

  if (config.API_KEY) {
    return config.API_KEY;
  }

  if (!config.DATABASE_URL) {
    return LEGACY_FALLBACK;
  }

  throw new Error('ENCRYPTION_KEY (or JWT_PRIVATE_KEY) is required to encrypt secrets');
}

function getPrimaryKey() {
  return deriveKey(getPrimaryKeySource(), SALT_V2);
}

function encrypt(plaintext) {
  if (!plaintext) {
    return null;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getPrimaryKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptWithKey(ciphertext, key) {
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = data.subarray(IV_LENGTH + 16);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

function decrypt(ciphertext) {
  if (!ciphertext) {
    return null;
  }

  const candidates = [getPrimaryKey()];

  if (config.API_KEY) {
    candidates.push(deriveKey(config.API_KEY, SALT_LEGACY));
  }

  candidates.push(deriveKey(LEGACY_FALLBACK, SALT_LEGACY));

  let lastError = null;
  for (const key of candidates) {
    try {
      return decryptWithKey(ciphertext, key);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Failed to decrypt secret');
}

module.exports = {
  encrypt,
  decrypt,
};
