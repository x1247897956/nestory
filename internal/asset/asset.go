package asset

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"mime"
	"net/http"
	"noteapp/internal/platform/clock"
	"noteapp/internal/platform/httpx"
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
		return a, httpx.Invalid("文件名不安全")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return a, err
	}
	defer tx.Rollback()
	if err = project.Writable(ctx, tx, pid); err != nil {
		return a, err
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
		return a, &httpx.Error{Status: 413, Code: "too_large", Message: "附件超过上传大小限制"}
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
func (s *Service) Download(w http.ResponseWriter, r *http.Request) {
	var a Asset
	err := s.db.QueryRowContext(r.Context(), "SELECT id,original_name,storage_key,media_type FROM assets WHERE id=?", r.PathValue("id")).Scan(&a.ID, &a.Name, &a.Key, &a.MediaType)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Fail(w, httpx.NotFound)
		return
	}
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	f, err := os.Open(filepath.Join(s.dir, a.Key))
	if err != nil {
		httpx.Fail(w, httpx.NotFound)
		return
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	inline := a.MediaType == "image/png" || a.MediaType == "image/jpeg" || a.MediaType == "image/gif" || a.MediaType == "image/webp"
	disposition := "attachment"
	if inline && r.URL.Query().Get("download") == "" {
		disposition = "inline"
	}
	w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": a.Name}))
	w.Header().Set("Content-Type", a.MediaType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	http.ServeContent(w, r, a.Name, stat.ModTime(), f)
}
func (s *Service) UploadHTTP(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, s.limit+(1<<20))
	mr, err := r.MultipartReader()
	if err != nil {
		httpx.Fail(w, httpx.Invalid("需要 multipart 文件"))
		return
	}
	part, err := mr.NextPart()
	if err != nil || part.FormName() != "file" {
		httpx.Fail(w, httpx.Invalid("需要 file 文件字段"))
		return
	}
	defer part.Close()
	name := part.Header.Get("Content-Disposition")
	_, params, err := mime.ParseMediaType(name)
	if err != nil {
		httpx.Fail(w, httpx.Invalid("文件名无效"))
		return
	}
	a, err := s.Upload(r.Context(), r.PathValue("id"), params["filename"], part)
	if err != nil {
		var too *http.MaxBytesError
		if errors.As(err, &too) {
			err = &httpx.Error{Status: 413, Code: "too_large", Message: "附件超过上传大小限制"}
		}
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, 201, a)
}
