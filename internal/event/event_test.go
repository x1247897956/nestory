package event

import (
	"context"
	"noteapp/internal/platform/database"
	"noteapp/internal/project"
	"path/filepath"
	"testing"
	"time"
)

func TestIntervals(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	title := "讨论方案"
	p, _ := project.New(db).Create(ctx, project.Input{Title: &title})
	s := New(db)
	start := "2026-10-24T23:00:00+08:00"
	end := "2026-10-25T01:00:00+08:00"
	for _, bad := range []string{start, "2026-10-24T22:00:00+08:00", "2026-10-25T01:00:00"} {
		if _, e = s.Create(ctx, p.ID, Input{Title: &title, StartAt: &start, EndAt: &bad}); e == nil {
			t.Fatal("invalid interval accepted", bad)
		}
	}
	a, e := s.Create(ctx, p.ID, Input{Title: &title, StartAt: &start, EndAt: &end})
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Create(ctx, p.ID, Input{Title: &title, StartAt: &start, EndAt: &end}); e != nil {
		t.Fatal("overlap rejected", e)
	}
	for _, q := range []struct {
		from, to string
		n        int
	}{{"2026-10-25T00:00:00+08:00", end, 2}, {end, "2026-10-26T00:00:00+08:00", 0}, {"2026-10-24T00:00:00+08:00", start, 0}} {
		v, e := s.List(ctx, p.ID, q.from, q.to)
		if e != nil || len(v) != q.n {
			t.Fatal(v, e, q)
		}
	}
	from, _ := time.Parse(time.RFC3339, start)
	limit := from.Add(366 * 24 * time.Hour).Format(time.RFC3339)
	if _, e = s.List(ctx, p.ID, start, limit); e != nil {
		t.Fatal(e)
	}
	if _, e = s.List(ctx, p.ID, start, from.Add(366*24*time.Hour+time.Second).Format(time.RFC3339)); e == nil {
		t.Fatal("range unbounded")
	}
	if _, e = s.Update(ctx, a.ID, Input{Version: 2, Title: &title}); e == nil {
		t.Fatal("stale accepted")
	}
	if _, e = db.Exec("INSERT INTO events(id,project_id,title,start_at,end_at,created_at,updated_at) VALUES('bad',?,'bad',2,1,0,0)", p.ID); e == nil {
		t.Fatal("database interval constraint missing")
	}
}
