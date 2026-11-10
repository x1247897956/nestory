-- A derived, rebuildable search index. Never an editable document representation.
CREATE TABLE search_documents (
 id INTEGER PRIMARY KEY,
 object_type TEXT NOT NULL CHECK(object_type IN ('projects','tasks','pages','events')),
 object_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 UNIQUE(object_type, object_id)
);
CREATE VIRTUAL TABLE search_fts USING fts5(title,body,content='search_documents',content_rowid='id',tokenize='trigram',detail='none');
CREATE TRIGGER search_documents_ai AFTER INSERT ON search_documents BEGIN
 INSERT INTO search_fts(rowid,title,body) VALUES(new.id,new.title,new.body);
END;
CREATE TRIGGER search_documents_ad AFTER DELETE ON search_documents BEGIN
 INSERT INTO search_fts(search_fts,rowid,title,body) VALUES('delete',old.id,old.title,old.body);
END;
CREATE TRIGGER search_documents_au AFTER UPDATE ON search_documents BEGIN
 INSERT INTO search_fts(search_fts,rowid,title,body) VALUES('delete',old.id,old.title,old.body);
 INSERT INTO search_fts(rowid,title,body) VALUES(new.id,new.title,new.body);
END;

CREATE TRIGGER search_projects_ai AFTER INSERT ON projects BEGIN
 INSERT INTO search_documents(object_type,object_id,project_id,title,body) SELECT 'projects',new.id,new.id,new.title,new.description WHERE new.deleted_at IS NULL ON CONFLICT(object_type,object_id) DO UPDATE SET project_id=excluded.project_id,title=excluded.title,body=excluded.body;
END;
CREATE TRIGGER search_projects_au AFTER UPDATE OF title,description,deleted_at ON projects
 WHEN new.title IS NOT old.title OR new.description IS NOT old.description OR new.deleted_at IS NOT old.deleted_at BEGIN
 DELETE FROM search_documents WHERE object_type='projects' AND object_id=old.id AND new.deleted_at IS NOT NULL;
 INSERT INTO search_documents(object_type,object_id,project_id,title,body) SELECT 'projects',new.id,new.id,new.title,new.description WHERE new.deleted_at IS NULL ON CONFLICT(object_type,object_id) DO UPDATE SET project_id=excluded.project_id,title=excluded.title,body=excluded.body;
END;
CREATE TRIGGER search_projects_ad AFTER DELETE ON projects BEGIN
 DELETE FROM search_documents WHERE object_type='projects' AND object_id=old.id;
END;
INSERT INTO search_documents(object_type,object_id,project_id,title,body) SELECT 'projects',o.id,o.id,o.title,o.description FROM projects o WHERE o.deleted_at IS NULL;

CREATE TRIGGER search_tasks_ai AFTER INSERT ON tasks BEGIN
 INSERT INTO search_documents(object_type,object_id,project_id,title,body) SELECT 'tasks',new.id,new.project_id,new.title,(SELECT coalesce(group_concat(j.value,char(10)),'') FROM json_tree(new.body_document) j WHERE j.key IN ('text','name') AND j.type='text') WHERE new.deleted_at IS NULL ON CONFLICT(object_type,object_id) DO UPDATE SET project_id=excluded.project_id,title=excluded.title,body=excluded.body;
END;
CREATE TRIGGER search_tasks_au AFTER UPDATE OF title,body_document,deleted_at ON tasks
 WHEN new.title IS NOT old.title OR new.body_document IS NOT old.body_document OR new.deleted_at IS NOT old.deleted_at BEGIN
 DELETE FROM search_documents WHERE object_type='tasks' AND object_id=old.id AND new.deleted_at IS NOT NULL;
 INSERT INTO search_documents(object_type,object_id,project_id,title,body) SELECT 'tasks',new.id,new.project_id,new.title,(SELECT coalesce(group_concat(j.value,char(10)),'') FROM json_tree(new.body_document) j WHERE j.key IN ('text','name') AND j.type='text') WHERE new.deleted_at IS NULL ON CONFLICT(object_type,object_id) DO UPDATE SET project_id=excluded.project_id,title=excluded.title,body=excluded.body;
END;
CREATE TRIGGER search_tasks_ad AFTER DELETE ON tasks BEGIN
 DELETE FROM search_documents WHERE object_type='tasks' AND object_id=old.id;
