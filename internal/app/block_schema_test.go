package app_test

import (
	"context"
	"path/filepath"
	"reflect"
	"testing"

	"noteapp/internal/app"
	"noteapp/internal/platform/config"
	"noteapp/internal/platform/database"
)

func TestBlockSchemaAtomicWrites(t *testing.T) {
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "schema.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	h := app.New(db, config.Config{Timezone: "Asia/Shanghai", AllowedHosts: []string{"example.com"}})
	p := project(t, h, "Schema")
	invalid := []object{
		{"version": 1, "blocks": []any{object{"id": "bad-empty-row", "type": "table", "content": object{"type": "tableContent", "rows": []any{object{"cells": []any{object{"type": "tableCell", "props": object{"rowspan": 2}, "content": []any{}}}}, object{"cells": []any{}}}}}}},
		{"version": 1, "blocks": []any{object{"id": "bad-style", "type": "paragraph", "content": []any{object{"type": "text", "text": "x", "styles": object{"unknown": true}}}}}},
		{"version": 1, "blocks": []any{object{"id": "bad-table", "type": "table", "content": object{"type": "tableContent", "headerRows": 4294967296, "rows": []any{object{"cells": []any{[]any{}}}}}}}},
	}
	for _, kind := range []string{"tasks", "pages", "events"} {
		t.Run(kind, func(t *testing.T) {
			base := "/projects/" + p["id"].(string) + "/" + kind
			input := object{"title": "Native", "body_document": textDocument("Keep")}
			if kind == "events" {
				input["start_at"] = "2026-10-25T09:00:00Z"
				input["end_at"] = "2026-10-25T10:00:00Z"
			}
			original := req(t, h, "POST", base, input, 201)
			path := "/" + kind + "/" + original["id"].(string)
			var beforeCount int
			if err := db.QueryRow("SELECT count(*) FROM " + kind).Scan(&beforeCount); err != nil {
				t.Fatal(err)
			}
			for _, doc := range invalid {
				input["body_document"] = doc
				req(t, h, "POST", base, input, 400)
				req(t, h, "PATCH", path, object{"version": original["version"], "title": "must rollback", "body_document": doc}, 400)
				if got := req(t, h, "GET", path, nil, 200); !reflect.DeepEqual(got, original) {
					t.Fatal("invalid update mutated snapshot", got, original)
				}
			}
			var afterCount int
			if err := db.QueryRow("SELECT count(*) FROM " + kind).Scan(&afterCount); err != nil {
				t.Fatal(err)
			}
			if afterCount != beforeCount {
				t.Fatal("invalid create persisted object")
			}
		})
	}
}
