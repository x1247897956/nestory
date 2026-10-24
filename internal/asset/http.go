package asset

import (
	"database/sql"
	"errors"
	"mime"
	"net/http"
	"noteapp/internal/platform/httpx"
	"os"
	"path/filepath"
)

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
