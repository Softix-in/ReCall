-- YC / startup research graph (companies, founders, news, jobs)

CREATE TABLE IF NOT EXISTS research_companies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  yc_batch            TEXT,
  yc_url              TEXT,
  website             TEXT,
  short_description   TEXT,
  industry            TEXT,
  location            TEXT,
  founded_year        INTEGER,
  team_size           TEXT,
  status              TEXT NOT NULL DEFAULT 'new'
                        CHECK (status IN (
                          'new', 'processing', 'processed', 'needs_review',
                          'shortlisted', 'rejected', 'idea_generated'
                        )),
  source_url          TEXT,
  item_id             UUID REFERENCES items(id) ON DELETE SET NULL,
  tags                JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_note           TEXT,
  raw_page_text       TEXT,
  embedding           vector(384),
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_companies_user_created
  ON research_companies(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_companies_user_status
  ON research_companies(user_id, status);
CREATE INDEX IF NOT EXISTS idx_research_companies_user_batch
  ON research_companies(user_id, yc_batch);
CREATE UNIQUE INDEX IF NOT EXISTS idx_research_companies_user_yc_url
  ON research_companies(user_id, yc_url)
  WHERE yc_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS research_company_analysis (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID NOT NULL UNIQUE REFERENCES research_companies(id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_statement       TEXT,
  target_customer         TEXT,
  current_solution        TEXT,
  why_now                 TEXT,
  market_size_notes       TEXT,
  business_model          TEXT,
  competitors             TEXT,
  moat                    TEXT,
  technical_depth         TEXT,
  ai_or_deeptech_angle    TEXT,
  go_to_market_strategy   TEXT,
  risks                   TEXT,
  insight_summary         TEXT,
  adjacent_opportunities  TEXT,
  one_line_understanding  TEXT,
  opportunity_score       INTEGER,
  personal_fit_score      INTEGER,
  market_demand_score     INTEGER,
  problem_pain_score      INTEGER,
  technical_depth_score   INTEGER,
  competition_score       INTEGER,
  buildability_score      INTEGER,
  long_term_score         INTEGER,
  created_at              BIGINT NOT NULL,
  updated_at              BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_analysis_user
  ON research_company_analysis(user_id);

CREATE TABLE IF NOT EXISTS research_founders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name             TEXT NOT NULL,
  "current_role"        TEXT,
  linkedin_url          TEXT,
  twitter_url           TEXT,
  github_url            TEXT,
  personal_website      TEXT,
  location              TEXT,
  education             TEXT,
  previous_companies    TEXT,
  previous_startups     TEXT,
  technical_background  TEXT,
  domain_expertise      TEXT,
  achievements          TEXT,
  public_bio            TEXT,
  created_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_founders_user
  ON research_founders(user_id, full_name);

CREATE TABLE IF NOT EXISTS research_company_founders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,
  founder_id   UUID NOT NULL REFERENCES research_founders(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT,
  is_current   BOOLEAN NOT NULL DEFAULT true,
  source_url   TEXT,
  created_at   BIGINT NOT NULL,
  UNIQUE (company_id, founder_id)
);

CREATE INDEX IF NOT EXISTS idx_research_company_founders_company
  ON research_company_founders(company_id);

CREATE TABLE IF NOT EXISTS research_founder_sources (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  founder_id          UUID NOT NULL REFERENCES research_founders(id) ON DELETE CASCADE,
  company_id          UUID REFERENCES research_companies(id) ON DELETE SET NULL,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type         TEXT NOT NULL,
  source_title        TEXT,
  source_url          TEXT,
  raw_text            TEXT,
  extracted_summary   TEXT,
  credibility_score   INTEGER,
  date_found          BIGINT,
  created_at          BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_founder_sources_founder
  ON research_founder_sources(founder_id);

CREATE TABLE IF NOT EXISTS research_startup_news (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  url               TEXT,
  publisher         TEXT,
  published_date    TEXT,
  news_type         TEXT,
  raw_text          TEXT,
  summary           TEXT,
  key_signal        TEXT,
  sentiment         TEXT,
  importance_score  INTEGER,
  created_at        BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_research_news_user_url
  ON research_startup_news(user_id, url)
  WHERE url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_research_news_company
  ON research_startup_news(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS research_company_pages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_type            TEXT,
  title                TEXT,
  url                  TEXT NOT NULL,
  raw_text             TEXT,
  summary              TEXT,
  extracted_features   TEXT,
  created_at           BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_research_pages_company_url
  ON research_company_pages(company_id, url);

CREATE TABLE IF NOT EXISTS research_sources (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES research_companies(id) ON DELETE CASCADE,
  founder_id          UUID REFERENCES research_founders(id) ON DELETE SET NULL,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id             UUID REFERENCES items(id) ON DELETE SET NULL,
  source_type         TEXT NOT NULL,
  title               TEXT,
  url                 TEXT,
  extracted_text      TEXT,
  credibility_score   INTEGER,
  created_at          BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_sources_company
  ON research_sources(company_id);

CREATE TABLE IF NOT EXISTS research_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_type        TEXT NOT NULL DEFAULT 'full_research',
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'needs_review')),
  progress        JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message   TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  started_at      BIGINT,
  completed_at    BIGINT,
  created_at      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_jobs_user_status
  ON research_jobs(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_jobs_company
  ON research_jobs(company_id, created_at DESC);

-- RLS
ALTER TABLE research_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_company_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_founders ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_company_founders ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_founder_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_startup_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_company_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_companies_isolation ON research_companies
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY research_analysis_isolation ON research_company_analysis
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY research_founders_isolation ON research_founders
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY research_company_founders_isolation ON research_company_founders
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY research_founder_sources_isolation ON research_founder_sources
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY research_news_isolation ON research_startup_news
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY research_pages_isolation ON research_company_pages
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY research_sources_isolation ON research_sources
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY research_jobs_isolation ON research_jobs
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
