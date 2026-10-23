package app_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"noteapp/internal/app"
	"noteapp/internal/platform/config"
	"noteapp/internal/platform/database"
)

type object map[string]any

func setup(t *testing.T) (http.Handler, func()) {
	t.Helper()
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	return app.New(db, config.Config{Timezone: "Asia/Shanghai"}), func() { db.Close() }
}
func req(t *testing.T, h http.Handler, method, path string, data any, want int) object {
	t.Helper()
	b, _ := json.Marshal(data)
	r := httptest.NewRequest(method, "/api/v1"+path, bytes.NewReader(b))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != want {
		t.Fatalf("%s %s: want %d got %d: %s", method, path, want, w.Code, w.Body.String())
	}
	var out object
	if w.Body.Len() > 0 {
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
	}
	return out
}
func project(t *testing.T, h http.Handler, title string) object {
	return req(t, h, "POST", "/projects", object{"title": title}, 201)
}
func task(t *testing.T, h http.Handler, p object, title string, parent any) object {
	return req(t, h, "POST", "/projects/"+p["id"].(string)+"/tasks", object{"title": title, "parent_id": parent}, 201)
}
func TestValidationAndIndependentStages(t *testing.T) {
	h, close := setup(t)
	defer close()
	req(t, h, "POST", "/projects", object{"title": "  "}, 400)
	p := project(t, h, "毕业设计")
	path := "/projects/" + p["id"].(string) + "/tasks"
	for _, body := range []object{{"title": " "}, {"title": "x", "due_date": "2026-02-30"}, {"title": "x", "stage": "unknown"}, {"title": "x", "priority": "urgent"}} {
		req(t, h, "POST", path, body, 400)
	}
	parent := task(t, h, p, "读论文", nil)
	child := task(t, h, p, "读摘要", parent["id"])
	for _, stage := range []string{"done", "todo", "cancelled", "in_process", "in_plan"} {
		parent = req(t, h, "PATCH", "/tasks/"+parent["id"].(string), object{"version": parent["version"], "stage": stage}, 200)
	}
	got := req(t, h, "GET", "/tasks/"+child["id"].(string), nil, 200)
	if got["stage"] != "todo" {
		t.Fatal("parent changed child stage")
	}
	req(t, h, "POST", path, object{"title": "grandchild", "parent_id": child["id"]}, 409)
	other := project(t, h, "其他")
	req(t, h, "POST", "/projects/"+other["id"].(string)+"/tasks", object{"title": "cross", "parent_id": parent["id"]}, 409)
}
func TestVersionsArchiveAndMove(t *testing.T) {
	h, close := setup(t)
	defer close()
	p := project(t, h, "Project")
	a := task(t, h, p, "A", nil)
	b := task(t, h, p, "B", nil)
	path := "/tasks/" + a["id"].(string)
	req(t, h, "PATCH", path, object{"title": "missing version"}, 400)
	updated := req(t, h, "PATCH", path, object{"version": a["version"], "body": "saved"}, 200)
	req(t, h, "PATCH", path, object{"version": a["version"], "body": "stale"}, 409)
	a = req(t, h, "POST", path+"/move", object{"version": updated["version"], "parent_id": b["id"], "position": 0}, 200)
	req(t, h, "POST", "/tasks/"+b["id"].(string)+"/move", object{"version": b["version"], "parent_id": a["id"], "position": 0}, 409)
	pp := "/projects/" + p["id"].(string)
	p = req(t, h, "PATCH", pp, object{"version": p["version"], "archived": true}, 200)
	req(t, h, "PATCH", path, object{"version": a["version"], "body": "blocked"}, 409)
	req(t, h, "POST", pp+"/tasks", object{"title": "blocked"}, 409)
	req(t, h, "POST", path+"/move", object{"version": a["version"], "position": 0}, 409)
	req(t, h, "PATCH", pp, object{"version": p["version"], "title": "blocked"}, 409)
	req(t, h, "PATCH", pp, object{"version": p["version"]}, 409)
	p = req(t, h, "PATCH", pp, object{"version": p["version"], "archived": false}, 200)
	req(t, h, "PATCH", path, object{"version": a["version"], "body": "editable"}, 200)
}
func TestHealthAndOrigin(t *testing.T) {
	h, close := setup(t)
	req(t, h, "GET", "/healthz", nil, 200)
	req(t, h, "GET", "/readyz", nil, 200)
	r := httptest.NewRequest("POST", "/api/v1/projects", bytes.NewBufferString(`{"title":"attack"}`))
	r.Header.Set("Origin", "https://evil.example")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatalf("origin got %d", w.Code)
	}
	close()
	req(t, h, "GET", "/healthz", nil, 200)
	req(t, h, "GET", "/readyz", nil, 503)
}

func TestEventAndRelationAPI(t *testing.T) {
	h, close := setup(t)
	defer close()
	p := project(t, h, "毕业设计")
	base := "/projects/" + p["id"].(string) + "/events"
	ev := req(t, h, "POST", base, object{"title": "讨论方案", "start_at": "2026-10-24T23:00:00+08:00", "end_at": "2026-10-25T01:00:00+08:00"}, 201)
	req(t, h, "PATCH", "/events/"+ev["id"].(string), object{"version": 1, "body": "描述"}, 200)
	req(t, h, "PATCH", "/events/"+ev["id"].(string), object{"version": 1, "body": "旧稿"}, 409)
	req(t, h, "GET", base, nil, 400)
	ta := task(t, h, p, "执行实验", nil)
	pg := req(t, h, "POST", "/projects/"+p["id"].(string)+"/pages", object{"title": "实验方案"}, 201)
	for _, r := range []string{"task-page/" + ta["id"].(string) + "/" + pg["id"].(string), "task-event/" + ta["id"].(string) + "/" + ev["id"].(string), "page-event/" + pg["id"].(string) + "/" + ev["id"].(string)} {
		req(t, h, "PUT", "/relations/"+r, nil, 200)
		req(t, h, "PUT", "/relations/"+r, nil, 200)
		req(t, h, "DELETE", "/relations/"+r, nil, 200)
	}
}
