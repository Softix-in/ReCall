UPDATE research_jobs
SET
  status = 'failed',
  error_message = 'Stopped: OOM crash loop on bogus founder download URL',
  completed_at = (EXTRACT(EPOCH FROM now()) * 1000)::bigint,
  progress = COALESCE(progress, '{}'::jsonb) || '{"step":"stopped"}'::jsonb
WHERE status IN ('running', 'queued');

UPDATE research_companies
SET
  status = 'needs_review',
  updated_at = (EXTRACT(EPOCH FROM now()) * 1000)::bigint
WHERE status = 'processing';

-- Remove clearly bogus founder rows from the stuck company
DELETE FROM research_founder_sources
WHERE founder_id IN (
  SELECT f.id
  FROM research_founders f
  WHERE f.full_name ILIKE '%download%'
     OR f.full_name ILIKE '%[detected]%'
     OR COALESCE(f.github_url, '') ~* '\.(exe|dmg|msi|zip|pkg)(\?|$)'
);

DELETE FROM research_company_founders
WHERE founder_id IN (
  SELECT f.id
  FROM research_founders f
  WHERE f.full_name ILIKE '%download%'
     OR f.full_name ILIKE '%[detected]%'
     OR COALESCE(f.github_url, '') ~* '\.(exe|dmg|msi|zip|pkg)(\?|$)'
);

DELETE FROM research_founders
WHERE full_name ILIKE '%download%'
   OR full_name ILIKE '%[detected]%'
   OR COALESCE(github_url, '') ~* '\.(exe|dmg|msi|zip|pkg)(\?|$)';

SELECT id, status, error_message FROM research_jobs ORDER BY created_at DESC LIMIT 5;
SELECT name, status FROM research_companies;
SELECT full_name, github_url FROM research_founders;
