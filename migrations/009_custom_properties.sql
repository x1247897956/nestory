CREATE TABLE custom_property_definitions (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id),
 object_type TEXT NOT NULL CHECK(object_type IN ('tasks','pages','events')),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
 name_key TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('text','single_select','multi_select','url')),
 options TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(options) AND json_type(options)='array'),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(project_id,object_type,name_key),
 UNIQUE(id,project_id,object_type)
);
CREATE INDEX custom_definitions_scope ON custom_property_definitions(project_id,object_type,created_at,id);
CREATE TABLE custom_property_values (
 definition_id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 object_type TEXT NOT NULL CHECK(object_type IN ('tasks','pages','events')),
 object_id TEXT NOT NULL,
 task_id TEXT, page_id TEXT, event_id TEXT,
 value_json TEXT NOT NULL CHECK(json_valid(value_json)),
 version INTEGER NOT NULL CHECK(version>0), updated_at INTEGER NOT NULL,
 PRIMARY KEY(definition_id,object_id),
 FOREIGN KEY(definition_id,project_id,object_type) REFERENCES custom_property_definitions(id,project_id,object_type),
 FOREIGN KEY(project_id,task_id) REFERENCES tasks(project_id,id),
 FOREIGN KEY(project_id,page_id) REFERENCES pages(project_id,id),
 FOREIGN KEY(project_id,event_id) REFERENCES events(project_id,id),
 CHECK((object_type='tasks' AND task_id IS NOT NULL AND task_id=object_id AND page_id IS NULL AND event_id IS NULL)
 OR (object_type='pages' AND page_id IS NOT NULL AND page_id=object_id AND task_id IS NULL AND event_id IS NULL)
 OR (object_type='events' AND event_id IS NOT NULL AND event_id=object_id AND task_id IS NULL AND page_id IS NULL))
);
CREATE INDEX custom_values_object ON custom_property_values(object_type,object_id,definition_id);
