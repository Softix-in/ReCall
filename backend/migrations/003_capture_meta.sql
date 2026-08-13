-- Extension metadata and pipeline error tracking

ALTER TABLE items ADD COLUMN capture_meta TEXT;
ALTER TABLE items ADD COLUMN error_message TEXT;
