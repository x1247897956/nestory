package app_test

import "testing"

func TestProjectPinAndBatchDeleteRestore(t *testing.T) {
	h, closeDB := setup(t)
	defer closeDB()
	p := req(t, h, "POST", "/projects", object{"title": "Project actions"}, 201)
	pid := p["id"].(string)
	p = req(t, h, "PATCH", "/projects/"+pid, object{"version": p["version"], "pinned": true}, 200)
	if req(t, h, "GET", "/projects/"+pid, nil, 200)["pinned"] != true {
		t.Fatal("pin not persisted")
	}
	task := req(t, h, "POST", "/projects/"+pid+"/tasks", object{"title": "Task"}, 201)
	event := req(t, h, "POST", "/projects/"+pid+"/events", object{"title": "Event", "start_at": "2026-10-25T09:00:00+08:00", "end_at": "2026-10-25T10:00:00+08:00"}, 201)
	req(t, h, "PUT", "/relations/task-event/"+task["id"].(string)+"/"+event["id"].(string), nil, 200)
	note := req(t, h, "POST", "/projects/"+pid+"/pages", object{"title": "Earlier deletion"}, 201)
	nid := note["id"].(string)
	preview := req(t, h, "GET", "/pages/"+nid+"/delete-preview", nil, 200)
	earlier := req(t, h, "DELETE", "/pages/"+nid, preview, 200)
	preview = req(t, h, "GET", "/projects/"+pid+"/delete-preview", nil, 200)
	req(t, h, "POST", "/projects/"+pid+"/pages", object{"title": "New after preview"}, 201)
	req(t, h, "DELETE", "/projects/"+pid, preview, 409)
	preview = req(t, h, "GET", "/projects/"+pid+"/delete-preview", nil, 200)
	if preview["count"] != float64(4) {
		t.Fatal(preview)
	}
	deleted := req(t, h, "DELETE", "/projects/"+pid, preview, 200)
	req(t, h, "GET", "/projects/"+pid, nil, 404)
	req(t, h, "GET", "/tasks/"+task["id"].(string), nil, 404)
	req(t, h, "POST", "/trash/"+earlier["batch_id"].(string)+"/restore", nil, 409)
	req(t, h, "POST", "/trash/"+deleted["batch_id"].(string)+"/restore", nil, 200)
	if req(t, h, "GET", "/projects/"+pid, nil, 200)["pinned"] != true {
		t.Fatal("restoring lost pin")
	}
	req(t, h, "GET", "/tasks/"+task["id"].(string), nil, 200)
	req(t, h, "GET", "/events/"+event["id"].(string), nil, 200)
	restored := req(t, h, "GET", "/objects/tasks/"+task["id"].(string), nil, 200)
	if len(restored["properties"].(map[string]any)["relations"].([]any)) != 1 {
		t.Fatal("project restore lost relations")
	}
	req(t, h, "GET", "/pages/"+nid, nil, 404)
	req(t, h, "POST", "/trash/"+earlier["batch_id"].(string)+"/restore", nil, 200)
	req(t, h, "GET", "/pages/"+nid, nil, 200)
}
