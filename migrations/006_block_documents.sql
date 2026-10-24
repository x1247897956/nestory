-- Preserve existing Markdown untouched; conversion happens on the first body edit.
ALTER TABLE tasks ADD COLUMN body_document BLOB;
ALTER TABLE tasks ADD COLUMN legacy_body TEXT;
ALTER TABLE pages ADD COLUMN body_document BLOB;
ALTER TABLE pages ADD COLUMN legacy_body TEXT;
ALTER TABLE events ADD COLUMN body_document BLOB;
ALTER TABLE events ADD COLUMN legacy_body TEXT;
