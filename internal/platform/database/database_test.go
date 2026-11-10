package database_test

import (
	"context"
	"noteapp/internal/platform/database"
	"path/filepath"
	"testing"
)

func TestMigrationAndPersistentPragmas(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "note.db")
	db, err := database.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	for _, check := range []struct {
		query string
		want  string
	}{{"PRAGMA foreign_keys", "1"}, {"PRAGMA journal_mode", "wal"}, {"PRAGMA busy_timeout", "5000"}, {"SELECT count(*) FROM schema_migrations", "10"}} {
		var got string
		if err = db.QueryRowContext(ctx, check.query).Scan(&got); err != nil || got != check.want {
			t.Fatalf("%s got %s err %v", check.query, got, err)
		}
	}
	if _, err = db.ExecContext(ctx, "INSERT INTO projects(id,title,created_at,updated_at) VALUES('stable','Saved',0,0)"); err != nil {
		t.Fatal(err)
	}
	db.Close()
	db, err = database.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var migrations int
	if err = db.QueryRowContext(ctx, "SELECT count(*) FROM schema_migrations").Scan(&migrations); err != nil || migrations != 10 {
		t.Fatalf("migrations not idempotent: %d %v", migrations, err)
	}
	var got string
	if err = db.QueryRowContext(ctx, "SELECT title FROM projects WHERE id='stable'").Scan(&got); err != nil || got != "Saved" {
		t.Fatalf("lost persistent data: %s %v", got, err)
	}
	if _, err = db.ExecContext(ctx, "INSERT INTO tasks(id,project_id,title,created_at,updated_at) VALUES('x','missing','bad',0,0)"); err == nil {
		t.Fatal("foreign key not enforced")
	}
}

func TestSchema8To9PreservesExistingData(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "upgrade.db")
	db, err := database.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	for _, sql := range []string{
		"INSERT INTO projects(id,title,created_at,updated_at)VALUES('p','Keep project',1,2)",
		"INSERT INTO tasks(id,project_id,title,created_at,updated_at)VALUES('t','p','Keep task',3,4)",
		"DROP TABLE custom_property_values", "DROP TABLE custom_property_definitions", "DELETE FROM schema_migrations WHERE version=9",
	} {
		if _, err = db.ExecContext(ctx, sql); err != nil {
			t.Fatal(err)
		}
	}
	var before []byte
	if err = db.QueryRowContext(ctx, "SELECT body_document FROM tasks WHERE id='t'").Scan(&before); err != nil {
		t.Fatal(err)
	}
	db.Close()
	db, err = database.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var after []byte
	var title string
	var version int
	if err = db.QueryRowContext(ctx, "SELECT body_document,title,version FROM tasks WHERE id='t'").Scan(&after, &title, &version); err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) || title != "Keep task" || version != 1 {
		t.Fatal("migration rewrote existing object")
	}
	var count int
	if err = db.QueryRowContext(ctx, "SELECT count(*) FROM custom_property_definitions").Scan(&count); err != nil || count != 0 {
		t.Fatal(count, err)
	}
}
