-- Core items table for saved web content

CREATE TABLE IF NOT EXISTS items (
  id            TEXT PRIMARY KEY,
  url           TEXT NOT NULL,
  title         TEXT,
  summary       TEXT,
  content       TEXT,
  source_type   TEXT NOT NULL,
  save_mode     TEXT NOT NULL,
  note          TEXT,
  tags          TEXT,
  domain        TEXT,
  thumbnail     TEXT,
  transcript    TEXT,
  processing    TEXT NOT NULL DEFAULT 'queued',
  created_at    INTEGER NOT NULL,
  processed_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_items_created ON items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_source ON items(source_type);
CREATE INDEX IF NOT EXISTS idx_items_domain ON items(domain);
CREATE INDEX IF NOT EXISTS idx_items_processing ON items(processing);
