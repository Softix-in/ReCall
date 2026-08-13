-- Document crawl jobs for bulk Firecrawl ingestion

CREATE TABLE IF NOT EXISTS doc_crawl_jobs (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seed_url        TEXT NOT NULL,
  path_filter     TEXT,
  max_pages       INTEGER NOT NULL DEFAULT 25,
  status          TEXT NOT NULL DEFAULT 'queued',
  pages_found     INTEGER NOT NULL DEFAULT 0,
  pages_saved     INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  created_at      BIGINT NOT NULL,
  completed_at    BIGINT
);

CREATE INDEX IF NOT EXISTS idx_doc_crawl_jobs_user_created
  ON doc_crawl_jobs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_doc_crawl_jobs_user_status
  ON doc_crawl_jobs(user_id, status);
