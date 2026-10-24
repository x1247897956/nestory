package asset

import (
	"context"
	"database/sql"
	"io"
	"net/http"
	"noteapp/internal/apperr"
	"noteapp/internal/platform/clock"
	"noteapp/internal/platform/id"
	"noteapp/internal/project"
	"os"
	"path/filepath"
	"strings"
)

type Asset struct {
	ID        string `json:"id"`
	ProjectID string `json:"project_id"`
	Name      string `json:"name"`
	Key       string `json:"-"`
	MediaType string `json:"media_type"`
	Size      int64  `json:"size"`
	CreatedAt int64  `json:"created_at"`
	URL       string `json:"url"`
}
type Service struct {
	db    *sql.DB
	dir   string
	limit int64
}

func New(db *sql.DB, dir string, limit int64) *Service {
	if limit <= 0 {
		limit = 20 << 20
	}
	return &Service{db, filepath.Join(dir, "assets"), limit}
}
func (s *Service) Upload(ctx context.Context, pid, name string, r io.Reader) (a Asset, err error) {
	if name == "" || strings.ContainsAny(name, "/\\\x00") || name == "." || name == ".." {
		return a, apperr.Invalid("文件名不安全")
	}
	// Reject invalid projects before consuming the stream, without holding a transaction.
	p, err := project.Read(ctx, s.db, pid)
	if err != nil {
		return a, err
	}
	if p.ArchivedAt != nil {
		return a, apperr.Conflict("项目已归档，请先取消归档")
	}
	if err = os.MkdirAll(s.dir, 0700); err != nil {
		return a, err
	}
	f, err := os.CreateTemp(s.dir, "upload-")
	if err != nil {
		return a, err
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	defer f.Close()
	n, err := io.Copy(f, io.LimitReader(r, s.limit+1))
	if err != nil {
		return a, err
	}
	if n > s.limit {
		return a, apperr.TooLarge("附件超过上传大小限制")
	}
	if _, err = f.Seek(0, 0); err != nil {
		return a, err
	}
	head := make([]byte, 512)
	k, _ := f.Read(head)
	kind := http.DetectContentType(head[:k])
	key, err := id.New()
	if err != nil {
		return a, err
	}
	a = Asset{ID: key, ProjectID: pid, Name: name, Key: key, MediaType: kind, Size: n, CreatedAt: clock.Now(), URL: "/api/v1/assets/" + key}
	if err = f.Close(); err != nil {
		return a, err
	}
	// The client stream and file inspection are finished. Recheck writability in
	// the short metadata transaction: a project may have been archived meanwhile.
	if err = ctx.Err(); err != nil {
		return a, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return a, err
	}
	defer tx.Rollback()
	if err = project.Writable(ctx, tx, pid); err != nil {
		return a, err
	}
	dest := filepath.Join(s.dir, key)
	if err = os.Rename(tmp, dest); err != nil {
		return a, err
	}
	defer func() {
		if err != nil {
			os.Remove(dest)
		}
	}()
	_, err = tx.ExecContext(ctx, "INSERT INTO assets VALUES(?,?,?,?,?,?,?)", a.ID, pid, name, key, kind, n, a.CreatedAt)
	if err != nil {
		return a, err
	}
	err = tx.Commit()
	return a, err
}
