-- Email verification, password reset, and email change tokens

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified_at BIGINT,
  ADD COLUMN IF NOT EXISTS pending_email TEXT;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  type       TEXT NOT NULL CHECK (type IN ('email_verify', 'password_reset', 'email_change')),
  payload    JSONB,
  expires_at BIGINT NOT NULL,
  used_at    BIGINT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, type);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);

-- Existing users (bootstrap, migrated accounts) are treated as verified
UPDATE users SET email_verified = true, email_verified_at = created_at
WHERE email_verified = false
  AND (email LIKE '%@recall.local' OR password_hash IS NOT NULL);
