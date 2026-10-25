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
