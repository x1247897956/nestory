package database_test

import (
	"context"
	"path/filepath"
	"testing"

	"noteapp/internal/platform/database"
)

func TestSearchIndexTracksSourceTransactions(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, filepath.Join(t.TempDir(), "search.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO projects(id,title,description,created_at,updated_at) VALUES('p','Project','project text',1,1)`)
	exec(`INSERT INTO pages(id,project_id,title,body_document,created_at,updated_at) VALUES('n','p','Note','{"version":1,"blocks":[{"id":"b","type":"paragraph","content":[{"type":"text","text":"中文 needle","styles":{}}]}]}',1,1)`)
	check := func(want int) {
		t.Helper()
		var n int
		if err := db.QueryRow(`SELECT count(*) FROM search_fts WHERE body LIKE '%needle%'`).Scan(&n); err != nil || n != want {
			t.Fatalf("indexed=%d want=%d err=%v", n, want, err)
		}
	}
	check(1)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(`UPDATE pages SET body_document='{"version":1,"blocks":[]}' WHERE id='n'`); err != nil {
		t.Fatal(err)
	}
	if err = tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	check(1)
	exec(`UPDATE pages SET deleted_at=2 WHERE id='n'`)
	check(0)
	exec(`UPDATE pages SET deleted_at=NULL WHERE id='n'`)
	check(1)
	exec(`UPDATE pages SET title='Renamed' WHERE id='n'`)
	var title string
	if err = db.QueryRow(`SELECT title FROM search_documents WHERE object_type='pages' AND object_id='n'`).Scan(&title); err != nil || title != "Renamed" {
		t.Fatal(title, err)
	}
	exec(`DELETE FROM pages WHERE id='n'`)
	check(0)
}

func TestSchema9SearchBackfillPreservesBlocks(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "upgrade.db")
	db, err := database.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	// Remove only schema10 artifacts, reproducing the actual predecessor schema.
	rows, err := db.Query(`SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'search_%'`)
	if err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for rows.Next() {
		var name string
		if err = rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		names = append(names, name)
	}
	if err = rows.Err(); err != nil {
		t.Fatal(err)
	}
	rows.Close()
	for _, name := range names {
		if _, err = db.Exec(`DROP TRIGGER "` + name + `"`); err != nil {
			t.Fatal(err)
		}
	}
	for _, q := range []string{`DROP TABLE search_fts`, `DROP TABLE search_documents`, `DELETE FROM schema_migrations WHERE version=10`, `INSERT INTO projects(id,title,created_at,updated_at) VALUES('p','Keep',1,1)`, `INSERT INTO tasks(id,project_id,title,body_document,created_at,updated_at) VALUES('t','p','Existing','{"version":1,"blocks":[{"id":"b","type":"paragraph","content":[{"type":"text","text":"needle","styles":{}}]}]}',1,1)`} {
		if _, err = db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	var before string
	if err = db.QueryRow(`SELECT body_document FROM tasks WHERE id='t'`).Scan(&before); err != nil {
		t.Fatal(err)
	}
	db.Close()
	db, err = database.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var after string
	var n int
	if err = db.QueryRow(`SELECT body_document FROM tasks WHERE id='t'`).Scan(&after); err != nil || after != before {
		t.Fatal("source changed", err)
	}
	if err = db.QueryRow(`SELECT count(*) FROM search_fts WHERE body LIKE '%needle%'`).Scan(&n); err != nil || n != 1 {
		t.Fatal(n, err)
	}
	if _, err = db.Exec(`INSERT INTO search_fts(search_fts,rank) VALUES('integrity-check',1)`); err != nil {
		t.Fatal(err)
	}
}
