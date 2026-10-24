package app_test

import "testing"

func TestObjectPropertiesReflectTypedModels(t *testing.T) {
	h, closeDB := setup(t)
	defer closeDB()
	p := req(t, h, "POST", "/projects", object{"title": "Object project"}, 201)
	pid := p["id"].(string)
	task := req(t, h, "POST", "/projects/"+pid+"/tasks", object{"title": "Action"}, 201)
	note := req(t, h, "POST", "/projects/"+pid+"/pages", object{"title": "Note"}, 201)
	event := req(t, h, "POST", "/projects/"+pid+"/events", object{"title": "Meeting", "start_at": "2026-10-25T09:00:00+08:00", "end_at": "2026-10-25T10:00:00+08:00"}, 201)
	for _, v := range []struct {
		typ   string
		data  object
		key   string
		value any
	}{{"tasks", task, "stage", "todo"}, {"pages", note, "position", float64(0)}, {"events", event, "start_at", "2026-10-25T01:00:00Z"}} {
		schema := req(t, h, "GET", "/object-types/"+v.typ, nil, 200)
		if schema["type"] != v.typ {
			t.Fatal(schema)
		}
		got := req(t, h, "GET", "/objects/"+v.typ+"/"+v.data["id"].(string), nil, 200)
		if got["type"] != v.typ || got["project_id"] != pid || got["title"] != v.data["title"] {
			t.Fatal(got)
		}
		props := got["properties"].(map[string]any)
		if props[v.key] != v.value {
			t.Fatalf("%s: %+v", v.key, props)
		}
	}
	tid, nid := task["id"].(string), note["id"].(string)
	req(t, h, "PUT", "/relations/task-page/"+tid+"/"+nid, nil, 200)
	got := req(t, h, "GET", "/objects/tasks/"+tid, nil, 200)
	if len(got["properties"].(map[string]any)["relations"].([]any)) != 1 {
		t.Fatal(got)
	}
	req(t, h, "PATCH", "/tasks/"+tid, object{"version": task["version"], "priority": "high"}, 200)
	got = req(t, h, "GET", "/objects/tasks/"+tid, nil, 200)
	if got["properties"].(map[string]any)["priority"] != "high" {
		t.Fatal(got)
	}
	req(t, h, "PATCH", "/projects/"+pid, object{"version": p["version"], "archived": true}, 200)
	got = req(t, h, "GET", "/objects/tasks/"+tid, nil, 200)
	if got["read_only"] != true {
		t.Fatal(got)
	}
	req(t, h, "GET", "/objects/unknown/"+tid, nil, 400)
	req(t, h, "GET", "/objects/pages/missing", nil, 404)
	req(t, h, "GET", "/objects/pages/"+tid, nil, 404)
	req(t, h, "PATCH", "/tasks/"+tid, object{"version": got["version"], "priority": "low"}, 409)
	req(t, h, "PATCH", "/projects/"+pid, object{"version": float64(2), "archived": false}, 200)
	doomed := req(t, h, "POST", "/projects/"+pid+"/pages", object{"title": "Deleted object"}, 201)
	did := doomed["id"].(string)
	preview := req(t, h, "GET", "/pages/"+did+"/delete-preview", nil, 200)
	req(t, h, "DELETE", "/pages/"+did, preview, 200)
	req(t, h, "GET", "/objects/pages/"+did, nil, 404)
}
