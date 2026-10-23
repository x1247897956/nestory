package workspace

import (
	"context"
	"noteapp/internal/platform/database"
	"path/filepath"
	"testing"
	"time"
)

func TestTodayAndLiteralSearch(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "test.db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	db.Exec(`INSERT INTO projects(id,title,created_at,updated_at) VALUES('p','P',1,1)`)
	db.Exec(`INSERT INTO tasks(id,project_id,title,due_date,created_at,updated_at) VALUES('a','p','中文%_','2026-10-23',1,1),('b','p','other','2026-10-22',1,1)`)
	s := New(db, "Asia/Shanghai", func() time.Time { return time.Date(2026, 10, 23, 0, 0, 0, 0, time.UTC) })
	v, e := s.Today(ctx)
	if e != nil || len(v.Today) != 1 || len(v.Overdue) != 1 {
		t.Fatalf("%+v %v", v, e)
	}
	for _, q := range []string{"中文", "%", "_"} {
		r, e := s.Search(ctx, q, false, 20, 0)
		if e != nil || len(r.Items) != 1 {
			t.Fatalf("literal %s: %+v %v", q, r, e)
		}
	}
	r, e := s.Search(ctx, "", false, 20, 0)
	if e != nil || len(r.Items) != 0 {
		t.Fatalf("empty %+v %v", r, e)
	}
}

func TestCalendarBoundariesAndRecent(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "test.db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	exec := func(q string, args ...any) {
		t.Helper()
		if _, e := db.Exec(q, args...); e != nil {
			t.Fatal(e)
		}
	}
	exec(`INSERT INTO projects(id,title,created_at,updated_at) VALUES('p','P',1,1),('arch','Archived',1,1)`)
	exec(`UPDATE projects SET archived_at=1 WHERE id='arch'`)
	exec(`INSERT INTO tasks(id,project_id,title,stage,due_date,created_at,updated_at) VALUES('parent','p','Finished','done','2026-10-23',1,1),('cancel','p','Cancelled','cancelled','2026-10-22',1,1),('future','p','Future','todo','2026-10-24',1,1),('archived','arch','Hidden','todo','2026-10-23',1,1)`)
	exec(`INSERT INTO tasks(id,project_id,parent_id,title,due_date,created_at,updated_at) VALUES('child','p','parent','Child','2026-10-23',1,1)`)
	parse := func(v string) int64 {
		n, e := time.Parse(time.RFC3339, v)
		if e != nil {
			t.Fatal(e)
		}
		return n.UnixMilli()
	}
	for _, v := range []struct{ id, p, a, b string }{{"cross", "p", "2026-10-22T23:00:00+08:00", "2026-10-23T01:00:00+08:00"}, {"ends", "p", "2026-10-22T23:00:00+08:00", "2026-10-23T00:00:00+08:00"}, {"starts", "p", "2026-10-24T00:00:00+08:00", "2026-10-24T01:00:00+08:00"}, {"hidden", "arch", "2026-10-23T00:00:00+08:00", "2026-10-24T01:00:00+08:00"}} {
		exec(`INSERT INTO events(id,project_id,title,start_at,end_at,created_at,updated_at) VALUES(?,?,?,?,?,1,1)`, v.id, v.p, v.id, parse(v.a), parse(v.b))
	}
	s := New(db, "Asia/Shanghai", func() time.Time { return time.UnixMilli(parse("2026-10-23T23:00:00+08:00")) })
	today, e := s.Today(ctx)
	if e != nil || len(today.Today) != 1 || today.Today[0].ParentTitle != "Finished" || len(today.Events) != 1 || today.Events[0].ID != "cross" {
		t.Fatalf("%+v %v", today, e)
	}
	exec(`INSERT INTO pages(id,project_id,title,created_at,updated_at) VALUES('root','p','Root',1,1),('gone','p','Gone',1,1)`)
	exec(`INSERT INTO pages(id,project_id,parent_id,title,body,created_at,updated_at) VALUES('leaf','p','root','Leaf','needle',1,1)`)
	r, e := s.Search(ctx, "needle", false, 1, 0)
	if e != nil || r.Total != 1 || r.Items[0].Path != "Root / Leaf" {
		t.Fatalf("%+v %v", r, e)
	}
	r, e = s.Search(ctx, "Hidden", false, 20, 0)
	if e != nil || r.Total != 0 {
		t.Fatal(r, e)
	}
	r, e = s.Search(ctx, "Hidden", true, 20, 0)
	if e != nil || r.Total != 2 {
		t.Fatal(r, e)
	}
	for _, v := range []struct{ typ, id string }{{"project", "p"}, {"project", "arch"}, {"page", "gone"}} {
		if e = s.Visit(ctx, v.typ, v.id); e != nil {
			t.Fatal(e)
		}
	}
	exec(`UPDATE pages SET deleted_at=1 WHERE id='gone'`)
	recent, e := s.Recent(ctx, false)
	if e != nil || len(recent) != 1 || recent[0].ID != "p" {
		t.Fatalf("%+v %v", recent, e)
	}
	recent, e = s.Recent(ctx, true)
	if e != nil || len(recent) != 2 {
		t.Fatal(recent, e)
	}
}

func TestDSTAndPagination(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "test.db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	exec := func(q string, args ...any) {
		t.Helper()
		if _, e := db.Exec(q, args...); e != nil {
			t.Fatal(e)
		}
	}
	exec(`INSERT INTO projects(id,title,created_at,updated_at) VALUES('p','P',1,1)`)
	for _, v := range []struct{ id, title string }{{"a", "match\\literal"}, {"b", "match"}, {"c", "match"}} {
		exec(`INSERT INTO tasks(id,project_id,title,created_at,updated_at) VALUES(?,'p',?,1,1)`, v.id, v.title)
	}
	s := New(db, "America/New_York", func() time.Time { return time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC) })
	end, e := time.Parse(time.RFC3339, "2026-11-02T00:00:00-05:00")
	if e != nil {
		t.Fatal(e)
	}
	exec(`INSERT INTO events(id,project_id,title,start_at,end_at,created_at,updated_at) VALUES('last','p','25th hour',?,?,1,1)`, end.Add(-30*time.Minute).UnixMilli(), end.UnixMilli())
	today, e := s.Today(ctx)
	if e != nil || len(today.Events) != 1 {
		t.Fatalf("DST 25-hour day: %+v %v", today, e)
	}
	one, e := s.Search(ctx, "match", false, 2, 0)
	if e != nil {
		t.Fatal(e)
	}
	two, e := s.Search(ctx, "match", false, 2, 2)
	if e != nil || one.Total != 3 || two.Total != 3 || len(one.Items) != 2 || len(two.Items) != 1 || one.Items[1].ID == two.Items[0].ID {
		t.Fatalf("pagination %+v %+v %v", one, two, e)
	}
	literal, e := s.Search(ctx, `\`, false, 20, 0)
	if e != nil || literal.Total != 1 {
		t.Fatal(literal, e)
	}
}
