package page

import (
	"context"
	"database/sql"
	"errors"
	"noteapp/internal/apperr"
	"noteapp/internal/platform/clock"
	"noteapp/internal/platform/id"
	"noteapp/internal/project"
	"strings"
)

type Page struct {
	ID        string  `json:"id"`
	ProjectID string  `json:"project_id"`
	ParentID  *string `json:"parent_id"`
	Title     string  `json:"title"`
	Body      string  `json:"body"`
	Position  int64   `json:"position"`
	CreatedAt int64   `json:"created_at"`
	UpdatedAt int64   `json:"updated_at"`
	Version   int64   `json:"version"`
}
type Input struct {
	Title    *string `json:"title"`
	Body     *string `json:"body"`
	ParentID *string `json:"parent_id"`
	Version  int64   `json:"version"`
}
type MoveInput struct {
	ParentID *string `json:"parent_id"`
	Position int64   `json:"position"`
	Version  int64   `json:"version"`
}
type Service struct{ db *sql.DB }

func New(db *sql.DB) *Service { return &Service{db} }

const columns = "id,project_id,parent_id,title,body,position,created_at,updated_at,version"

type scanner interface{ Scan(...any) error }

func scan(row scanner) (Page, error) {
	var t Page
	err := row.Scan(&t.ID, &t.ProjectID, &t.ParentID, &t.Title, &t.Body, &t.Position, &t.CreatedAt, &t.UpdatedAt, &t.Version)
	if errors.Is(err, sql.ErrNoRows) {
		err = apperr.NotFound
	}
	return t, err
}

