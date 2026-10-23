package relation

import (
	"context"
	"noteapp/internal/event"
	"noteapp/internal/page"
	"noteapp/internal/platform/database"
	"noteapp/internal/project"
	"noteapp/internal/task"
	"path/filepath"
	"testing"
)

func TestRelations(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	title := "x"
	p, _ := project.New(db).Create(ctx, project.Input{Title: &title})
	other, _ := project.New(db).Create(ctx, project.Input{Title: &title})
	ta, _ := task.New(db).Create(ctx, p.ID, task.Input{Title: &title})
	pg, _ := page.New(db).Create(ctx, p.ID, page.Input{Title: &title})
	outside, _ := page.New(db).Create(ctx, other.ID, page.Input{Title: &title})
	start, end := "2026-10-24T09:00:00+08:00", "2026-10-24T10:00:00+08:00"
	ev, e := event.New(db).Create(ctx, p.ID, event.Input{Title: &title, StartAt: &start, EndAt: &end})
	if e != nil {
		t.Fatal(e)
	}
	s := New(db)
	otherEvent, err := event.New(db).Create(ctx, other.ID, event.Input{Title: &title, StartAt: &start, EndAt: &end})
	if err != nil {
		t.Fatal(err)
	}
	for _, bad := range []struct{ kind, table, col, left, right string }{
		{"task-page", "task_pages", "page_id", ta.ID, outside.ID},
		{"task-event", "task_events", "event_id", ta.ID, otherEvent.ID},
		{"page-event", "page_events", "event_id", pg.ID, otherEvent.ID},
	} {
		if err = s.Change(ctx, bad.kind, bad.left, bad.right, true); err == nil {
			t.Fatal("cross project service", bad.kind)
		}
		lc := "task_id"
		if bad.kind == "page-event" {
			lc = "page_id"
		}
		if _, err = db.Exec("INSERT INTO "+bad.table+"(project_id,"+lc+","+bad.col+") VALUES(?,?,?)", p.ID, bad.left, bad.right); err == nil {
			t.Fatal("cross project foreign key", bad.kind)
		}
	}

	for _, r := range []struct{ kind, left, right, lt, rt string }{{"task-page", ta.ID, pg.ID, "tasks", "pages"}, {"task-event", ta.ID, ev.ID, "tasks", "events"}, {"page-event", pg.ID, ev.ID, "pages", "events"}} {
		for i := 0; i < 2; i++ {
			if e = s.Change(ctx, r.kind, r.left, r.right, true); e != nil {
				t.Fatal(e)
			}
		}
		a, e := s.List(ctx, r.lt, r.left)
		if e != nil || len(a) == 0 {
			t.Fatal(a, e)
		}
		b, e := s.List(ctx, r.rt, r.right)
		if e != nil || len(b) == 0 {
			t.Fatal(b, e)
		}
		if e = s.Change(ctx, r.kind, r.left, r.right, false); e != nil {
			t.Fatal(e)
		}
		b, e = s.List(ctx, r.rt, r.right)
		if e != nil || len(b) != 0 {
			t.Fatal(b, e)
		}
	}

	for _, endpoint := range []struct{ table, id string }{{"tasks", ta.ID}, {"pages", pg.ID}, {"events", ev.ID}} {
		if _, e = db.Exec("UPDATE "+endpoint.table+" SET deleted_at=1 WHERE id=?", endpoint.id); e != nil {
			t.Fatal(e)
		}
		for _, r := range []struct{ kind, left, right string }{{"task-page", ta.ID, pg.ID}, {"task-event", ta.ID, ev.ID}, {"page-event", pg.ID, ev.ID}} {
			affected := r.left == endpoint.id || r.right == endpoint.id
			if affected && s.Change(ctx, r.kind, r.left, r.right, true) == nil {
				t.Fatal("deleted endpoint accepted", r.kind, endpoint.table)
			}
		}
		if _, e = db.Exec("UPDATE "+endpoint.table+" SET deleted_at=NULL WHERE id=?", endpoint.id); e != nil {
			t.Fatal(e)
		}
	}
	if e = s.Change(ctx, "task-page", ta.ID, outside.ID, true); e == nil {
		t.Fatal("cross project accepted")
	}
	if _, e = db.Exec("INSERT INTO task_pages(project_id,task_id,page_id) VALUES(?,?,?)", p.ID, ta.ID, outside.ID); e == nil {
		t.Fatal("composite FK missing")
	}
	if _, e = db.Exec("UPDATE pages SET deleted_at=1 WHERE id=?", pg.ID); e != nil {
		t.Fatal(e)
	}
	if e = s.Change(ctx, "task-page", ta.ID, pg.ID, true); e == nil {
		t.Fatal("deleted endpoint accepted")
	}
	archived := true
	if _, e = project.New(db).Update(ctx, p.ID, project.Input{Version: p.Version, Archived: &archived}); e != nil {
		t.Fatal(e)
	}
	if e = s.Change(ctx, "task-event", ta.ID, ev.ID, true); e == nil {
		t.Fatal("archived relation accepted")
	}
	if _, e = event.New(db).Update(ctx, ev.ID, event.Input{Version: ev.Version, Title: &title}); e == nil {
		t.Fatal("archived event accepted")
	}
}
func TestCandidates(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	title := "parent"
	p, _ := project.New(db).Create(ctx, project.Input{Title: &title})
	pg, _ := page.New(db).Create(ctx, p.ID, page.Input{Title: &title})
	child := "child"
	page.New(db).Create(ctx, p.ID, page.Input{Title: &child, ParentID: &pg.ID})
	v, e := New(db).Candidates(ctx, p.ID)
	if e != nil || len(v) != 2 {
		t.Fatal(v, e)
	}
	found := false
	for _, item := range v {
		if item.Path == "parent / child" {
			found = true
		}
	}
	if !found {
		t.Fatal("missing full path", v)
	}
}
