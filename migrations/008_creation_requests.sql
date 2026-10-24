CREATE TABLE creation_requests (request_id TEXT PRIMARY KEY, scope TEXT NOT NULL, payload_hash TEXT NOT NULL, result BLOB NOT NULL);
