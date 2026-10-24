package idempotency_test

import (
	"context"
	"errors"
	"noteapp/internal/apperr"
	"noteapp/internal/event"
	"noteapp/internal/page"
	"noteapp/internal/platform/database"
	"noteapp/internal/project"
	"noteapp/internal/task"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
)

func TestDurableNativeCreation(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "db")
	db, e := database.Open(ctx, path)
	if e != nil {
		t.Fatal(e)
	}
	title, key := "original", "project-request"
	p, e := project.New(db).Create(ctx, project.Input{Title: &title, RequestID: &key})
	if e != nil {
		t.Fatal(e)
	}
	db.Close()
	db, e = database.Open(ctx, path)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	if _, e = db.Exec("UPDATE projects SET title='later', version=2 WHERE id=?", p.ID); e != nil {
		t.Fatal(e)
	}
	replay, e := project.New(db).Create(ctx, project.Input{Title: &title, RequestID: &key})
	if e != nil || !reflect.DeepEqual(p, replay) {
		t.Fatalf("lost original result: %#v %v", replay, e)
	}
	other := "different"
	if _, e = project.New(db).Create(ctx, project.Input{Title: &other, RequestID: &key}); e == nil {
		t.Fatal("payload reuse accepted")
	} else {
		var ae *apperr.Error
		if !errors.As(e, &ae) || ae.Code != "conflict" {
			t.Fatalf("wrong collision error %v", e)
		}
	}
	// Scope collisions are global, including project destinations and object types.
	if _, e = task.New(db).Create(ctx, p.ID, task.Input{Title: &title, RequestID: &key}); e == nil {
		t.Fatal("scope reuse accepted")
	}
	start, end := "2026-10-25T10:00:00Z", "2026-10-25T11:00:00Z"
	creates := []struct {
		name   string
		create func(string) (any, error)
	}{
		{"page", func(k string) (any, error) {
			return page.New(db).Create(ctx, p.ID, page.Input{Title: &title, RequestID: &k})
		}},
		{"task", func(k string) (any, error) {
			return task.New(db).Create(ctx, p.ID, task.Input{Title: &title, RequestID: &k})
		}},
		{"event", func(k string) (any, error) {
			return event.New(db).Create(ctx, p.ID, event.Input{Title: &title, StartAt: &start, EndAt: &end, RequestID: &k})
		}},
	}
	for _, c := range creates {
		t.Run(c.name, func(t *testing.T) {
			a, e := c.create(c.name)
			if e != nil {
				t.Fatal(e)
			}
			b, e := c.create(c.name)
			if e != nil || !reflect.DeepEqual(a, b) {
				t.Fatalf("replay mismatch %v", e)
			}
		})
	}
	rollbackKey := "rollback"
	if _, e = task.New(db).Create(ctx, "missing", task.Input{Title: &title, RequestID: &rollbackKey}); e == nil {
		t.Fatal("invalid parent accepted")
	}
	var n int
	db.QueryRow("SELECT count(*) FROM creation_requests WHERE request_id=?", rollbackKey).Scan(&n)
	if n != 0 {
		t.Fatal("rollback claimed key")
	}
	if _, e = task.New(db).Create(ctx, p.ID, task.Input{Title: &title, RequestID: &rollbackKey}); e != nil {
		t.Fatal(e)
	}
	long := strings.Repeat("x", 129)
	if _, e = project.New(db).Create(ctx, project.Input{Title: &title, RequestID: &long}); e == nil {
		t.Fatal("long key accepted")
	}
	// Concurrent retries through the production single-connection pool serialize.
	var wg sync.WaitGroup
	results := make(chan project.Project, 8)
	errs := make(chan error, 8)
	key = "concurrent"
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			v, e := project.New(db).Create(ctx, project.Input{Title: &title, RequestID: &key})
			results <- v
			errs <- e
		}()
	}
	wg.Wait()
	close(results)
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	var first string
	for v := range results {
		if first == "" {
			first = v.ID
		}
		if first != v.ID {
			t.Fatal("duplicate concurrent create")
		}
	}
}

func TestFailedResultPersistenceRollsBackObjectAndKey(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	if _, e = db.Exec(`CREATE TRIGGER reject_result BEFORE INSERT ON creation_requests BEGIN SELECT RAISE(ABORT,'injected result failure'); END`); e != nil {
		t.Fatal(e)
	}
	title, key := "test", "retry"
	if _, e = project.New(db).Create(ctx, project.Input{Title: &title, RequestID: &key}); e == nil {
		t.Fatal("injection did not fail")
	}
	for _, table := range []string{"projects", "creation_requests"} {
		var n int
		if e = db.QueryRow("SELECT count(*) FROM " + table).Scan(&n); e != nil || n != 0 {
			t.Fatalf("partial %s: %d %v", table, n, e)
		}
	}
	if _, e = db.Exec("DROP TRIGGER reject_result"); e != nil {
		t.Fatal(e)
	}
	p, e := project.New(db).Create(ctx, project.Input{Title: &title, RequestID: &key})
	if e != nil {
		t.Fatal(e)
	}
	empty := ""
	if _, e = project.New(db).Update(ctx, p.ID, project.Input{Title: &title, Version: 1, RequestID: &empty}); e == nil {
		t.Fatal("update accepted request_id")
	}
	a, e := project.New(db).Create(ctx, project.Input{Title: &title})
	if e != nil {
		t.Fatal(e)
	}
	b, e := project.New(db).Create(ctx, project.Input{Title: &title})
	if e != nil || a.ID == b.ID {
		t.Fatal("legacy creates conflated")
	}
}
