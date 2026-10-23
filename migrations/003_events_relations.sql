CREATE TABLE events (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),title TEXT NOT NULL CHECK(length(trim(title))>0),body TEXT NOT NULL DEFAULT '',start_at INTEGER NOT NULL,end_at INTEGER NOT NULL CHECK(end_at>start_at),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1,deleted_at INTEGER,delete_batch_id TEXT,UNIQUE(project_id,id)
);
CREATE INDEX events_project_interval ON events(project_id,start_at,end_at);
CREATE TABLE task_pages(project_id TEXT NOT NULL,task_id TEXT NOT NULL,page_id TEXT NOT NULL,PRIMARY KEY(task_id,page_id),FOREIGN KEY(project_id,task_id) REFERENCES tasks(project_id,id),FOREIGN KEY(project_id,page_id) REFERENCES pages(project_id,id));
CREATE INDEX task_pages_reverse ON task_pages(page_id,task_id);
CREATE TABLE task_events(project_id TEXT NOT NULL,task_id TEXT NOT NULL,event_id TEXT NOT NULL,PRIMARY KEY(task_id,event_id),FOREIGN KEY(project_id,task_id) REFERENCES tasks(project_id,id),FOREIGN KEY(project_id,event_id) REFERENCES events(project_id,id));
CREATE INDEX task_events_reverse ON task_events(event_id,task_id);
CREATE TABLE page_events(project_id TEXT NOT NULL,page_id TEXT NOT NULL,event_id TEXT NOT NULL,PRIMARY KEY(page_id,event_id),FOREIGN KEY(project_id,page_id) REFERENCES pages(project_id,id),FOREIGN KEY(project_id,event_id) REFERENCES events(project_id,id));
CREATE INDEX page_events_reverse ON page_events(event_id,page_id);
