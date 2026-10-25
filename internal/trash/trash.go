package trash

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"noteapp/internal/apperr"
	"noteapp/internal/platform/clock"
	"noteapp/internal/platform/id"
	"noteapp/internal/project"
	"sort"
)

type Service struct{ db *sql.DB }

func New(db *sql.DB) *Service { return &Service{db} }

type Preview struct {
	Fingerprint string   `json:"fingerprint"`
	Members     []Member `json:"members,omitempty"`
	Version     int64    `json:"version"`
	Count       int      `json:"count"`
}
type Member struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}
type Batch struct {
	Archived  bool     `json:"archived"`
	Members   []Member `json:"members"`
	ID        string   `json:"id"`
	Type      string   `json:"type"`
	ObjectID  string   `json:"object_id"`
	ProjectID string   `json:"project_id"`
	Title     string   `json:"title"`
	Count     int      `json:"count"`
	DeletedAt int64    `json:"deleted_at"`
}

func valid(typ string) bool {
	return typ == "projects" || typ == "tasks" || typ == "pages" || typ == "events"
}

type query interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func preview(ctx context.Context, q query, typ, key string) (Preview, string, string, error) {
	var v Preview
	var pid, title string
	if !valid(typ) {
		return v, pid, title, apperr.Invalid("无效对象类型")
	}
	projectColumn := "project_id"
	if typ == "projects" {
		projectColumn = "id"
	}
	e := q.QueryRowContext(ctx, "SELECT version,"+projectColumn+",title FROM "+typ+" WHERE id=? AND deleted_at IS NULL", key).Scan(&v.Version, &pid, &title)
	if errors.Is(e, sql.ErrNoRows) {
		e = apperr.NotFound
	}
	if e != nil {
		return v, pid, title, e
	}
	if typ == "projects" {
		v.Members = []Member{{ID: key, Title: title}}
		for _, table := range []string{"tasks", "pages", "events"} {
			rows, err := q.QueryContext(ctx, "SELECT id,title FROM "+table+" WHERE project_id=? AND deleted_at IS NULL ORDER BY id", key)
			if err != nil {
				return v, pid, title, err
			}
			for rows.Next() {
				var m Member
				if err = rows.Scan(&m.ID, &m.Title); err != nil {
					rows.Close()
					return v, pid, title, err
				}
				v.Members = append(v.Members, m)
			}
			err = rows.Err()
			rows.Close()
			if err != nil {
				return v, pid, title, err
			}
		}
		v.Count = len(v.Members)
		v.Fingerprint, e = fingerprint(ctx, q, typ, v.Members)
		return v, pid, title, e
	}
	if typ == "events" {
		v.Count = 1
	} else {
		e = q.QueryRowContext(ctx, "WITH RECURSIVE tree(id) AS (SELECT id FROM "+typ+" WHERE id=? UNION ALL SELECT o.id FROM "+typ+" o JOIN tree ON o.parent_id=tree.id) SELECT count(*) FROM "+typ+" WHERE id IN (SELECT id FROM tree) AND deleted_at IS NULL", key).Scan(&v.Count)
	}
	if e != nil {
		return v, pid, title, e
	}
	scope := "id=?"
	if typ != "events" {
		scope = "id IN (WITH RECURSIVE tree(id) AS (SELECT id FROM " + typ + " WHERE id=? UNION ALL SELECT o.id FROM " + typ + " o JOIN tree ON o.parent_id=tree.id) SELECT id FROM tree)"
	}
	rows, e := q.QueryContext(ctx, "SELECT id,title FROM "+typ+" WHERE "+scope+" AND deleted_at IS NULL ORDER BY id", key)
	if e != nil {
		return v, pid, title, e
	}
	defer rows.Close()
	for rows.Next() {
		var m Member
		if e = rows.Scan(&m.ID, &m.Title); e != nil {
			return v, pid, title, e
		}
		v.Members = append(v.Members, m)
	}
	if e = rows.Err(); e != nil {
		return v, pid, title, e
	}
	rows.Close()
	v.Fingerprint, e = fingerprint(ctx, q, typ, v.Members)
	return v, pid, title, e
}
func (s *Service) Preview(ctx context.Context, typ, key string) (Preview, error) {
	v, _, _, e := preview(ctx, s.db, typ, key)
	return v, e
}
func (s *Service) Delete(ctx context.Context, typ, key string, in Preview) (string, error) {
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return "", e
	}
	defer tx.Rollback()
	v, pid, title, e := preview(ctx, tx, typ, key)
	if e != nil {
		return "", e
	}
	if e = project.Writable(ctx, tx, pid); e != nil {
		return "", e
	}
	if v.Version != in.Version || v.Count != in.Count || in.Fingerprint == "" || v.Fingerprint != in.Fingerprint {
		return "", apperr.Conflict("内容或删除数量已变化，请重新预览并确认")
	}
	batch, e := id.New()
	if e != nil {
		return "", e
	}
	now := clock.Now()
	_, e = tx.ExecContext(ctx, `INSERT INTO delete_batches(id,object_type,object_id,project_id,title,member_count,deleted_at) VALUES(?,?,?,?,?,?,?)`, batch, typ, key, pid, title, v.Count, now)
	if e != nil {
		return "", e
	}
	if typ == "projects" {
		for _, table := range []string{"tasks", "pages", "events"} {
			if _, e = tx.ExecContext(ctx, "UPDATE "+table+" SET deleted_at=?,delete_batch_id=?,updated_at=?,version=version+1 WHERE project_id=? AND deleted_at IS NULL", now, batch, now, key); e != nil {
				return "", e
			}
		}
		if _, e = tx.ExecContext(ctx, "UPDATE projects SET deleted_at=?,delete_batch_id=?,updated_at=?,version=version+1 WHERE id=?", now, batch, now, key); e != nil {
			return "", e
		}
		return batch, tx.Commit()
	}
	scope := "id=?"
	if typ != "events" {
		scope = "id IN (WITH RECURSIVE tree(id) AS (SELECT id FROM " + typ + " WHERE id=? UNION ALL SELECT o.id FROM " + typ + " o JOIN tree ON o.parent_id=tree.id) SELECT id FROM tree)"
	}
	_, e = tx.ExecContext(ctx, "UPDATE "+typ+" SET deleted_at=?,delete_batch_id=?,updated_at=?,version=version+1 WHERE "+scope+" AND deleted_at IS NULL", now, batch, now, key)
	if e != nil {
		return "", e
	}
	return batch, tx.Commit()
}
func (s *Service) List(ctx context.Context) ([]Batch, error) {
	rows, e := s.db.QueryContext(ctx, `SELECT b.id,b.object_type,b.object_id,b.project_id,b.title,b.member_count,b.deleted_at,p.archived_at IS NOT NULL FROM delete_batches b JOIN projects p ON p.id=b.project_id WHERE b.restored_at IS NULL ORDER BY b.deleted_at DESC,b.id`)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Batch{}
	for rows.Next() {
		var b Batch
		if e = rows.Scan(&b.ID, &b.Type, &b.ObjectID, &b.ProjectID, &b.Title, &b.Count, &b.DeletedAt, &b.Archived); e != nil {
			return nil, e
		}
		out = append(out, b)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return nil, e
	}
	for i := range out {
		memberQuery := "SELECT id,title FROM " + out[i].Type + " WHERE delete_batch_id=? ORDER BY id"
		args := []any{out[i].ID}
		if out[i].Type == "projects" {
			memberQuery = "SELECT id,title FROM projects WHERE delete_batch_id=? UNION ALL SELECT id,title FROM tasks WHERE delete_batch_id=? UNION ALL SELECT id,title FROM pages WHERE delete_batch_id=? UNION ALL SELECT id,title FROM events WHERE delete_batch_id=?"
			args = []any{out[i].ID, out[i].ID, out[i].ID, out[i].ID}
		}
		members, e := s.db.QueryContext(ctx, memberQuery, args...)
		if e != nil {
			return nil, e
		}
		out[i].Members = []Member{}
		for members.Next() {
			var m Member
			if e = members.Scan(&m.ID, &m.Title); e != nil {
				members.Close()
				return nil, e
			}
			out[i].Members = append(out[i].Members, m)
		}
		e = members.Err()
		members.Close()
		if e != nil {
			return nil, e
		}
	}
	return out, nil
}
func (s *Service) Restore(ctx context.Context, batch string) error {
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	var typ, pid string
	e = tx.QueryRowContext(ctx, `SELECT object_type,project_id FROM delete_batches WHERE id=? AND restored_at IS NULL`, batch).Scan(&typ, &pid)
	if errors.Is(e, sql.ErrNoRows) {
		return apperr.NotFound
	}
	if e != nil {
		return e
	}
	if typ == "projects" {
		for _, table := range []string{"projects", "tasks", "pages", "events"} {
			if _, e = tx.ExecContext(ctx, "UPDATE "+table+" SET deleted_at=NULL,delete_batch_id=NULL,updated_at=?,version=version+1 WHERE delete_batch_id=?", clock.Now(), batch); e != nil {
				return e
			}
		}
		if _, e = tx.ExecContext(ctx, "UPDATE delete_batches SET restored_at=? WHERE id=?", clock.Now(), batch); e != nil {
			return e
		}
		return tx.Commit()
	}
	var projectDeleted *int64
	if e = tx.QueryRowContext(ctx, "SELECT deleted_at FROM projects WHERE id=?", pid).Scan(&projectDeleted); e != nil {
		return e
	}
	if projectDeleted != nil {
		return apperr.Conflict("请先恢复所属项目")
	}
	if e = project.Writable(ctx, tx, pid); e != nil {
		return e
	}
	if typ != "events" {
		var required sql.NullString
		e = tx.QueryRowContext(ctx, "WITH RECURSIVE ancestors(id,parent_id,deleted_at,delete_batch_id) AS (SELECT p.id,p.parent_id,p.deleted_at,p.delete_batch_id FROM "+typ+" o JOIN "+typ+" p ON p.id=o.parent_id WHERE o.delete_batch_id=? UNION SELECT p.id,p.parent_id,p.deleted_at,p.delete_batch_id FROM "+typ+" p JOIN ancestors a ON p.id=a.parent_id) SELECT group_concat(DISTINCT delete_batch_id) FROM ancestors WHERE deleted_at IS NOT NULL AND delete_batch_id<>?", batch, batch).Scan(&required)
		if e != nil {
			return e
		}
		if required.Valid {
			return apperr.Conflict("请先恢复仍在回收站的父对象，所需批次：" + required.String)
		}
	}

	if typ == "tasks" {
		var n int
		e = tx.QueryRowContext(ctx, `SELECT count(*) FROM tasks t JOIN tasks p ON p.id=t.parent_id WHERE t.delete_batch_id=? AND p.parent_id IS NOT NULL`, batch).Scan(&n)
		if e != nil {
			return e
		}
		if n > 0 {
			return apperr.Conflict("恢复会产生多层子任务，请先将父任务移回顶层")
		}
	}
	_, e = tx.ExecContext(ctx, "UPDATE "+typ+" SET deleted_at=NULL,delete_batch_id=NULL,updated_at=?,version=version+1 WHERE delete_batch_id=?", clock.Now(), batch)
	if e != nil {
		return e
	}
	_, e = tx.ExecContext(ctx, `UPDATE delete_batches SET restored_at=? WHERE id=?`, clock.Now(), batch)
	if e != nil {
		return e
	}
	return tx.Commit()
}

