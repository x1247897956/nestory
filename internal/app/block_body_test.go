package app_test

import (
	"reflect"
	"testing"
)

func textDocument(text string) object {
	return object{"version": 1, "blocks": []any{object{"id": "paragraph-1", "type": "paragraph", "props": object{}, "content": []any{object{"type": "text", "text": text, "styles": object{}}}, "children": []any{}}}}
}

func assertBlockOnly(t *testing.T, value object) {
	t.Helper()
	for _, key := range []string{"body", "legacy_body"} {
		if _, ok := value[key]; ok {
			t.Fatalf("response contains removed field %s: %#v", key, value)
		}
	}
	if value["body_document"] == nil {
		t.Fatal("missing native document", value)
	}
}

func TestBlockOnlyContractAndAtomicWrites(t *testing.T) {
	h, closeDB := setup(t)
	defer closeDB()
	p := project(t, h, "Blocks")
	for _, kind := range []string{"tasks", "pages", "events"} {
		t.Run(kind, func(t *testing.T) {
			in := object{"title": "Native"}
			if kind == "events" {
				in["start_at"] = "2026-10-25T09:00:00Z"
				in["end_at"] = "2026-10-25T10:00:00Z"
			}
			base := "/projects/" + p["id"].(string) + "/" + kind
			for _, field := range []string{"body", "legacy_body"} {
				in[field] = "rejected"
				req(t, h, "POST", base, in, 400)
				delete(in, field)
			}
			old := req(t, h, "POST", base, in, 201)
			assertBlockOnly(t, old)
			doc := old["body_document"].(map[string]any)
			if doc["version"] != float64(1) || len(doc["blocks"].([]any)) != 0 {
				t.Fatal("creation did not default to empty document", doc)
			}
			path := "/" + kind + "/" + old["id"].(string)
			changed := req(t, h, "PATCH", path, object{"version": old["version"], "body_document": textDocument("New content")}, 200)
			assertBlockOnly(t, changed)
			req(t, h, "PATCH", path, object{"version": old["version"], "body_document": textDocument("stale")}, 409)
			for _, field := range []string{"body", "legacy_body"} {
				req(t, h, "PATCH", path, object{"version": changed["version"], "title": "must not persist", field: "rejected", "body_document": textDocument("must not persist")}, 400)
			}
			for _, invalid := range []any{nil, object{"version": 2, "blocks": []any{}}, object{"version": 1, "blocks": []any{object{"id": "broken", "type": "paragraph", "content": object{}}}}} {
				req(t, h, "PATCH", path, object{"version": changed["version"], "title": "must not persist", "body_document": invalid}, 400)
			}
			got := req(t, h, "GET", path, nil, 200)
			if !reflect.DeepEqual(got, changed) {
				t.Fatal("failed writes altered persisted snapshot", got, changed)
			}
			meta := req(t, h, "PATCH", path, object{"version": got["version"], "title": "Renamed"}, 200)
			assertBlockOnly(t, meta)
			if !reflect.DeepEqual(meta["body_document"], changed["body_document"]) {
				t.Fatal("metadata edit changed document")
			}
			preview := req(t, h, "GET", path+"/delete-preview", nil, 200)
			batch := req(t, h, "DELETE", path, preview, 200)
			req(t, h, "POST", "/trash/"+batch["batch_id"].(string)+"/restore", nil, 200)
			restored := req(t, h, "GET", path, nil, 200)
			assertBlockOnly(t, restored)
			if !reflect.DeepEqual(restored["body_document"], meta["body_document"]) {
				t.Fatal("restore lost document")
			}
		})
	}
}
