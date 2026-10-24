package app_test

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestDocumentAndEnvelopeLimits(t *testing.T) {
	h, closeDB := setup(t)
	defer closeDB()
	p := project(t, h, "Limits")
	note := req(t, h, "POST", "/projects/"+p["id"].(string)+"/pages", object{"title": "long"}, 201)
	path := "/pages/" + note["id"].(string)
	doc := textDocument(strings.Repeat("中", 400000)) // 1.2 MB UTF8, below document budget.
	saved := req(t, h, "PATCH", path, object{"version": note["version"], "body_document": doc}, 200)
	if !reflect.DeepEqual(saved["body_document"], normalizeJSON(t, doc)) {
		t.Fatal("long document changed")
	}
	req(t, h, "PATCH", path, object{"version": saved["version"], "title": "must not persist", "body_document": textDocument(strings.Repeat("x", (2<<20)+1))}, 413)
	req(t, h, "PATCH", path, object{"version": saved["version"], "title": strings.Repeat("x", 4<<20)}, 413)
	got := req(t, h, "GET", path, nil, 200)
	if !reflect.DeepEqual(got, saved) {
		t.Fatal("limit rejection changed object")
	}
}
func normalizeJSON(t *testing.T, v any) any {
	t.Helper()
	raw, e := json.Marshal(v)
	if e != nil {
		t.Fatal(e)
	}
	var out any
	if e = json.Unmarshal(raw, &out); e != nil {
		t.Fatal(e)
	}
	return out
}
