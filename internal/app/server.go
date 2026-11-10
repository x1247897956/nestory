package app

import (
	"database/sql"
	"io/fs"
	"log/slog"
	"net/http"
	"strings"

	"noteapp/internal/platform/config"
	"noteapp/internal/platform/httpx"
	"noteapp/internal/taskmeta"
	"noteapp/web"
)

func registerStatus(mux *http.ServeMux, db *sql.DB, c config.Config) {
	mux.HandleFunc("GET /api/v1/healthz", func(w http.ResponseWriter, r *http.Request) { httpx.JSON(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("GET /api/v1/readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := db.PingContext(r.Context()); err != nil {
			httpx.JSON(w, 503, map[string]any{"error": map[string]string{"code": "unavailable", "message": "数据库不可用"}})
			return
		}
		httpx.JSON(w, 200, map[string]string{"status": "ready"})
	})
	mux.HandleFunc("GET /api/v1/config", func(w http.ResponseWriter, r *http.Request) {
		httpx.JSON(w, 200, map[string]any{"timezone": c.Timezone, "stages": taskmeta.Stages(), "priorities": taskmeta.Priorities()})
	})
}

func registerFrontend(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/", func(w http.ResponseWriter, r *http.Request) { httpx.Fail(w, httpx.NotFound) })
	files, _ := fs.Sub(web.Files, "dist")
	static := http.FileServer(http.FS(files))
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if _, err := fs.Stat(files, strings.TrimPrefix(r.URL.Path, "/")); err != nil {
			if strings.HasPrefix(r.URL.Path, "/assets/") {
				http.NotFound(w, r)
				return
			}
			r.URL.Path = "/"
		}
		static.ServeHTTP(w, r)
	})
}

func protectRequests(next http.Handler, c config.Config) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				slog.Error("panic", "value", v)
				httpx.Fail(w, &httpx.Error{Status: 500, Code: "internal", Message: "服务器内部错误"})
			}
		}()
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		if !allowedRequestHost(r.Host, c.AllowedHosts) {
			httpx.Fail(w, &httpx.Error{Status: 403, Code: "forbidden", Message: "不允许的请求主机"})
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			origin := r.Header.Get("Origin")
			if origin != "" {
				if !allowedOrigin(origin, r, c.DevOrigin) {
					httpx.Fail(w, &httpx.Error{Status: 403, Code: "forbidden", Message: "不允许的请求来源"})
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}
