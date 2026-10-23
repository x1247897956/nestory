CREATE TABLE projects (
 id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(trim(title))>0), description TEXT NOT NULL DEFAULT '', archived_at INTEGER,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1, UNIQUE(id)
);
CREATE TABLE tasks (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), parent_id TEXT,
 title TEXT NOT NULL CHECK(length(trim(title))>0), body TEXT NOT NULL DEFAULT '',
 stage TEXT NOT NULL DEFAULT 'todo' CHECK(stage IN ('todo','in_plan','in_process','done','cancelled')),
 priority TEXT NOT NULL DEFAULT 'none' CHECK(priority IN ('none','low','medium','high')),
 due_date TEXT, position INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 deleted_at INTEGER, delete_batch_id TEXT, UNIQUE(project_id,id),
 FOREIGN KEY(project_id,parent_id) REFERENCES tasks(project_id,id)
);
CREATE INDEX tasks_project_parent_position ON tasks(project_id,parent_id,position);
CREATE INDEX tasks_due_stage ON tasks(deleted_at,due_date,stage);
