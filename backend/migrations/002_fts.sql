-- Full-text search index (used in Step 18)

CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
  title,
  summary,
  content,
  note,
  content='items',
  content_rowid='rowid'
);

-- Keep FTS in sync when items change

CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts(rowid, title, summary, content, note)
  VALUES (new.rowid, new.title, new.summary, new.content, new.note);
END;

CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, title, summary, content, note)
  VALUES ('delete', old.rowid, old.title, old.summary, old.content, old.note);
END;

CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, title, summary, content, note)
  VALUES ('delete', old.rowid, old.title, old.summary, old.content, old.note);
  INSERT INTO items_fts(rowid, title, summary, content, note)
  VALUES (new.rowid, new.title, new.summary, new.content, new.note);
END;
