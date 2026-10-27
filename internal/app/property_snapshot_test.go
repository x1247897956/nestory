package app_test

import "testing"

func TestProjectPropertySnapshotScopesAndDeletion(t *testing.T) {
	h, closeDB := setup(t)
	defer closeDB()
	p := req(t, h, "POST", "/projects", object{"title": "Filter"}, 201)["id"].(string)
	other := req(t, h, "POST", "/projects", object{"title": "Other"}, 201)["id"].(string)
	a := req(t, h, "POST", "/projects/"+p+"/tasks", object{"title": "A"}, 201)["id"].(string)
	b := req(t, h, "POST", "/projects/"+other+"/tasks", object{"title": "B"}, 201)["id"].(string)
	d := req(t, h, "POST", "/projects/"+p+"/property-definitions/tasks", object{"kind": "text"}, 201)
	id := d["id"].(string)
	req(t, h, "PUT", "/objects/tasks/"+a+"/custom-properties/"+id, object{"version": 0, "definition_version": 1, "value": "Keep"}, 200)
	snapshot := func(pid string) object {
		return req(t, h, "GET", "/projects/"+pid+"/property-snapshot/tasks", nil, 200)
	}
	s := snapshot(p)
	if len(s["definitions"].([]any)) != 1 {
		t.Fatal(s)
	}
	values := s["values"].(map[string]any)
	if values[a].(map[string]any)[id] != "Keep" || values[b] != nil {
		t.Fatal(values)
	}
	// The same project can have independent note fields with no task leakage.
	note := req(t, h, "POST", "/projects/"+p+"/pages", object{"title": "Note"}, 201)["id"].(string)
	noteDef := req(t, h, "POST", "/projects/"+p+"/property-definitions/pages", object{"kind": "text"}, 201)["id"].(string)
	req(t, h, "PUT", "/objects/pages/"+note+"/custom-properties/"+noteDef, object{"version": 0, "definition_version": 1, "value": "Note only"}, 200)
	notes := req(t, h, "GET", "/projects/"+p+"/property-snapshot/pages", nil, 200)
	if len(notes["definitions"].([]any)) != 1 || notes["values"].(map[string]any)[a] != nil {
		t.Fatal("type leaked")
	}
	if len(snapshot(p)["definitions"].([]any)) != 1 {
		t.Fatal("note definition leaked into task snapshot")
	}
	req(t, h, "PUT", "/objects/tasks/"+a+"/custom-properties/"+id, object{"version": 1, "definition_version": 1, "value": nil}, 200)
	if snapshot(p)["values"].(map[string]any)[a].(map[string]any)[id] != nil {
		t.Fatal("explicit null changed")
	}
	if len(snapshot(other)["values"].(map[string]any)) != 0 {
		t.Fatal("foreign values leaked")
	}
	req(t, h, "GET", "/projects/"+p+"/property-snapshot/invalid", nil, 400)
	req(t, h, "GET", "/projects/missing/property-snapshot/tasks", nil, 404)
	// Soft-deleted tasks must not be returned by the batch query.
	preview := req(t, h, "GET", "/tasks/"+a+"/delete-preview", nil, 200)
	deleted := req(t, h, "DELETE", "/tasks/"+a, preview, 200)
	if len(snapshot(p)["values"].(map[string]any)) != 0 {
		t.Fatal("deleted values leaked")
	}
	req(t, h, "POST", "/trash/"+deleted["batch_id"].(string)+"/restore", nil, 200)
	if len(snapshot(p)["values"].(map[string]any)) != 1 {
		t.Fatal("restored value missing")
	}
	current := req(t, h, "GET", "/projects/"+p, nil, 200)
	req(t, h, "PATCH", "/projects/"+p, object{"version": current["version"], "archived": true}, 200)
	if len(snapshot(p)["definitions"].([]any)) != 1 {
		t.Fatal("archive not readable")
	}
}
