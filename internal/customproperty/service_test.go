package customproperty_test

import (
	"context"
	"encoding/json"
	"noteapp/internal/customproperty"
	"noteapp/internal/object"
	"noteapp/internal/platform/database"
	"path/filepath"
	"strings"
	"testing"
)

func TestSQLiteScopeConstraintsAndLimits(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "properties.db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	for _, pid := range []string{"p", "other"} {
		if _, e = db.ExecContext(ctx, "INSERT INTO projects(id,title,created_at,updated_at)VALUES(?,?,0,0)", pid, pid); e != nil {
			t.Fatal(e)
		}
	}
	for _, v := range []struct{ id, pid string }{{"n", "p"}, {"foreign", "other"}} {
		if _, e = db.ExecContext(ctx, "INSERT INTO pages(id,project_id,title,created_at,updated_at)VALUES(?,?,?,0,0)", v.id, v.pid, v.id); e != nil {
			t.Fatal(e)
		}
	}
	s := customproperty.New(db)
	d, e := s.Create(ctx, "p", object.Note, customproperty.CreateInput{Kind: "text"})
	if e != nil {
		t.Fatal(e)
	}
	for _, name := range []string{"", strings.Repeat("字", 81), "阶\n段"} {
		if _, e = s.Update(ctx, d.ID, customproperty.UpdateInput{Version: 1, Name: &name}); e == nil {
			t.Fatalf("accepted invalid name length %d", len(name))
		}
	}
	_, e = db.ExecContext(ctx, `INSERT INTO custom_property_values(definition_id,project_id,object_type,object_id,page_id,value_json,version,updated_at)VALUES(?,'p','pages','foreign','foreign','null',1,0)`, d.ID)
	if e == nil {
		t.Fatal("cross-project native FK accepted")
	}
	_, e = db.ExecContext(ctx, `INSERT INTO custom_property_values(definition_id,project_id,object_type,object_id,task_id,value_json,version,updated_at)VALUES(?,'p','tasks','n','n','null',1,0)`, d.ID)
	if e == nil {
		t.Fatal("cross-type definition FK accepted")
	}
	raw, _ := json.Marshal(strings.Repeat("字", 4001))
	if _, e = s.Set(ctx, object.Note, "n", d.ID, customproperty.ValueInput{DefinitionVersion: 1, Value: raw}); e == nil {
		t.Fatal("accepted oversized text")
	}
	var count int
	if e = db.QueryRowContext(ctx, "SELECT count(*) FROM custom_property_values").Scan(&count); e != nil {
		t.Fatal(e)
	}
	if count != 0 {
		t.Fatal("invalid write committed")
	}
	for i := 1; i < 64; i++ {
		if _, e = s.Create(ctx, "p", object.Note, customproperty.CreateInput{Kind: "text"}); e != nil {
			t.Fatal(e)
		}
	}
	if _, e = s.Create(ctx, "p", object.Note, customproperty.CreateInput{Kind: "url"}); e == nil {
		t.Fatal("definition cap bypassed")
	}
}

func TestColorsAndCrossTypeImportAreTransactional(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "import.db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	for _, pid := range []string{"p", "other"} {
		if _, e = db.ExecContext(ctx, "INSERT INTO projects(id,title,created_at,updated_at)VALUES(?,?,0,0)", pid, pid); e != nil {
			t.Fatal(e)
		}
	}
	s := customproperty.New(db)
	source, e := s.Create(ctx, "p", object.Note, customproperty.CreateInput{Kind: "multi_select", Name: "标签"})
	if e != nil {
		t.Fatal(e)
	}
	opts := []object.CustomOption{{ID: "a", Name: "阅读", Color: "blue"}, {ID: "b", Name: "研究", Color: "purple"}}
	source, e = s.Update(ctx, source.ID, customproperty.UpdateInput{Version: 1, Options: &opts})
	if e != nil {
		t.Fatal(e)
	}
	bad := []object.CustomOption{{ID: "a", Name: "阅读", Color: "url(evil)"}, {ID: "b", Name: "研究"}}
	if _, e = s.Update(ctx, source.ID, customproperty.UpdateInput{Version: 2, Options: &bad}); e == nil {
		t.Fatal("accepted invalid color")
	}
	for _, input := range []struct {
		pid string
		v   int64
	}{{"other", 2}, {"p", 1}} {
		if _, e = s.Create(ctx, input.pid, object.Task, customproperty.CreateInput{SourceID: source.ID, SourceVersion: input.v}); e == nil {
			t.Fatal("accepted invalid import")
		}
	}
	in := customproperty.CreateInput{SourceID: source.ID, SourceVersion: 2, RequestID: "import-request"}
	target, e := s.Create(ctx, "p", object.Task, in)
	if e != nil {
		t.Fatal(e)
	}
	again, e := s.Create(ctx, "p", object.Task, in)
	if e != nil || again.ID != target.ID {
		t.Fatal("import retry duplicated", e)
	}
	if target.ID == source.ID || target.ObjectType != object.Task || target.Options[0].Color != "blue" || len(target.Options) != 2 {
		t.Fatalf("invalid copied definition: %+v", target)
	}
	if _, e = s.Create(ctx, "p", object.Task, customproperty.CreateInput{SourceID: source.ID, SourceVersion: 2}); e == nil {
		t.Fatal("duplicate target name accepted")
	}
	opts[0].Color = "red"
	if _, e = s.Update(ctx, source.ID, customproperty.UpdateInput{Version: 2, Options: &opts}); e != nil {
		t.Fatal(e)
	}
	var raw string
	var count int
	if e = db.QueryRowContext(ctx, "SELECT options FROM custom_property_definitions WHERE id=?", target.ID).Scan(&raw); e != nil {
		t.Fatal(e)
	}
	if !strings.Contains(raw, `"color":"blue"`) {
		t.Fatal("source edit affected imported definition")
	}
	if e = db.QueryRowContext(ctx, "SELECT count(*) FROM custom_property_definitions").Scan(&count); e != nil || count != 2 {
		t.Fatal("failed import left residue", count, e)
	}
	if e = db.QueryRowContext(ctx, "SELECT count(*) FROM custom_property_values").Scan(&count); e != nil || count != 0 {
		t.Fatal("import copied values", count, e)
	}
	if _, e = db.ExecContext(ctx, "UPDATE projects SET archived_at=1 WHERE id='p'"); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Create(ctx, "p", object.Event, customproperty.CreateInput{SourceID: source.ID, SourceVersion: 3}); e == nil {
		t.Fatal("archived import accepted")
	}
}
