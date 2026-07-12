-- Deep startup research: funding evidence + YC/status/revenue fields

ALTER TABLE research_companies
  ADD COLUMN IF NOT EXISTS yc_status TEXT,
  ADD COLUMN IF NOT EXISTS revenue_notes TEXT,
  ADD COLUMN IF NOT EXISTS funding_summary TEXT;

ALTER TABLE research_company_analysis
  ADD COLUMN IF NOT EXISTS revenue_notes TEXT,
  ADD COLUMN IF NOT EXISTS funding_notes TEXT;

CREATE TABLE IF NOT EXISTS research_company_funding (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES research_companies(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_name       TEXT,
  amount           TEXT,
  currency         TEXT,
  announced_date   TEXT,
  investors        TEXT,
  valuation        TEXT,
  source_url       TEXT,
  source_title     TEXT,
  evidence_quote   TEXT,
  confidence       INTEGER,
  notes            TEXT,
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_funding_company
  ON research_company_funding(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_funding_user
  ON research_company_funding(user_id, created_at DESC);

ALTER TABLE research_company_funding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS research_funding_isolation ON research_company_funding;
CREATE POLICY research_funding_isolation ON research_company_funding
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