// fingerprint includes every member's native type, identity and version.
func fingerprint(ctx context.Context, q query, typ string, members []Member) (string, error) {
	entries := []string{}
	tables := []string{typ}
	if typ == "projects" {
		tables = []string{"projects", "tasks", "pages", "events"}
	}
	for _, m := range members {
		for _, table := range tables {
			var version int64
			err := q.QueryRowContext(ctx, "SELECT version FROM "+table+" WHERE id=? AND deleted_at IS NULL", m.ID).Scan(&version)
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			if err != nil {
				return "", err
			}
			raw, _ := json.Marshal([]any{table, m.ID, version})
			entries = append(entries, string(raw))
			if table == "projects" {
				var definitions string
				if err = q.QueryRowContext(ctx, `SELECT coalesce(json_group_array(json_array(id,version)),'[]') FROM (SELECT id,version FROM custom_property_definitions WHERE project_id=? ORDER BY id)`, m.ID).Scan(&definitions); err != nil {
					return "", err
				}
				entries = append(entries, "definitions:"+m.ID+":"+definitions)
			}
			if table != "projects" {
				var properties string
				err = q.QueryRowContext(ctx, `SELECT coalesce(json_group_array(json_array(id,version,value_version)),'[]') FROM
              (SELECT d.id,d.version,coalesce(v.version,0) value_version FROM custom_property_definitions d
               LEFT JOIN custom_property_values v ON v.definition_id=d.id AND v.object_id=?
               WHERE d.object_type=? AND d.project_id=(SELECT project_id FROM `+table+` WHERE id=?) ORDER BY d.id)`, m.ID, table, m.ID).Scan(&properties)
				if err != nil {
					return "", err
				}
				entries = append(entries, table+":"+m.ID+":"+properties)
			}
		}
	}
	sort.Strings(entries)
	raw, _ := json.Marshal(entries)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:]), nil
}
