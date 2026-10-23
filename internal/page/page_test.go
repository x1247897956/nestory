package page

import (
	"context"
	"fmt"
	"noteapp/internal/platform/database"
	"noteapp/internal/project"
	"path/filepath"
	"testing"
)

func TestTree(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	title := "project"
	p, e := project.New(db).Create(ctx, project.Input{Title: &title})
	if e != nil {
		t.Fatal(e)
	}
	s := New(db)
	a, e := s.Create(ctx, p.ID, Input{Title: &title})
	if e != nil {
		t.Fatal(e)
	}
	b, e := s.Create(ctx, p.ID, Input{Title: &title, ParentID: &a.ID})
	if e != nil {
		t.Fatal(e)
	}
	c, e := s.Create(ctx, p.ID, Input{Title: &title, ParentID: &b.ID})
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Move(ctx, a.ID, MoveInput{ParentID: &c.ID, Version: 1}); e == nil {
		t.Fatal("cycle accepted")
	}
	if _, e = s.Move(ctx, a.ID, MoveInput{ParentID: &a.ID, Version: 1}); e == nil {
		t.Fatal("self accepted")
	}
	p2, _ := project.New(db).Create(ctx, project.Input{Title: &title})
	x, _ := s.Create(ctx, p2.ID, Input{Title: &title})
	if _, e = s.Move(ctx, b.ID, MoveInput{ParentID: &x.ID, Version: 1}); e == nil {
		t.Fatal("cross project accepted")
	}
	if _, e = s.Move(ctx, c.ID, MoveInput{Version: 1, Position: 0}); e != nil {
		t.Fatal(e)
	}
	nodes, e := s.List(ctx, p.ID)
	if e != nil || len(nodes) != 3 {
		t.Fatal(nodes, e)
	}
}

func TestOrderingAndDeepTree(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	title := "p"
	p, _ := project.New(db).Create(ctx, project.Input{Title: &title})
	s := New(db)
	a, _ := s.Create(ctx, p.ID, Input{Title: &title})
	b, _ := s.Create(ctx, p.ID, Input{Title: &title})
	c, _ := s.Create(ctx, p.ID, Input{Title: &title})
	_, e = s.Move(ctx, a.ID, MoveInput{ParentID: &b.ID, Position: 0, Version: a.Version})
	if e != nil {
		t.Fatal(e)
	}
	nodes, _ := s.List(ctx, p.ID)
	for _, n := range nodes {
		if n.ID == b.ID && n.Position != 0 {
			t.Fatalf("source siblings not compacted: %v", nodes)
		}
		if n.ID == c.ID && n.Position != 1 {
			t.Fatal("source order")
		}
	}
	tx, _ := db.BeginTx(ctx, nil)
	parent := b.ID
	for i := 0; i < 2000; i++ {
		key := fmt.Sprintf("deep-%04d", i)
		_, e = tx.ExecContext(ctx, "INSERT INTO pages(id,project_id,parent_id,title,created_at,updated_at) VALUES(?,?,?,?,0,0)", key, p.ID, parent, "deep")
		if e != nil {
			t.Fatal(e)
		}
		parent = key
	}
	if e = tx.Commit(); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Move(ctx, b.ID, MoveInput{ParentID: &parent, Version: 2}); e == nil {
		t.Fatal("deep cycle accepted")
	}
}
