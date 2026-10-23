package trash

import (
	"context"
	"noteapp/internal/platform/database"
	"noteapp/internal/task"
	"path/filepath"
	"testing"
)

func TestBatchIsolation(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "test.db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	for _, q := range []string{`INSERT INTO projects(id,title,created_at,updated_at) VALUES('p','P',1,1)`, `INSERT INTO pages(id,project_id,title,created_at,updated_at) VALUES('a','p','A',1,1)`, `INSERT INTO pages(id,project_id,parent_id,title,created_at,updated_at) VALUES('c','p','a','C',1,1)`} {
		if _, e = db.Exec(q); e != nil {
			t.Fatal(e)
		}
	}
	s := New(db)
	pc, e := s.Preview(ctx, "pages", "c")
	if e != nil {
		t.Fatal(e)
	}
	bc, e := s.Delete(ctx, "pages", "c", pc)
	if e != nil {
		t.Fatal(e)
	}
	pa, _ := s.Preview(ctx, "pages", "a")
	ba, e := s.Delete(ctx, "pages", "a", pa)
	if e != nil {
		t.Fatal(e)
	}
	if s.Restore(ctx, bc) == nil {
		t.Fatal("deleted ancestor must block restore")
	}
	if e = s.Restore(ctx, ba); e != nil {
		t.Fatal(e)
	}
	var batch string
	if e = db.QueryRow(`SELECT delete_batch_id FROM pages WHERE id='c'`).Scan(&batch); e != nil || batch != bc {
		t.Fatalf("prior deletion changed %s %v", batch, e)
	}
	if e = s.Restore(ctx, bc); e != nil {
		t.Fatal(e)
	}
}

func TestPreviewChangesArchiveAndRelations(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "test.db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	exec := func(q string) {
		t.Helper()
		if _, e := db.Exec(q); e != nil {
			t.Fatal(e)
		}
	}
	exec(`INSERT INTO projects(id,title,created_at,updated_at) VALUES('p','P',1,1)`)
	exec(`INSERT INTO tasks(id,project_id,title,created_at,updated_at) VALUES('a','p','A',1,1)`)
	exec(`INSERT INTO pages(id,project_id,title,created_at,updated_at) VALUES('page','p','Page',1,1)`)
	exec(`INSERT INTO task_pages VALUES('p','a','page')`)
	s := New(db)
	old, _ := s.Preview(ctx, "tasks", "a")
	exec(`INSERT INTO tasks(id,project_id,parent_id,title,created_at,updated_at) VALUES('c','p','a','C',1,1)`)
	if _, e = s.Delete(ctx, "tasks", "a", old); e == nil {
		t.Fatal("changed count accepted")
	}
	fresh, _ := s.Preview(ctx, "tasks", "a")
	exec(`UPDATE tasks SET version=version+1 WHERE id='a'`)
	if _, e = s.Delete(ctx, "tasks", "a", fresh); e == nil {
		t.Fatal("changed version accepted")
	}
	fresh, _ = s.Preview(ctx, "tasks", "a")
	batch, e := s.Delete(ctx, "tasks", "a", fresh)
	if e != nil {
		t.Fatal(e)
	}
	var n int
	db.QueryRow(`SELECT count(*) FROM task_pages`).Scan(&n)
	if n != 1 {
		t.Fatal("relation lost")
	}
	exec(`UPDATE projects SET archived_at=1 WHERE id='p'`)
	if s.Restore(ctx, batch) == nil {
		t.Fatal("archive restore accepted")
	}
	pv, _ := s.Preview(ctx, "pages", "page")
	if _, e = s.Delete(ctx, "pages", "page", pv); e == nil {
		t.Fatal("archive delete accepted")
	}
	exec(`UPDATE projects SET archived_at=NULL WHERE id='p'`)
	if e = s.Restore(ctx, batch); e != nil {
		t.Fatal(e)
	}
	db.QueryRow(`SELECT count(*) FROM tasks WHERE deleted_at IS NULL`).Scan(&n)
	if n != 2 {
		t.Fatal("missing batch members")
	}
}

func TestEventBatchAndMembers(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "test.db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	for _, q := range []string{`INSERT INTO projects(id,title,created_at,updated_at) VALUES('p','P',1,1)`, `INSERT INTO events(id,project_id,title,start_at,end_at,created_at,updated_at) VALUES('e','p','Event',1,2,1,1)`} {
		if _, e = db.Exec(q); e != nil {
			t.Fatal(e)
		}
	}
	s := New(db)
	p, e := s.Preview(ctx, "events", "e")
	if e != nil {
		t.Fatal(e)
	}
	batch, e := s.Delete(ctx, "events", "e", p)
	if e != nil {
		t.Fatal(e)
	}
	list, e := s.List(ctx)
	if e != nil || len(list) != 1 || len(list[0].Members) != 1 || list[0].Members[0].ID != "e" {
		t.Fatal(list, e)
	}
	if e = s.Restore(ctx, batch); e != nil {
		t.Fatal(e)
	}
	list, e = s.List(ctx)
	if e != nil || len(list) != 0 {
		t.Fatal(list, e)
	}
}

func TestRestoreCannotCreateThirdTaskLevel(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "test.db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	for _, q := range []string{`INSERT INTO projects(id,title,created_at,updated_at) VALUES('p','P',1,1)`, `INSERT INTO tasks(id,project_id,title,created_at,updated_at) VALUES('a','p','A',1,1),('b','p','B',1,1)`, `INSERT INTO tasks(id,project_id,parent_id,title,created_at,updated_at) VALUES('c','p','a','C',1,1)`} {
		if _, e = db.Exec(q); e != nil {
			t.Fatal(e)
		}
	}
	s := New(db)
	pv, _ := s.Preview(ctx, "tasks", "c")
	batch, e := s.Delete(ctx, "tasks", "c", pv)
	if e != nil {
		t.Fatal(e)
	}
	b := "b"
	if _, e = task.New(db).Move(ctx, "a", task.MoveInput{ParentID: &b, Version: 1, Position: 0}); e != nil {
		t.Fatal(e)
	}
	if s.Restore(ctx, batch) == nil {
		t.Fatal("restore created third task level")
	}
}
