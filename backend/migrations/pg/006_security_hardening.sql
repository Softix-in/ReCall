-- Refresh-token family for reuse detection
ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS family_id UUID;

UPDATE refresh_tokens
SET family_id = gen_random_uuid()
WHERE family_id IS NULL;

ALTER TABLE refresh_tokens
  ALTER COLUMN family_id SET DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family
  ON refresh_tokens(family_id);

-- Auth lookup is by token hash, not user_id. Keep RLS off this table.
ALTER TABLE refresh_tokens DISABLE ROW LEVEL SECURITY;

-- Force RLS so a non-superuser API role cannot skip policies.
ALTER TABLE items FORCE ROW LEVEL SECURITY;
ALTER TABLE user_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE user_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
ALTER TABLE jd_analyses FORCE ROW LEVEL SECURITY;
ALTER TABLE resume_template FORCE ROW LEVEL SECURITY;

ALTER TABLE research_companies FORCE ROW LEVEL SECURITY;
ALTER TABLE research_company_analysis FORCE ROW LEVEL SECURITY;
ALTER TABLE research_founders FORCE ROW LEVEL SECURITY;
ALTER TABLE research_company_founders FORCE ROW LEVEL SECURITY;
ALTER TABLE research_founder_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE research_startup_news FORCE ROW LEVEL SECURITY;
ALTER TABLE research_company_pages FORCE ROW LEVEL SECURITY;
ALTER TABLE research_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE research_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE research_company_funding FORCE ROW LEVEL SECURITY;

ALTER TABLE doc_crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_crawl_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_crawl_jobs_isolation ON doc_crawl_jobs;
CREATE POLICY doc_crawl_jobs_isolation ON doc_crawl_jobs
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
