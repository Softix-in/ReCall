-- Recall PostgreSQL schema (Phase 1 + 2 foundation)

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  oauth_provider TEXT,
  oauth_id      TEXT,
  created_at    BIGINT NOT NULL,
  last_login_at BIGINT
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device     TEXT,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS items (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  title           TEXT,
  summary         TEXT,
  content         TEXT,
  source_type     TEXT NOT NULL,
  save_mode       TEXT NOT NULL,
  note            TEXT,
  tags            TEXT,
  domain          TEXT,
  thumbnail       TEXT,
  transcript      TEXT,
  thumbnail_url   TEXT,
  transcript_url  TEXT,
  processing      TEXT NOT NULL DEFAULT 'queued',
  created_at      BIGINT NOT NULL,
  processed_at    BIGINT,
  capture_meta    JSONB,
  error_message   TEXT,
  embedding       vector(384),
  fts_vector      tsvector GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(note, '') || ' ' ||
      coalesce(content, '')
    )
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_items_user_created ON items(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_user_source ON items(user_id, source_type);
CREATE INDEX IF NOT EXISTS idx_items_user_processing ON items(user_id, processing);
CREATE INDEX IF NOT EXISTS idx_items_fts ON items USING GIN(fts_vector);
CREATE INDEX IF NOT EXISTS idx_items_embedding ON items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  whisper_model           TEXT NOT NULL DEFAULT 'small',
  default_save_mode       TEXT NOT NULL DEFAULT 'auto_scrape',
  max_transcript_length   INTEGER NOT NULL DEFAULT 100000,
  backup_dir              TEXT,
  backup_enabled          BOOLEAN NOT NULL DEFAULT true,
  backup_retention_days   INTEGER NOT NULL DEFAULT 7,
  updated_at              BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profile (
  id                        UUID PRIMARY KEY,
  user_id                   UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name              TEXT,
  headline                  TEXT,
  github_url                TEXT,
  linkedin_url              TEXT,
  twitter_url               TEXT,
  website_url               TEXT,
  bio_short                 TEXT,
  skills                    JSONB NOT NULL DEFAULT '[]'::jsonb,
  fireworks_api_key_enc     TEXT,
  ai_quality_model          TEXT DEFAULT 'accounts/fireworks/models/deepseek-v3p1',
  ai_chat_model             TEXT DEFAULT 'accounts/fireworks/models/kimi-k2-instruct-0905',
  ai_reasoning_model        TEXT DEFAULT 'accounts/fireworks/models/glm-5p2',
  ai_deep_analysis_enabled  BOOLEAN NOT NULL DEFAULT false,
  created_at                BIGINT NOT NULL,
  updated_at                BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  tagline         TEXT,
  description     TEXT,
  tech_stack      JSONB NOT NULL DEFAULT '[]'::jsonb,
  impact_bullets  JSONB NOT NULL DEFAULT '[]'::jsonb,
  github_url      TEXT,
  live_url        TEXT,
  start_date      TEXT,
  end_date        TEXT,
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  embedding       vector(384),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_user_sort ON projects(user_id, sort_order ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_projects_embedding ON projects USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS jd_analyses (
  id                      UUID PRIMARY KEY,
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jd_text                 TEXT NOT NULL,
  jd_hash                 TEXT NOT NULL,
  extracted_keywords      JSONB,
  required_skills         JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_skills        JSONB NOT NULL DEFAULT '[]'::jsonb,
  seniority_level         TEXT,
  company_name            TEXT,
  role_title              TEXT,
  project_scores          JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggested_project_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  tailored_bullets        JSONB NOT NULL DEFAULT '{}'::jsonb,
  reasoning_trace         TEXT,
  created_at              BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jd_analyses_user_hash ON jd_analyses(user_id, jd_hash);
CREATE INDEX IF NOT EXISTS idx_jd_analyses_user_created ON jd_analyses(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS resume_template (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL DEFAULT 1,
  is_master       BOOLEAN NOT NULL DEFAULT false,
  label           TEXT,
  experience      JSONB NOT NULL DEFAULT '[]'::jsonb,
  education       JSONB NOT NULL DEFAULT '[]'::jsonb,
  certifications  JSONB NOT NULL DEFAULT '[]'::jsonb,
  jd_analysis_id  UUID REFERENCES jd_analyses(id) ON DELETE SET NULL,
  created_at      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resume_user_master ON resume_template(user_id, is_master, created_at DESC);
