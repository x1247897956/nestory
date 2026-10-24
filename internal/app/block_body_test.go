package app_test

import "testing"

func TestBlockBodyMigrationAndAtomicWrites(t *testing.T) {
	h, closeDB := setup(t)
	defer closeDB()
	p := req(t, h, "POST", "/projects", object{"title": "Blocks"}, 201)
	for _, kind := range []string{"tasks", "pages", "events"} {
		t.Run(kind, func(t *testing.T) {
			in := object{"title": "Legacy", "body": "# Original\n\n- [ ] Keep"}
			if kind == "events" {
				in["start_at"] = "2026-10-25T09:00:00Z"
				in["end_at"] = "2026-10-25T10:00:00Z"
			}
			old := req(t, h, "POST", "/projects/"+p["id"].(string)+"/"+kind, in, 201)
			path := "/" + kind + "/" + old["id"].(string)
			doc := object{"version": 1, "blocks": []any{object{"id": "paragraph-1", "type": "paragraph", "props": object{}, "content": []any{object{"type": "text", "text": "New content", "styles": object{}}}, "children": []any{}}}}
			changed := req(t, h, "PATCH", path, object{"version": old["version"], "body": "New content", "body_document": doc}, 200)
			if changed["body_document"] == nil || changed["legacy_body"] != in["body"] {
				t.Fatalf("lost block document or original: %#v", changed)
			}
			req(t, h, "PATCH", path, object{"version": old["version"], "body": "stale", "body_document": doc}, 409)
			req(t, h, "PATCH", path, object{"version": changed["version"], "body": "overwrite from legacy client"}, 409)
			req(t, h, "PATCH", path, object{"version": changed["version"], "body": "bad", "body_document": object{"version": 2, "blocks": []any{}}}, 400)
			req(t, h, "PATCH", path, object{"version": changed["version"], "body": "bad", "body_document": object{"version": 1, "blocks": []any{object{"id": "broken", "type": "paragraph", "content": object{}}}}}, 400)
			got := req(t, h, "GET", path, nil, 200)
			if got["body"] != "New content" || got["version"] != changed["version"] {
				t.Fatal("failed write altered persisted snapshot", got)
			}
			meta := req(t, h, "PATCH", path, object{"version": got["version"], "title": "Renamed"}, 200)
			if meta["legacy_body"] != in["body"] || meta["body_document"] == nil {
				t.Fatal("metadata edit lost document")
			}
			preview := req(t, h, "GET", path+"/delete-preview", nil, 200)
			batch := req(t, h, "DELETE", path, preview, 200)
			req(t, h, "POST", "/trash/"+batch["batch_id"].(string)+"/restore", nil, 200)
			got = req(t, h, "GET", path, nil, 200)
			if got["body_document"] == nil || got["legacy_body"] != in["body"] {
				t.Fatal("restore lost blocks")
			}
		})
	}
}
