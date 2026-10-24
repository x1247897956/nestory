package task

import (
	"context"
	"noteapp/internal/object"
	"noteapp/internal/platform/database"
	"noteapp/internal/project"
	"noteapp/internal/taskmeta"
	"path/filepath"
	"testing"
)

// Metadata, service defaults and SQLite constraints must describe the same fixed type.
func TestTaskDefinitionsMatchCreationAndDatabase(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, filepath.Join(t.TempDir(), "db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	title := "p"
	p, err := project.New(db).Create(ctx, project.Input{Title: &title})
	if err != nil {
		t.Fatal(err)
	}
	schema, err := object.Describe(object.Task)
	if err != nil {
		t.Fatal(err)
	}
	defaults := map[string]any{}
	for _, prop := range schema.Properties {
		defaults[prop.Key] = prop.Default
	}
	s := New(db)
	taskTitle := "t"
	v, err := s.Create(ctx, p.ID, Input{Title: &taskTitle})
	if err != nil {
		t.Fatal(err)
	}
	if v.Stage != defaults["stage"] || v.Priority != defaults["priority"] {
		t.Fatal("service defaults disagree with metadata", v, defaults)
	}
	if _, err = db.Exec("INSERT INTO tasks(id,project_id,title,created_at,updated_at) VALUES('sql-default',?,'SQL',1,1)", p.ID); err != nil {
		t.Fatal(err)
	}
	var stage, priority string
	if err = db.QueryRow("SELECT stage,priority FROM tasks WHERE id='sql-default'").Scan(&stage, &priority); err != nil {
		t.Fatal(err)
	}
	if stage != v.Stage || priority != v.Priority {
		t.Fatal("SQLite defaults disagree with creation")
	}
	for _, option := range taskmeta.Stages() {
		if _, err = s.Create(ctx, p.ID, Input{Title: &taskTitle, Stage: &option.ID}); err != nil {
			t.Fatal(option, err)
		}
	}
	for _, option := range taskmeta.Priorities() {
		if _, err = s.Create(ctx, p.ID, Input{Title: &taskTitle, Priority: &option.ID}); err != nil {
			t.Fatal(option, err)
		}
	}
	invalid := "unknown"
	if _, err = s.Create(ctx, p.ID, Input{Title: &taskTitle, Stage: &invalid}); err == nil {
		t.Fatal("unknown stage accepted")
	}
	if _, err = s.Create(ctx, p.ID, Input{Title: &taskTitle, Priority: &invalid}); err == nil {
		t.Fatal("unknown priority accepted")
	}
}
