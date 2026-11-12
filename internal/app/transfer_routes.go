package app

import (
	"database/sql"
	"io"
	"net/http"
	"os"
	"time"

	"noteapp/internal/apperr"
	"noteapp/internal/platform/config"
	"noteapp/internal/platform/httpx"
	"noteapp/internal/transfer"
)

func registerTransfer(mux *http.ServeMux, db *sql.DB, c config.Config) {
	service := transfer.New(db, c.DataDir)
	mux.HandleFunc("GET /api/v1/transfer/export", func(w http.ResponseWriter, r *http.Request) {
		controller := http.NewResponseController(w)
		_ = controller.SetWriteDeadline(time.Now().Add(5 * time.Minute))
		path, err := service.Export(r.Context())
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		defer os.Remove(path)
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Disposition", `attachment; filename="nestory-workspace-`+time.Now().UTC().Format("2006-01-02")+`.zip"`)
		http.ServeFile(w, r, path)
	})
	mux.HandleFunc("POST /api/v1/transfer/import", func(w http.ResponseWriter, r *http.Request) {
		controller := http.NewResponseController(w)
		_ = controller.SetReadDeadline(time.Now().Add(5 * time.Minute))
		_ = controller.SetWriteDeadline(time.Now().Add(5 * time.Minute))
		file, err := os.CreateTemp("", "nestory-upload-*.zip")
		if err != nil {
			httpx.Fail(w, err)
			return
		}
		defer os.Remove(file.Name())
		defer file.Close()
		size, err := io.Copy(file, io.LimitReader(r.Body, transfer.MaxArchiveBytes+1))
		if err != nil {
			httpx.Fail(w, apperr.Invalid("读取备份失败，请重新选择文件"))
			return
		}
		if size > transfer.MaxArchiveBytes {
			httpx.Fail(w, apperr.TooLarge("备份文件不能超过 512 MiB"))
			return
		}
		if err = service.Import(r.Context(), file, size); err != nil {
			httpx.Fail(w, err)
			return
		}
		httpx.JSON(w, 200, map[string]bool{"ok": true})
	})
}