type querier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func read(ctx context.Context, q querier, tid string) (Page, error) {
	return scan(q.QueryRowContext(ctx, "SELECT "+columns+" FROM pages WHERE id=? AND deleted_at IS NULL", tid))
}
func (s *Service) Get(ctx context.Context, tid string) (Page, error) { return read(ctx, s.db, tid) }
func (s *Service) List(ctx context.Context, pid string) ([]Page, error) {
	if _, err := project.Read(ctx, s.db, pid); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, "SELECT "+columns+" FROM pages WHERE project_id=? AND deleted_at IS NULL ORDER BY position,id", pid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Page{}
	for rows.Next() {
		t, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
func apply(t *Page, in Input) error {
	if in.Title != nil {
		t.Title = strings.TrimSpace(*in.Title)
	}
	if t.Title == "" {
		return apperr.Invalid("页面标题不能为空")
	}
	if in.Body != nil {
		t.Body = *in.Body
	}

	return nil
}
func parentOK(ctx context.Context, tx *sql.Tx, t Page, parentID *string) error {
	if parentID == nil {
		return nil
	}
	p, err := read(ctx, tx, *parentID)
	if errors.Is(err, apperr.NotFound) {
		return apperr.Conflict("父页面不存在")
	}
	if err != nil {
		return err
	}
	if p.ProjectID != t.ProjectID {
		return apperr.Conflict("父页面必须在同一项目")
	}
	seen := map[string]bool{t.ID: true}
	for {
		if seen[p.ID] {
			return apperr.Conflict("页面不能形成循环")
		}
		seen[p.ID] = true
		if p.ParentID == nil {
			break
		}
		p, err = read(ctx, tx, *p.ParentID)
		if err != nil {
			return err
		}
	}

	return nil
}
func (s *Service) Create(ctx context.Context, pid string, in Input) (Page, error) {
	t := Page{ProjectID: pid, ParentID: in.ParentID, CreatedAt: clock.Now(), UpdatedAt: clock.Now(), Version: 1}
	if err := apply(&t, in); err != nil {
		return t, err
	}
	var err error
	t.ID, err = id.New()
	if err != nil {
		return t, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return t, err
	}
	defer tx.Rollback()
	if err = project.Writable(ctx, tx, pid); err != nil {
		return t, err
	}
	if err = parentOK(ctx, tx, t, t.ParentID); err != nil {
		return t, err
	}
	if err = tx.QueryRowContext(ctx, "SELECT COALESCE(MAX(position),-1)+1 FROM pages WHERE project_id=? AND parent_id IS ? AND deleted_at IS NULL", pid, t.ParentID).Scan(&t.Position); err != nil {
		return t, err
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO pages("+columns+") VALUES(?,?,?,?,?,?,?,?,?)", t.ID, t.ProjectID, t.ParentID, t.Title, t.Body, t.Position, t.CreatedAt, t.UpdatedAt, t.Version)
	if err != nil {
		return t, err
	}
	return t, tx.Commit()
}
func (s *Service) Update(ctx context.Context, tid string, in Input) (Page, error) {
	var t Page
	if in.Version < 1 {
		return t, apperr.Invalid("version 必填")
	}
	if in.ParentID != nil {
		return t, apperr.Invalid("请使用移动接口调整父级")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return t, err
	}
	defer tx.Rollback()
	t, err = read(ctx, tx, tid)
	if err != nil {
		return t, err
	}
	if err = project.Writable(ctx, tx, t.ProjectID); err != nil {
		return t, err
	}
	if t.Version != in.Version {
		return t, apperr.Conflict("内容已更新，请重新加载；本地草稿已保留")
	}
	if err = apply(&t, in); err != nil {
		return t, err
	}
	t.UpdatedAt = clock.Now()
	res, err := tx.ExecContext(ctx, "UPDATE pages SET title=?,body=?,updated_at=?,version=version+1 WHERE id=? AND version=?", t.Title, t.Body, t.UpdatedAt, t.ID, in.Version)
	if err != nil {
		return t, err
	}
	if err = changed(res); err != nil {
		return t, err
	}
	t.Version++
	return t, tx.Commit()
}
func changed(res sql.Result) error {
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n != 1 {
		return apperr.Conflict("内容已更新，请重新加载")
	}
	return nil
}
func (s *Service) Move(ctx context.Context, tid string, in MoveInput) (Page, error) {
	var t Page
	if in.Version < 1 || in.Position < 0 {
		return t, apperr.Invalid("version 必填且 position 不能为负")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return t, err
	}
	defer tx.Rollback()
	t, err = read(ctx, tx, tid)
	if err != nil {
		return t, err
	}
	if err = project.Writable(ctx, tx, t.ProjectID); err != nil {
		return t, err
	}
	if t.Version != in.Version {
		return t, apperr.Conflict("内容已更新，请重新加载")
	}
	if err = parentOK(ctx, tx, t, in.ParentID); err != nil {
		return t, err
	}
	rows, err := tx.QueryContext(ctx, "SELECT id FROM pages WHERE project_id=? AND parent_id IS ? AND id<>? AND deleted_at IS NULL ORDER BY position,id", t.ProjectID, in.ParentID, tid)
	if err != nil {
		return t, err
	}
	ids := []string{}
	for rows.Next() {
		var i string
		if err = rows.Scan(&i); err != nil {
			rows.Close()
			return t, err
		}
		ids = append(ids, i)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return t, err
	}
	pos := int(in.Position)
	if pos > len(ids) {
		pos = len(ids)
	}
	ids = append(ids, "")
	copy(ids[pos+1:], ids[pos:])
	ids[pos] = tid
	now := clock.Now()
	for i, key := range ids {
		if key == tid {
			continue
		}
		if _, err = tx.ExecContext(ctx, "UPDATE pages SET position=?,updated_at=?,version=version+1 WHERE id=? AND position<>?", i, now, key, i); err != nil {
			return t, err
		}
	}
	res, err := tx.ExecContext(ctx, "UPDATE pages SET parent_id=?,position=?,updated_at=?,version=version+1 WHERE id=? AND version=?", in.ParentID, pos, now, tid, in.Version)
	if err != nil {
		return t, err
	}
	if err = changed(res); err != nil {
		return t, err
	}

	if (t.ParentID == nil) != (in.ParentID == nil) || (t.ParentID != nil && in.ParentID != nil && *t.ParentID != *in.ParentID) {
		oldRows, e := tx.QueryContext(ctx, "SELECT id FROM pages WHERE project_id=? AND parent_id IS ? AND deleted_at IS NULL ORDER BY position,id", t.ProjectID, t.ParentID)
		if e != nil {
			return t, e
		}
		oldIDs := []string{}
		for oldRows.Next() {
			var key string
			if e = oldRows.Scan(&key); e != nil {
				oldRows.Close()
				return t, e
			}
			oldIDs = append(oldIDs, key)
		}
		e = oldRows.Err()
		oldRows.Close()
		if e != nil {
			return t, e
		}
		for i, key := range oldIDs {
			if _, e = tx.ExecContext(ctx, "UPDATE pages SET position=?,updated_at=?,version=version+1 WHERE id=? AND position<>?", i, now, key, i); e != nil {
				return t, e
			}
		}
	}
	t.ParentID = in.ParentID
	t.Position = int64(pos)
	t.UpdatedAt = now
	t.Version++
	return t, tx.Commit()
}
