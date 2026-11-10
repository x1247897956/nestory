package app_test

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestCollectionPropertiesOmitBodyButDetailsStayComplete(t *testing.T) {
	h, close := setup(t)
	defer close()
	p := project(t, h, "Properties")
	doc := object{"version": 1, "blocks": []any{object{"id": "b", "type": "paragraph", "content": []any{object{"type": "text", "text": "keep the complete document", "styles": object{}}}}}}
	for _, typ := range []string{"tasks", "pages", "events"} {
		body := object{"title": "Complete " + typ, "body_document": doc}
		if typ == "events" {
			body["start_at"] = "2026-11-10T09:00:00Z"
			body["end_at"] = "2026-11-10T10:00:00Z"
		}
		path := "/projects/" + p["id"].(string) + "/" + typ
		created := req(t, h, "POST", path, body, 201)
		query := "?"
		if typ == "events" {
			query += "from=2026-11-01T00:00:00Z&to=2026-12-01T00:00:00Z&"
		}
		for _, full := range []bool{false, true} {
			suffix := "include_body=false"
			if full {
				suffix = ""
			}
			r := httptest.NewRequest("GET", "/api/v1"+path+query+suffix, nil)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != 200 {
				t.Fatal(w.Code, w.Body.String())
			}
			var items []object
			if err := json.Unmarshal(w.Body.Bytes(), &items); err != nil {
				t.Fatal(err)
			}
			if len(items) != 1 {
				t.Fatal(items)
			}
			_, hasBody := items[0]["body_document"]
			if hasBody != full {
				t.Fatalf("%s full=%v body=%v", typ, full, hasBody)
			}
			if items[0]["version"] != created["version"] || items[0]["title"] != created["title"] {
				t.Fatal("properties changed")
			}
		}
		detail := req(t, h, "GET", "/"+typ+"/"+created["id"].(string), nil, 200)
		if detail["body_document"] == nil {
			t.Fatal("detail omitted body")
		}
		updated := req(t, h, "PATCH", "/"+typ+"/"+created["id"].(string), object{"version": created["version"], "title": "Only properties"}, 200)
		a, _ := json.Marshal(updated["body_document"])
		b, _ := json.Marshal(created["body_document"])
		if string(a) != string(b) {
			t.Fatal("property-only mutation lost body")
		}
	}
}
