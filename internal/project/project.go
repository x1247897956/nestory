package project

import (
	"context"
	"database/sql"
	"errors"
	"noteapp/internal/apperr"
	"noteapp/internal/idempotency"
	"noteapp/internal/platform/clock"
	"noteapp/internal/platform/id"
	"strings"
)

type Project struct {
	Pinned      bool   `json:"pinned"`
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	ArchivedAt  *int64 `json:"archived_at"`
	CreatedAt   int64  `json:"created_at"`
	UpdatedAt   int64  `json:"updated_at"`
	Version     int64  `json:"version"`
}
type Input struct {
	RequestID   *string `json:"request_id,omitempty"`
	Pinned      *bool   `json:"pinned"`
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Archived    *bool   `json:"archived"`
	Version     int64   `json:"version"`
}
type Service struct{ db *sql.DB }

func New(db *sql.DB) *Service { return &Service{db} }

type querier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func Read(ctx context.Context, q querier, pid string) (Project, error) {
	var p Project
	err := q.QueryRowContext(ctx, "SELECT id,title,description,archived_at,created_at,updated_at,version,pinned FROM projects WHERE id=? AND deleted_at IS NULL", pid).Scan(&p.ID, &p.Title, &p.Description, &p.ArchivedAt, &p.CreatedAt, &p.UpdatedAt, &p.Version, &p.Pinned)
	if errors.Is(err, sql.ErrNoRows) {
		return p, apperr.NotFound
	}
	return p, err
}
func (s *Service) Get(ctx context.Context, pid string) (Project, error) { return Read(ctx, s.db, pid) }
func (s *Service) List(ctx context.Context, archived bool) ([]Project, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id,title,description,archived_at,created_at,updated_at,version,pinned FROM projects WHERE deleted_at IS NULL AND (archived_at IS NOT NULL)=? ORDER BY pinned DESC,created_at,id", archived)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Project{}
	for rows.Next() {
		var p Project
		if err = rows.Scan(&p.ID, &p.Title, &p.Description, &p.ArchivedAt, &p.CreatedAt, &p.UpdatedAt, &p.Version, &p.Pinned); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
func (s *Service) Create(ctx context.Context, in Input) (Project, error) {
	key := ""
	if in.RequestID != nil {
		key = *in.RequestID
	}
	in.RequestID = nil
	return idempotency.Create(ctx, s.db, key, "project", in, func(tx *sql.Tx) (Project, error) { return s.create(ctx, tx, in) })
}
func (s *Service) create(ctx context.Context, tx *sql.Tx, in Input) (Project, error) {
	var p Project
	if in.Title == nil || strings.TrimSpace(*in.Title) == "" {
		return p, apperr.Invalid("项目名称不能为空")
	}
	pid, err := id.New()
	if err != nil {
		return p, err
	}
	p = Project{ID: pid, Title: strings.TrimSpace(*in.Title), CreatedAt: clock.Now(), UpdatedAt: clock.Now(), Version: 1}
	if in.Description != nil {
		p.Description = *in.Description
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO projects(id,title,description,created_at,updated_at) VALUES(?,?,?,?,?)", p.ID, p.Title, p.Description, p.CreatedAt, p.UpdatedAt)
	return p, err
}
func (s *Service) Update(ctx context.Context, pid string, in Input) (Project, error) {
	var p Project
	if in.RequestID != nil {
		return p, apperr.Invalid("request_id 仅支持创建请求")
	}
	if in.Version < 1 {
		return p, apperr.Invalid("version 必填")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return p, err
	}
	defer tx.Rollback()
	p, err = Read(ctx, tx, pid)
	if err != nil {
		return p, err
	}
	if p.Version != in.Version {
		return p, apperr.Conflict("内容已更新，请重新加载")
	}
	if p.ArchivedAt != nil && (in.Title != nil || in.Description != nil || in.Archived == nil || *in.Archived) {
		return p, apperr.Conflict("项目已归档，请先取消归档")
	}
	if in.Title != nil {
		p.Title = strings.TrimSpace(*in.Title)
		if p.Title == "" {
			return p, apperr.Invalid("项目名称不能为空")
		}
	}
	if in.Description != nil {
		p.Description = *in.Description
	}
	if in.Archived != nil {
		p.ArchivedAt = nil
		if *in.Archived {
			n := clock.Now()
			p.ArchivedAt = &n
		}
	}
	if in.Pinned != nil {
		p.Pinned = *in.Pinned
	}
	p.UpdatedAt = clock.Now()
	res, err := tx.ExecContext(ctx, "UPDATE projects SET title=?,description=?,archived_at=?,updated_at=?,pinned=?,version=version+1 WHERE id=? AND version=?", p.Title, p.Description, p.ArchivedAt, p.UpdatedAt, p.Pinned, p.ID, in.Version)
	if err != nil {
		return p, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return p, err
	}
	if n != 1 {
		return p, apperr.Conflict("内容已更新，请重新加载")
	}
	p.Version++
	return p, tx.Commit()
}
func Writable(ctx context.Context, tx *sql.Tx, pid string) error {
	p, err := Read(ctx, tx, pid)
	if err != nil {
		return err
	}
	if p.ArchivedAt != nil {
		return apperr.Conflict("项目已归档，请先取消归档")
	}
	return nil
}
