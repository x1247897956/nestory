package objectquery

import (
	"context"
	"errors"
	"noteapp/internal/apperr"
	"noteapp/internal/object"
	"noteapp/internal/relation"
	"testing"
)

func TestQueryPreservesRulesAndPropagatesFailures(t *testing.T) {
	ctx := context.Background()
	calls := 0
	missing := false
	s := New(map[object.Type]Reader{object.Task: func(context.Context, string) (object.Object, error) {
		if missing {
			return object.Object{}, apperr.NotFound
		}
		return object.Object{ID: "t", Type: object.Task, ProjectID: "p", Properties: map[string]any{"stage": "todo"}}, nil
	}}, func(_ context.Context, pid string) (bool, error) {
		calls++
		if pid != "p" {
			t.Fatal(pid)
		}
		return true, nil
	}, func(_ context.Context, typ, id string) ([]relation.Item, error) {
		if typ != "tasks" || id != "t" {
			t.Fatal(typ, id)
		}
		return []relation.Item{{ID: "n", Type: "pages"}}, nil
	})
	v, err := s.Get(ctx, object.Task, "t")
	if err != nil || !v.ReadOnly || v.Properties["stage"] != "todo" || len(v.Properties["relations"].([]relation.Item)) != 1 {
		t.Fatal(v, err)
	}
	missing = true
	if _, err = s.Get(ctx, object.Task, "t"); !errors.Is(err, apperr.NotFound) {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatal("queried project for a missing object")
	}
	if _, err = s.Get(ctx, object.Type("unknown"), "t"); err == nil {
		t.Fatal("unknown type accepted")
	}
}
