package customproperty_test

import (
	"context"
	"encoding/json"
	"noteapp/internal/customproperty"
	"noteapp/internal/object"
	"noteapp/internal/platform/database"
	"path/filepath"
	"testing"
)

func TestDeleteOptionSQLitePreservesIndependentValues(t *testing.T) {
	for _, kind := range []string{"single_select", "multi_select"} {
		t.Run(kind, func(t *testing.T) {
			ctx := context.Background()
			db, err := database.Open(ctx, filepath.Join(t.TempDir(), "delete.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			exec := func(q string, args ...any) {
				t.Helper()
				if _, err := db.ExecContext(ctx, q, args...); err != nil {
					t.Fatal(err)
				}
			}
			exec("INSERT INTO projects(id,title,created_at,updated_at) VALUES('p','P',0,0)")
			for _, id := range []string{"both", "only", "other", "null", "absent"} {
				exec("INSERT INTO pages(id,project_id,title,created_at,updated_at) VALUES(?,'p',?,0,0)", id, id)
			}
			s := customproperty.New(db)
			d, err := s.Create(ctx, "p", object.Note, customproperty.CreateInput{Kind: kind})
			if err != nil {
				t.Fatal(err)
			}
			opts := []object.CustomOption{{ID: "a", Name: "A"}, {ID: "b", Name: "B", Color: "blue"}}
			d, err = s.Update(ctx, d.ID, customproperty.UpdateInput{Version: 1, Options: &opts})
			if err != nil {
				t.Fatal(err)
			}
			values := map[string]string{"both": `"a"`, "only": `"a"`, "other": `"b"`, "null": `null`}
			if kind == "multi_select" {
				values["both"] = `["a","b"]`
				values["only"] = `["a"]`
				values["other"] = `["b"]`
			}
			for oid, raw := range values {
				if _, err := s.Set(ctx, object.Note, oid, d.ID, customproperty.ValueInput{DefinitionVersion: 2, Value: json.RawMessage(raw)}); err != nil {
					t.Fatal(err)
				}
			}
			exec("UPDATE custom_property_values SET updated_at=7 WHERE definition_id=?", d.ID)
			exec("UPDATE pages SET deleted_at=1 WHERE id='only'")
			// Rejections must not change either the definition or any values.
			if _, err = s.DeleteOption(ctx, d.ID, "a", customproperty.DeleteInput{Version: 1}); err == nil {
				t.Fatal("stale accepted")
			}
			if _, err = s.DeleteOption(ctx, d.ID, "missing", customproperty.DeleteInput{Version: 2}); err == nil {
				t.Fatal("unknown accepted")
			}
			exec("UPDATE projects SET archived_at=1 WHERE id='p'")
			if _, err = s.DeleteOption(ctx, d.ID, "a", customproperty.DeleteInput{Version: 2}); err == nil {
				t.Fatal("archived accepted")
			}
			if err = s.Delete(ctx, d.ID, customproperty.DeleteInput{Version: 2}); err == nil {
				t.Fatal("archived delete accepted")
			}
			exec("UPDATE projects SET archived_at=NULL WHERE id='p'")
			d, err = s.DeleteOption(ctx, d.ID, "a", customproperty.DeleteInput{Version: 2})
			if err != nil {
				t.Fatal(err)
			}
			if d.Version != 3 || len(d.Options) != 1 || d.Options[0] != opts[1] {
				t.Fatalf("definition: %+v", d)
			}
			for oid, before := range values {
				var raw string
				var version, updated int64
				if err := db.QueryRowContext(ctx, "SELECT value_json,version,updated_at FROM custom_property_values WHERE definition_id=? AND object_id=?", d.ID, oid).Scan(&raw, &version, &updated); err != nil {
					t.Fatal(err)
				}
				want, wantVersion := before, int64(1)
				if oid == "both" || oid == "only" {
					want = "null"
					wantVersion = 2
					if kind == "multi_select" && oid == "both" {
						want = `["b"]`
					}
					if updated == 7 {
						t.Fatal("affected timestamp unchanged")
					}
				} else if updated != 7 {
					t.Fatal("unaffected timestamp changed")
				}
				if raw != want || version != wantVersion {
					t.Fatalf("%s got %s v%d want %s v%d", oid, raw, version, want, wantVersion)
				}
			}
			var count int
			if err := db.QueryRowContext(ctx, "SELECT count(*) FROM pages WHERE version<>1").Scan(&count); err != nil || count != 0 {
				t.Fatal("native version changed", count, err)
			}
			sibling, err := s.Create(ctx, "p", object.Note, customproperty.CreateInput{Kind: "text"})
			if err != nil {
				t.Fatal(err)
			}
			if _, err := s.Set(ctx, object.Note, "other", sibling.ID, customproperty.ValueInput{DefinitionVersion: 1, Value: json.RawMessage(`"keep"`)}); err != nil {
				t.Fatal(err)
			}
			if err := s.Delete(ctx, d.ID, customproperty.DeleteInput{Version: 2}); err == nil {
				t.Fatal("stale deletion accepted")
			}
			if err := s.Delete(ctx, d.ID, customproperty.DeleteInput{Version: 3}); err != nil {
				t.Fatal(err)
			}
			var kept string
			if err := db.QueryRowContext(ctx, "SELECT value_json FROM custom_property_values WHERE definition_id=?", sibling.ID).Scan(&kept); err != nil || kept != `"keep"` {
				t.Fatal("unrelated property changed", kept, err)
			}
			for _, table := range []string{"custom_property_definitions", "custom_property_values"} {
				if err := db.QueryRowContext(ctx, "SELECT count(*) FROM "+table+" WHERE "+map[string]string{"custom_property_definitions": "id", "custom_property_values": "definition_id"}[table]+"=?", d.ID).Scan(&count); err != nil || count != 0 {
					t.Fatal("delete residue", table, count, err)
				}
			}
		})
	}
}

func TestDeleteOptionSQLiteRollsBackAllChanges(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, filepath.Join(t.TempDir(), "rollback.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, q := range []string{"INSERT INTO projects(id,title,created_at,updated_at) VALUES('p','P',0,0)", "INSERT INTO pages(id,project_id,title,created_at,updated_at) VALUES('n','p','N',0,0)"} {
		if _, err = db.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	s := customproperty.New(db)
	d, err := s.Create(ctx, "p", object.Note, customproperty.CreateInput{Kind: "single_select"})
	if err != nil {
		t.Fatal(err)
	}
	opts := []object.CustomOption{{ID: "a", Name: "A"}}
	d, err = s.Update(ctx, d.ID, customproperty.UpdateInput{Version: 1, Options: &opts})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Set(ctx, object.Note, "n", d.ID, customproperty.ValueInput{DefinitionVersion: 2, Value: json.RawMessage(`"a"`)}); err != nil {
		t.Fatal(err)
	}
	// Inject a late storage failure after value normalization to prove transaction rollback.
	if _, err = db.ExecContext(ctx, `CREATE TRIGGER fail_definition_update BEFORE UPDATE ON custom_property_definitions BEGIN SELECT RAISE(ABORT, 'test failure'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err = s.DeleteOption(ctx, d.ID, "a", customproperty.DeleteInput{Version: 2}); err == nil {
		t.Fatal("injected failure ignored")
	}
	var raw string
	var version int64
	if err = db.QueryRowContext(ctx, "SELECT value_json,version FROM custom_property_values WHERE definition_id=?", d.ID).Scan(&raw, &version); err != nil {
		t.Fatal(err)
	}
	if raw != `"a"` || version != 1 {
		t.Fatal("partial cleanup committed", raw, version)
	}
	defs, err := s.Definitions(ctx, "p", object.Note)
	if err != nil || len(defs) != 1 || defs[0].Version != 2 || len(defs[0].Options) != 1 {
		t.Fatal("definition changed", defs, err)
	}
}

func TestDefinitionDeleteSQLiteRollsBackValues(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, filepath.Join(t.TempDir(), "delete-rollback.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, q := range []string{"INSERT INTO projects(id,title,created_at,updated_at) VALUES('p','P',0,0)", "INSERT INTO pages(id,project_id,title,created_at,updated_at) VALUES('n','p','N',0,0)"} {
		if _, err = db.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	s := customproperty.New(db)
	d, err := s.Create(ctx, "p", object.Note, customproperty.CreateInput{Kind: "text"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Set(ctx, object.Note, "n", d.ID, customproperty.ValueInput{DefinitionVersion: 1, Value: json.RawMessage(`"keep"`)}); err != nil {
		t.Fatal(err)
	}
	if _, err = db.ExecContext(ctx, `CREATE TRIGGER fail_definition_delete BEFORE DELETE ON custom_property_definitions BEGIN SELECT RAISE(ABORT, 'test failure'); END`); err != nil {
		t.Fatal(err)
	}
	if err = s.Delete(ctx, d.ID, customproperty.DeleteInput{Version: 1}); err == nil {
		t.Fatal("injected deletion failure ignored")
	}
	view, err := s.Fields(ctx, object.Note, "n")
	if err != nil {
		t.Fatal(err)
	}
	if len(view.Fields) != 1 || string(view.Fields[0].Value) != `"keep"` || view.Fields[0].Version != 1 {
		t.Fatal("partial delete committed", view)
	}
}
