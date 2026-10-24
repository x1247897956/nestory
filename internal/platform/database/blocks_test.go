package database_test

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"noteapp/internal/platform/database"
	"noteapp/migrations"
)

const nativeDoc = `{"version":1,"blocks":[{"id":"native","type":"paragraph","content":[{"type":"text","text":"保留原生块","styles":{"bold":true}}]}]}`
const convertedDoc = `{"version":1,"blocks":[{"id":"converted","type":"heading","props":{"level":1},"content":[{"type":"text","text":"旧正文","styles":{}}]}]}`

func schemaSix(t *testing.T) (string, *sql.DB) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	for _, s := range []string{`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL)`, migrations.Core, migrations.PagesAssets, migrations.EventsRelations, migrations.WorkspaceTrash, migrations.ProjectActions, migrations.BlockDocuments} {
		if _, err = db.Exec(s); err != nil {
			t.Fatal(err)
		}
	}
	for i := 1; i <= 6; i++ {
		if _, err = db.Exec("INSERT INTO schema_migrations VALUES(?,1)", i); err != nil {
			t.Fatal(err)
		}
	}
	for _, s := range []string{
		`INSERT INTO projects(id,title,created_at,updated_at) VALUES('p','project',1,2)`,
		`INSERT INTO tasks(id,project_id,title,body,created_at,updated_at,version) VALUES('t','p','task','# 旧正文',11,22,3)`,
		`INSERT INTO pages(id,project_id,title,body,body_document,legacy_body,created_at,updated_at,deleted_at,delete_batch_id) VALUES('n','p','note','obsolete',?, 'original',11,22,33,'batch')`,
		`INSERT INTO events(id,project_id,title,start_at,end_at,created_at,updated_at) VALUES('e','p','event',1,2,11,22)`,
		`INSERT INTO task_events VALUES('p','t','e')`,
	} {
		var args []any
		if strings.Contains(s, "VALUES('n'") {
			args = []any{nativeDoc}
		}
		if _, err = db.Exec(s, args...); err != nil {
			t.Fatal(err)
		}
	}
	return path, db
}
func prepare(t *testing.T, db *sql.DB, hash, doc string) {
	t.Helper()
	if _, err := db.Exec(`CREATE TABLE block_migration_prepared(object_type TEXT,object_id TEXT,source_sha256 TEXT,body_document BLOB,PRIMARY KEY(object_type,object_id)); INSERT INTO block_migration_prepared VALUES('tasks','t',?,?)`, hash, doc); err != nil {
		t.Fatal(err)
	}
}
func TestBlockOnlyMigrationPreservesAllObjects(t *testing.T) {
	path, old := schemaSix(t)
	prepare(t, old, fmt.Sprintf("%x", sha256.Sum256([]byte("# 旧正文"))), convertedDoc)
	old.Close()
	db, err := database.Open(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, pair := range []struct{ table, id, want string }{{"tasks", "t", convertedDoc}, {"pages", "n", nativeDoc}, {"events", "e", `{"version":1,"blocks":[]}`}} {
		var raw string
		if err = db.QueryRow("SELECT body_document FROM "+pair.table+" WHERE id=?", pair.id).Scan(&raw); err != nil || raw != pair.want {
			t.Fatalf("%s content changed: %s %v", pair.table, raw, err)
		}
		var count int
		if err = db.QueryRow("SELECT count(*) FROM pragma_table_info(?) WHERE name IN ('body','legacy_body')", pair.table).Scan(&count); err != nil || count != 0 {
			t.Fatal("old columns remain", err)
		}
	}
	var version, created, updated, deleted int
	if err = db.QueryRow("SELECT version,created_at,updated_at FROM tasks WHERE id='t'").Scan(&version, &created, &updated); err != nil || version != 3 || created != 11 || updated != 22 {
		t.Fatal("metadata changed", err)
	}
	if err = db.QueryRow("SELECT deleted_at FROM pages WHERE id='n'").Scan(&deleted); err != nil || deleted != 33 {
		t.Fatal("deleted document lost", err)
	}
	var n int
	if err = db.QueryRow("SELECT count(*) FROM task_events").Scan(&n); err != nil || n != 1 {
		t.Fatal("relation lost", err)
	}
	if err = db.QueryRow("SELECT count(*) FROM sqlite_master WHERE name='block_migration_prepared'").Scan(&n); err != nil || n != 0 {
		t.Fatal("staging retained", err)
	}
	if _, err = db.Exec(`INSERT INTO tasks(id,project_id,title,created_at,updated_at) VALUES('empty','p','empty',1,1)`); err != nil {
		t.Fatal(err)
	}
	var raw []byte
	if err = db.QueryRow("SELECT body_document FROM tasks WHERE id='empty'").Scan(&raw); err != nil || !json.Valid(raw) {
		t.Fatal("missing default document", err)
	}
	if _, err = db.Exec("UPDATE tasks SET body_document=NULL WHERE id='empty'"); err == nil {
		t.Fatal("nullable native document")
	}
 for _, invalid := range []string{`{}`,`{"blocks":[]}`,`{"version":1}`,`null`} {
  if _, err = db.Exec("UPDATE tasks SET body_document=? WHERE id='empty'", invalid); err == nil { t.Fatalf("invalid SQL document accepted: %s",invalid) }
 }
	rows, err := db.Query("PRAGMA foreign_key_check")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	if rows.Next() {
		t.Fatal("foreign keys broken")
	}
}
func TestBlockMigrationFailuresRollback(t *testing.T) {
	for _, mode := range []string{"missing", "stale", "invalid-prepared", "invalid-existing"} {
		t.Run(mode, func(t *testing.T) {
			path, old := schemaSix(t)
			if mode != "missing" {
				hash := fmt.Sprintf("%x", sha256.Sum256([]byte("# 旧正文")))
				doc := convertedDoc
				if mode == "stale" {
					hash = "bad"
				}
				if mode == "invalid-prepared" {
					doc = `null`
				}
				prepare(t, old, hash, doc)
			}
			if mode == "invalid-existing" {
				if _, err := old.Exec(`UPDATE events SET body_document='{"version":2,"blocks":[]}'`); err != nil {
					t.Fatal(err)
				}
			}
			old.Close()
			db, err := database.Open(context.Background(), path)
			if err == nil {
				db.Close()
				t.Fatal("invalid migration succeeded")
			}
			check, e := sql.Open("sqlite", path)
			if e != nil {
				t.Fatal(e)
			}
			defer check.Close()
			var source string
			if e = check.QueryRow("SELECT body FROM tasks WHERE id='t'").Scan(&source); e != nil || source != "# 旧正文" {
				t.Fatal("rollback lost source", e)
			}
			var n int
			if e = check.QueryRow("SELECT count(*) FROM schema_migrations WHERE version=7").Scan(&n); e != nil || n != 0 {
				t.Fatal("partial migration recorded", e)
			}
		})
	}
}
