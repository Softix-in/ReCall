-- Identity & Career module tables (SQLite)

CREATE TABLE IF NOT EXISTS user_profile (
  id                        TEXT PRIMARY KEY,
  display_name              TEXT,
  headline                  TEXT,
  github_url                TEXT,
  linkedin_url              TEXT,
  twitter_url               TEXT,
  website_url               TEXT,
  bio_short                 TEXT,
  skills                    TEXT,
  fireworks_api_key_enc     TEXT,
  ai_quality_model          TEXT DEFAULT 'accounts/fireworks/models/deepseek-v3p1',
  ai_chat_model             TEXT DEFAULT 'accounts/fireworks/models/kimi-k2-instruct-0905',
  ai_reasoning_model        TEXT DEFAULT 'accounts/fireworks/models/glm-5p2',
  ai_deep_analysis_enabled  INTEGER NOT NULL DEFAULT 0,
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  tagline         TEXT,
  description     TEXT,
  tech_stack      TEXT,
  impact_bullets  TEXT,
  github_url      TEXT,
  live_url        TEXT,
  start_date      TEXT,
  end_date        TEXT,
  is_featured     INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  embedding       TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_sort ON projects(sort_order ASC, created_at DESC);

CREATE TABLE IF NOT EXISTS jd_analyses (
  id                      TEXT PRIMARY KEY,
  jd_text                 TEXT NOT NULL,
  jd_hash                 TEXT NOT NULL,
  extracted_keywords      TEXT,
  required_skills         TEXT,
  preferred_skills        TEXT,
  seniority_level         TEXT,
  company_name            TEXT,
  role_title              TEXT,
  project_scores          TEXT,
  suggested_project_order TEXT,
  tailored_bullets        TEXT,
  reasoning_trace         TEXT,
  created_at              INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jd_analyses_hash ON jd_analyses(jd_hash);
CREATE INDEX IF NOT EXISTS idx_jd_analyses_created ON jd_analyses(created_at DESC);

CREATE TABLE IF NOT EXISTS resume_template (
  id              TEXT PRIMARY KEY,
  version         INTEGER NOT NULL DEFAULT 1,
  is_master       INTEGER NOT NULL DEFAULT 0,
  label           TEXT,
  experience      TEXT,
  education       TEXT,
  certifications  TEXT,
  jd_analysis_id  TEXT REFERENCES jd_analyses(id) ON DELETE SET NULL,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resume_master ON resume_template(is_master, created_at DESC);
