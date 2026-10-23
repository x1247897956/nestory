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
	}{{"PRAGMA foreign_keys", "1"}, {"PRAGMA journal_mode", "wal"}, {"PRAGMA busy_timeout", "5000"}, {"SELECT count(*) FROM schema_migrations", "4"}} {
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
	if err = db.QueryRowContext(ctx, "SELECT count(*) FROM schema_migrations").Scan(&migrations); err != nil || migrations != 4 {
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
