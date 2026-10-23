package relation

import (
	"context"
	"database/sql"
	"errors"
	"noteapp/internal/platform/httpx"
	"noteapp/internal/project"
	"time"
)

type Service struct{ db *sql.DB }

func New(db *sql.DB) *Service { return &Service{db} }

type spec struct{ kind, table, left, right, lc, rc string }

var specs = []spec{{"task-page", "task_pages", "tasks", "pages", "task_id", "page_id"}, {"task-event", "task_events", "tasks", "events", "task_id", "event_id"}, {"page-event", "page_events", "pages", "events", "page_id", "event_id"}}

type Item struct {
	Kind    string `json:"kind"`
	LeftID  string `json:"left_id"`
	RightID string `json:"right_id"`
	Type    string `json:"type"`
	ID      string `json:"id"`
	Title   string `json:"title"`
	Stage   string `json:"stage,omitempty"`
	Path    string `json:"path,omitempty"`
	StartAt string `json:"start_at,omitempty"`
	EndAt   string `json:"end_at,omitempty"`
	Deleted bool   `json:"deleted"`
}

func endpoint(ctx context.Context, tx *sql.Tx, table, key string) (string, error) {
	var p string
	var deleted *int64
	e := tx.QueryRowContext(ctx, "SELECT project_id,deleted_at FROM "+table+" WHERE id=?", key).Scan(&p, &deleted)
	if errors.Is(e, sql.ErrNoRows) || deleted != nil {
		return "", httpx.Conflict("关联端点不存在或已删除")
	}
	return p, e
}
func (s *Service) Change(ctx context.Context, kind, left, right string, add bool) error {
	var sp *spec
	for i := range specs {
		if specs[i].kind == kind {
			sp = &specs[i]
		}
	}
	if sp == nil {
		return httpx.Invalid("无效关联类型")
	}
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	p, e := endpoint(ctx, tx, sp.left, left)
	if e != nil {
		return e
	}
	q, e := endpoint(ctx, tx, sp.right, right)
	if e != nil {
		return e
	}
	if p != q {
		return httpx.Conflict("只能关联同项目对象")
	}
	if e = project.Writable(ctx, tx, p); e != nil {
		return e
	}
	if add {
		_, e = tx.ExecContext(ctx, "INSERT INTO "+sp.table+"(project_id,"+sp.lc+","+sp.rc+") VALUES(?,?,?) ON CONFLICT DO NOTHING", p, left, right)
	} else {
		_, e = tx.ExecContext(ctx, "DELETE FROM "+sp.table+" WHERE "+sp.lc+"=? AND "+sp.rc+"=?", left, right)
	}
	if e != nil {
		return e
	}
	return tx.Commit()
}
func (s *Service) List(ctx context.Context, typ, key string) ([]Item, error) {
	if typ != "tasks" && typ != "pages" && typ != "events" {
		return nil, httpx.Invalid("无效对象类型")
	}
	var pid string
	e := s.db.QueryRowContext(ctx, "SELECT project_id FROM "+typ+" WHERE id=? AND deleted_at IS NULL", key).Scan(&pid)
	if errors.Is(e, sql.ErrNoRows) {
		return nil, httpx.NotFound
	}
	if e != nil {
		return nil, e
	}
	if _, e = project.Read(ctx, s.db, pid); e != nil {
		return nil, e
	}
	out := []Item{}
	for _, sp := range specs {
		target, sourceCol, targetCol := sp.right, sp.lc, sp.rc
		if typ == sp.right {
			target, sourceCol, targetCol = sp.left, sp.rc, sp.lc
		} else if typ != sp.left {
			continue
		}
		extra := "'',0,0"
		if target == "tasks" {
			extra = "o.stage,0,0"
		}
		if target == "events" {
			extra = "'',o.start_at,o.end_at"
		}
		rows, e := s.db.QueryContext(ctx, "SELECT r."+sp.lc+",r."+sp.rc+",o.id,o.title,o.deleted_at,"+extra+" FROM "+sp.table+" r JOIN "+target+" o ON o.id=r."+targetCol+" WHERE r."+sourceCol+"=? ORDER BY o.title,o.id", key)
		if e != nil {
			return nil, e
		}
		for rows.Next() {
			v := Item{Kind: sp.kind, Type: target}
			var deleted *int64
			var a, b int64
			if e = rows.Scan(&v.LeftID, &v.RightID, &v.ID, &v.Title, &deleted, &v.Stage, &a, &b); e != nil {
				rows.Close()
				return nil, e
			}
			v.Deleted = deleted != nil
			if target == "events" {
				v.StartAt = time.UnixMilli(a).UTC().Format(time.RFC3339Nano)
				v.EndAt = time.UnixMilli(b).UTC().Format(time.RFC3339Nano)
			}
			out = append(out, v)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return nil, e
		}
	}
	return out, nil
}

// Candidates is deliberately separate from the bounded calendar interval API:
// relation targets can be scheduled at any time in the same project.
func (s *Service) Candidates(ctx context.Context, pid string) ([]Item, error) {
	if _, e := project.Read(ctx, s.db, pid); e != nil {
		return nil, e
	}
	out := []Item{}
	for _, typ := range []string{"tasks", "pages", "events"} {
		extra := "'',NULL,0,0"
		if typ == "tasks" {
			extra = "stage,NULL,0,0"
		}
		if typ == "pages" {
			extra = "'',parent_id,0,0"
		}
		if typ == "events" {
			extra = "'',NULL,start_at,end_at"
		}
		rows, e := s.db.QueryContext(ctx, "SELECT id,title,"+extra+" FROM "+typ+" WHERE project_id=? AND deleted_at IS NULL ORDER BY title,id", pid)
		if e != nil {
			return nil, e
		}
		parents := map[string]string{}
		titles := map[string]string{}
		start := len(out)
		for rows.Next() {
			v := Item{Type: typ}
			var parent *string
			var a, b int64
			if e = rows.Scan(&v.ID, &v.Title, &v.Stage, &parent, &a, &b); e != nil {
				rows.Close()
				return nil, e
			}
			titles[v.ID] = v.Title
			if parent != nil {
				parents[v.ID] = *parent
			}
			if typ == "events" {
				v.StartAt = time.UnixMilli(a).UTC().Format(time.RFC3339Nano)
				v.EndAt = time.UnixMilli(b).UTC().Format(time.RFC3339Nano)
			}
			out = append(out, v)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return nil, e
		}
		if typ == "pages" {
			for i := start; i < len(out); i++ {
				path := out[i].Title
				key := out[i].ID
				seen := map[string]bool{key: true}
				for parents[key] != "" {
					key = parents[key]
					if seen[key] {
						break
					}
					seen[key] = true
					path = titles[key] + " / " + path
				}
				out[i].Path = path
			}
		}
	}
	return out, nil
}
