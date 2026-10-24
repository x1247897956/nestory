package event

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"noteapp/internal/apperr"
	"noteapp/internal/document"
	"noteapp/internal/idempotency"
	"noteapp/internal/platform/clock"
	"noteapp/internal/platform/id"
	"noteapp/internal/project"
	"strings"
	"time"
)

type Event struct {
	ID           string          `json:"id"`
	ProjectID    string          `json:"project_id"`
	Title        string          `json:"title"`
	BodyDocument json.RawMessage `json:"body_document"`
	StartAt      string          `json:"start_at"`
	EndAt        string          `json:"end_at"`
	CreatedAt    int64           `json:"created_at"`
	UpdatedAt    int64           `json:"updated_at"`
	Version      int64           `json:"version"`
}
type Input struct {
	RequestID    *string         `json:"request_id,omitempty"`
	Title        *string         `json:"title"`
	BodyDocument json.RawMessage `json:"body_document"`
	StartAt      *string         `json:"start_at"`
	EndAt        *string         `json:"end_at"`
	Version      int64           `json:"version"`
}
type Service struct{ db *sql.DB }

func New(db *sql.DB) *Service { return &Service{db} }

const columns = "id,project_id,title,start_at,end_at,created_at,updated_at,version,body_document"

type scanner interface{ Scan(...any) error }

func scan(r scanner) (Event, error) {
	var v Event
	var raw []byte
	var a, b int64
	e := r.Scan(&v.ID, &v.ProjectID, &v.Title, &a, &b, &v.CreatedAt, &v.UpdatedAt, &v.Version, &raw)
	v.BodyDocument = json.RawMessage(raw)
	if errors.Is(e, sql.ErrNoRows) {
		e = apperr.NotFound
	}
	v.StartAt = time.UnixMilli(a).UTC().Format(time.RFC3339Nano)
	v.EndAt = time.UnixMilli(b).UTC().Format(time.RFC3339Nano)
	return v, e
}

type querier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func read(ctx context.Context, q querier, key string) (Event, error) {
	return scan(q.QueryRowContext(ctx, "SELECT "+columns+" FROM events WHERE id=? AND deleted_at IS NULL", key))
}
func (s *Service) Get(ctx context.Context, key string) (Event, error) { return read(ctx, s.db, key) }
func interval(a, b string) (int64, int64, error) {
	x, e := time.Parse(time.RFC3339Nano, a)
	if e != nil {
		return 0, 0, apperr.Invalid("时间必须为带偏移的 RFC3339")
	}
	y, e := time.Parse(time.RFC3339Nano, b)
	if e != nil {
		return 0, 0, apperr.Invalid("时间必须为带偏移的 RFC3339")
	}
	if y.UnixMilli() <= x.UnixMilli() {
		return 0, 0, apperr.Invalid("结束时间必须晚于开始时间")
	}
	return x.UnixMilli(), y.UnixMilli(), nil
}
func (s *Service) List(ctx context.Context, pid, from, to string) ([]Event, error) {
	a, b, e := interval(from, to)
	if e != nil {
		return nil, e
	}
	if b-a > 366*24*60*60*1000 {
		return nil, apperr.Invalid("查询区间不能超过366天")
	}
	if _, e = project.Read(ctx, s.db, pid); e != nil {
		return nil, e
	}
	rows, e := s.db.QueryContext(ctx, "SELECT "+columns+" FROM events WHERE project_id=? AND deleted_at IS NULL AND start_at<? AND end_at>? ORDER BY start_at,id", pid, b, a)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Event{}
	for rows.Next() {
		v, e := scan(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func apply(v *Event, in Input) (int64, int64, error) {
	if in.Title != nil {
		v.Title = strings.TrimSpace(*in.Title)
	}
	if v.Title == "" {
		return 0, 0, apperr.Invalid("日程标题不能为空")
	}
	if err := document.Apply(&v.BodyDocument, in.BodyDocument); err != nil {
		return 0, 0, err
	}
	if in.StartAt != nil {
		v.StartAt = *in.StartAt
	}
	if in.EndAt != nil {
		v.EndAt = *in.EndAt
	}
	return interval(v.StartAt, v.EndAt)
}
func (s *Service) Create(ctx context.Context, pid string, in Input) (Event, error) {
	key := ""
	if in.RequestID != nil {
		key = *in.RequestID
	}
	in.RequestID = nil
	return idempotency.Create(ctx, s.db, key, "event"+":"+pid, in, func(tx *sql.Tx) (Event, error) { return s.create(ctx, tx, pid, in) })
}
func (s *Service) create(ctx context.Context, tx *sql.Tx, pid string, in Input) (Event, error) {
	v := Event{ProjectID: pid, CreatedAt: clock.Now(), UpdatedAt: clock.Now(), Version: 1}
	a, b, e := apply(&v, in)
	if e != nil {
		return v, e
	}
	v.ID, e = id.New()
	if e != nil {
		return v, e
	}
	if e = project.Writable(ctx, tx, pid); e != nil {
		return v, e
	}
	_, e = tx.ExecContext(ctx, "INSERT INTO events("+columns+") VALUES(?,?,?,?,?,?,?,?,?)", v.ID, pid, v.Title, a, b, v.CreatedAt, v.UpdatedAt, v.Version, v.BodyDocument)
	if e != nil {
		return v, e
	}
	v.StartAt = time.UnixMilli(a).UTC().Format(time.RFC3339Nano)
	v.EndAt = time.UnixMilli(b).UTC().Format(time.RFC3339Nano)
	return v, nil
}
func (s *Service) Update(ctx context.Context, key string, in Input) (Event, error) {
	var v Event
	if in.RequestID != nil {
		return v, apperr.Invalid("request_id 仅支持创建请求")
	}
	if in.Version < 1 {
		return v, apperr.Invalid("version 必填")
	}
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return v, e
	}
	defer tx.Rollback()
	v, e = read(ctx, tx, key)
	if e != nil {
		return v, e
	}
	if e = project.Writable(ctx, tx, v.ProjectID); e != nil {
		return v, e
	}
	if v.Version != in.Version {
		return v, apperr.Conflict("内容已更新，请重新加载；本地草稿已保留")
	}
	a, b, e := apply(&v, in)
	if e != nil {
		return v, e
	}
	v.UpdatedAt = clock.Now()
	res, e := tx.ExecContext(ctx, "UPDATE events SET title=?,body_document=?,start_at=?,end_at=?,updated_at=?,version=version+1 WHERE id=? AND version=?", v.Title, v.BodyDocument, a, b, v.UpdatedAt, key, in.Version)
	if e != nil {
		return v, e
	}
	n, e := res.RowsAffected()
	if e != nil {
		return v, e
	}
	if n != 1 {
		return v, apperr.Conflict("内容已更新，请重新加载")
	}
	v.Version++
	v.StartAt = time.UnixMilli(a).UTC().Format(time.RFC3339Nano)
	v.EndAt = time.UnixMilli(b).UTC().Format(time.RFC3339Nano)
	return v, tx.Commit()
}
