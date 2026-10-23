CREATE TABLE pages (
 id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),parent_id TEXT,title TEXT NOT NULL CHECK(length(trim(title))>0),body TEXT NOT NULL DEFAULT '',position INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1,deleted_at INTEGER,delete_batch_id TEXT,UNIQUE(project_id,id),FOREIGN KEY(project_id,parent_id) REFERENCES pages(project_id,id)
);
CREATE INDEX pages_project_parent_position ON pages(project_id,parent_id,position);
CREATE TABLE assets(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),original_name TEXT NOT NULL,storage_key TEXT NOT NULL UNIQUE,media_type TEXT NOT NULL,size INTEGER NOT NULL,created_at INTEGER NOT NULL);