END;
INSERT INTO search_documents(object_type,object_id,project_id,title,body) SELECT 'tasks',o.id,o.project_id,o.title,(SELECT coalesce(group_concat(j.value,char(10)),'') FROM json_tree(o.body_document) j WHERE j.key IN ('text','name') AND j.type='text') FROM tasks o WHERE o.deleted_at IS NULL;

CREATE TRIGGER search_pages_ai AFTER INSERT ON pages BEGIN
 INSERT INTO search_documents(object_type,object_id,project_id,title,body) SELECT 'pages',new.id,new.project_id,new.title,(SELECT coalesce(group_concat(j.value,char(10)),'') FROM json_tree(new.body_document) j WHERE j.key IN ('text','name') AND j.type='text') WHERE new.deleted_at IS NULL ON CONFLICT(object_type,object_id) DO UPDATE SET project_id=excluded.project_id,title=excluded.title,body=excluded.body;
END;
CREATE TRIGGER search_pages_au AFTER UPDATE OF title,body_document,deleted_at ON pages
 WHEN new.title IS NOT old.title OR new.body_document IS NOT old.body_document OR new.deleted_at IS NOT old.deleted_at BEGIN
 DELETE FROM search_documents WHERE object_type='pages' AND object_id=old.id AND new.deleted_at IS NOT NULL;
 INSERT INTO search_documents(object_type,object_id,project_id,title,body) SELECT 'pages',new.id,new.project_id,new.title,(SELECT coalesce(group_concat(j.value,char(10)),'') FROM json_tree(new.body_document) j WHERE j.key IN ('text','name') AND j.type='text') WHERE new.deleted_at IS NULL ON CONFLICT(object_type,object_id) DO UPDATE SET project_id=excluded.project_id,title=excluded.title,body=excluded.body;
END;
CREATE TRIGGER search_pages_ad AFTER DELETE ON pages BEGIN
 DELETE FROM search_documents WHERE object_type='pages' AND object_id=old.id;
END;
INSERT INTO search_documents(object_type,object_id,project_id,title,body) SELECT 'pages',o.id,o.project_id,o.title,(SELECT coalesce(group_concat(j.value,char(10)),'') FROM json_tree(o.body_document) j WHERE j.key IN ('text','name') AND j.type='text') FROM pages o WHERE o.deleted_at IS NULL;

CREATE TRIGGER search_events_ai AFTER INSERT ON events BEGIN
 INSERT INTO search_documents(object_type,object_id,project_id,title,body) SELECT 'events',new.id,new.project_id,new.title,(SELECT coalesce(group_concat(j.value,char(10)),'') FROM json_tree(new.body_document) j WHERE j.key IN ('text','name') AND j.type='text') WHERE new.deleted_at IS NULL ON CONFLICT(object_type,object_id) DO UPDATE SET project_id=excluded.project_id,title=excluded.title,body=excluded.body;
END;
CREATE TRIGGER search_events_au AFTER UPDATE OF title,body_document,deleted_at ON events
 WHEN new.title IS NOT old.title OR new.body_document IS NOT old.body_document OR new.deleted_at IS NOT old.deleted_at BEGIN
 DELETE FROM search_documents WHERE object_type='events' AND object_id=old.id AND new.deleted_at IS NOT NULL;
 INSERT INTO search_documents(object_type,object_id,project_id,title,body) SELECT 'events',new.id,new.project_id,new.title,(SELECT coalesce(group_concat(j.value,char(10)),'') FROM json_tree(new.body_document) j WHERE j.key IN ('text','name') AND j.type='text') WHERE new.deleted_at IS NULL ON CONFLICT(object_type,object_id) DO UPDATE SET project_id=excluded.project_id,title=excluded.title,body=excluded.body;
END;
CREATE TRIGGER search_events_ad AFTER DELETE ON events BEGIN
 DELETE FROM search_documents WHERE object_type='events' AND object_id=old.id;
END;
INSERT INTO search_documents(object_type,object_id,project_id,title,body) SELECT 'events',o.id,o.project_id,o.title,(SELECT coalesce(group_concat(j.value,char(10)),'') FROM json_tree(o.body_document) j WHERE j.key IN ('text','name') AND j.type='text') FROM events o WHERE o.deleted_at IS NULL;
