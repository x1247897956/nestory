package task

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
	"noteapp/internal/taskmeta"
	"strings"
	"time"
)

type Task struct {
	ID           string          `json:"id"`
	ProjectID    string          `json:"project_id"`
	ParentID     *string         `json:"parent_id"`
	Title        string          `json:"title"`
	BodyDocument json.RawMessage `json:"body_document"`
	Stage        string          `json:"stage"`
	Priority     string          `json:"priority"`
	DueDate      *string         `json:"due_date"`
	Position     int64           `json:"position"`
	CreatedAt    int64           `json:"created_at"`
	UpdatedAt    int64           `json:"updated_at"`
	Version      int64           `json:"version"`
}
type Input struct {
	RequestID    *string         `json:"request_id,omitempty"`
	Title        *string         `json:"title"`
	BodyDocument json.RawMessage `json:"body_document"`
	Stage        *string         `json:"stage"`
	Priority     *string         `json:"priority"`
	DueDate      *string         `json:"due_date"`
	ParentID     *string         `json:"parent_id"`
	Version      int64           `json:"version"`
}
type MoveInput struct {
	ParentID *string `json:"parent_id"`
	Position int64   `json:"position"`
	Version  int64   `json:"version"`
}
type Service struct{ db *sql.DB }

func New(db *sql.DB) *Service { return &Service{db} }

const columns = "id,project_id,parent_id,title,stage,priority,due_date,position,created_at,updated_at,version,body_document"

type scanner interface{ Scan(...any) error }

func scan(row scanner) (Task, error) {
	var t Task
	var raw []byte
	err := row.Scan(&t.ID, &t.ProjectID, &t.ParentID, &t.Title, &t.Stage, &t.Priority, &t.DueDate, &t.Position, &t.CreatedAt, &t.UpdatedAt, &t.Version, &raw)
	t.BodyDocument = json.RawMessage(raw)
	if errors.Is(err, sql.ErrNoRows) {
		err = apperr.NotFound
	}
	return t, err
}

type querier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func read(ctx context.Context, q querier, tid string) (Task, error) {
	return scan(q.QueryRowContext(ctx, "SELECT "+columns+" FROM tasks WHERE id=? AND deleted_at IS NULL", tid))
}
func (s *Service) Get(ctx context.Context, tid string) (Task, error) { return read(ctx, s.db, tid) }
func (s *Service) List(ctx context.Context, pid string) ([]Task, error) {
	if _, err := project.Read(ctx, s.db, pid); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, "SELECT "+columns+" FROM tasks WHERE project_id=? AND deleted_at IS NULL ORDER BY position,id", pid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Task{}
	for rows.Next() {
		t, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
func apply(t *Task, in Input) error {
	if in.Title != nil {
		t.Title = strings.TrimSpace(*in.Title)
	}
	if t.Title == "" {
		return apperr.Invalid("任务标题不能为空")
	}
	if err := document.Apply(&t.BodyDocument, in.BodyDocument); err != nil {
		return err
	}
	if in.Stage != nil {
		t.Stage = *in.Stage
	}
	if !taskmeta.ValidStage(t.Stage) {
		return apperr.Invalid("无效任务阶段")
	}
	if in.Priority != nil {
		t.Priority = *in.Priority
	}
	if !taskmeta.ValidPriority(t.Priority) {
		return apperr.Invalid("无效优先级")
	}
	if in.DueDate != nil {
		if *in.DueDate == "" {
			t.DueDate = nil
		} else {
			if _, err := time.Parse("2006-01-02", *in.DueDate); err != nil {
				return apperr.Invalid("截止日期必须为 YYYY-MM-DD")
			}
			t.DueDate = in.DueDate
		}
	}
	return nil
}
func parentOK(ctx context.Context, tx *sql.Tx, t Task, parentID *string) error {
	if parentID == nil {
		return nil
	}
	p, err := read(ctx, tx, *parentID)
	if errors.Is(err, apperr.NotFound) {
		return apperr.Conflict("父任务不存在")
	}
	if err != nil {
		return err
	}
	if p.ID == t.ID || p.ProjectID != t.ProjectID || p.ParentID != nil {
		return apperr.Conflict("父任务必须为同项目的顶层任务")
	}
	var n int
	if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM tasks WHERE parent_id=? AND deleted_at IS NULL", t.ID).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return apperr.Conflict("含子任务的任务不能降为子任务")
	}
	return nil
}
func (s *Service) Create(ctx context.Context, pid string, in Input) (Task, error) {
	key := ""
	if in.RequestID != nil {
		key = *in.RequestID
	}
	in.RequestID = nil
	return idempotency.Create(ctx, s.db, key, "task"+":"+pid, in, func(tx *sql.Tx) (Task, error) { return s.create(ctx, tx, pid, in) })
}
func (s *Service) create(ctx context.Context, tx *sql.Tx, pid string, in Input) (Task, error) {
	t := Task{ProjectID: pid, ParentID: in.ParentID, Stage: taskmeta.DefaultStage, Priority: taskmeta.DefaultPriority, CreatedAt: clock.Now(), UpdatedAt: clock.Now(), Version: 1}
	if err := apply(&t, in); err != nil {
		return t, err
	}
	var err error
	t.ID, err = id.New()
	if err != nil {
		return t, err
	}
	if err = project.Writable(ctx, tx, pid); err != nil {
		return t, err
	}
	if err = parentOK(ctx, tx, t, t.ParentID); err != nil {
		return t, err
	}
	if err = tx.QueryRowContext(ctx, "SELECT COALESCE(MAX(position),-1)+1 FROM tasks WHERE project_id=? AND parent_id IS ? AND deleted_at IS NULL", pid, t.ParentID).Scan(&t.Position); err != nil {
		return t, err
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO tasks("+columns+") VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", t.ID, t.ProjectID, t.ParentID, t.Title, t.Stage, t.Priority, t.DueDate, t.Position, t.CreatedAt, t.UpdatedAt, t.Version, t.BodyDocument)
	if err != nil {
		return t, err
	}
	return t, nil
}
func (s *Service) Update(ctx context.Context, tid string, in Input) (Task, error) {
	var t Task
	if in.RequestID != nil {
		return t, apperr.Invalid("request_id 仅支持创建请求")
	}
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
	res, err := tx.ExecContext(ctx, "UPDATE tasks SET title=?,body_document=?,stage=?,priority=?,due_date=?,updated_at=?,version=version+1 WHERE id=? AND version=?", t.Title, t.BodyDocument, t.Stage, t.Priority, t.DueDate, t.UpdatedAt, t.ID, in.Version)
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
func (s *Service) Move(ctx context.Context, tid string, in MoveInput) (Task, error) {
	var t Task
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
	rows, err := tx.QueryContext(ctx, "SELECT id FROM tasks WHERE project_id=? AND parent_id IS ? AND id<>? AND deleted_at IS NULL ORDER BY position,id", t.ProjectID, in.ParentID, tid)
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
		if _, err = tx.ExecContext(ctx, "UPDATE tasks SET position=?,updated_at=?,version=version+1 WHERE id=? AND position<>?", i, now, key, i); err != nil {
			return t, err
		}
	}
	res, err := tx.ExecContext(ctx, "UPDATE tasks SET parent_id=?,position=?,updated_at=?,version=version+1 WHERE id=? AND version=?", in.ParentID, pos, now, tid, in.Version)
	if err != nil {
		return t, err
	}
	if err = changed(res); err != nil {
		return t, err
	}
	t.ParentID = in.ParentID
	t.Position = int64(pos)
	t.UpdatedAt = now
	t.Version++
	return t, tx.Commit()
}
