package app

import (
	"database/sql"
	"io/fs"
	"log/slog"
	"net/http"
	"net/url"
	"noteapp/internal/asset"
	"noteapp/internal/page"
	"noteapp/internal/platform/config"
	"noteapp/internal/platform/httpx"
	"noteapp/internal/project"
	"noteapp/internal/task"
	"noteapp/web"
	"strings"
)

func New(db *sql.DB, c config.Config) http.Handler {
	mux := http.NewServeMux()
	p := project.New(db)
	t := task.New(db)
	pg := page.New(db)
	assets := asset.New(db, c.DataDir, c.UploadLimit)
	mux.HandleFunc("POST /api/v1/projects/{id}/assets", assets.UploadHTTP)
	mux.HandleFunc("GET /api/v1/assets/{id}", assets.Download)
	mux.HandleFunc("GET /api/v1/healthz", func(w http.ResponseWriter, r *http.Request) { httpx.JSON(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("GET /api/v1/readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := db.PingContext(r.Context()); err != nil {
			httpx.JSON(w, 503, map[string]any{"error": map[string]string{"code": "unavailable", "message": "数据库不可用"}})
			return
		}
		httpx.JSON(w, 200, map[string]string{"status": "ready"})
	})
	mux.HandleFunc("GET /api/v1/config", func(w http.ResponseWriter, r *http.Request) {
		httpx.JSON(w, 200, map[string]any{"timezone": c.Timezone, "stages": task.Stages})
	})
	mux.HandleFunc("GET /api/v1/projects", func(w http.ResponseWriter, r *http.Request) {
		a := r.URL.Query().Get("archived")
		if a != "" && a != "true" && a != "false" {
			httpx.Fail(w, httpx.Invalid("archived 必须为 true 或 false"))
			return
		}
		v, err := p.List(r.Context(), a == "true")
		respond(w, 200, v, err)
	})
	mux.HandleFunc("POST /api/v1/projects", func(w http.ResponseWriter, r *http.Request) {
		var in project.Input
		if err := httpx.Decode(w, r, &in); err != nil {
			httpx.Fail(w, err)
			return
		}
		v, err := p.Create(r.Context(), in)
		respond(w, 201, v, err)
	})
	mux.HandleFunc("GET /api/v1/projects/{id}", func(w http.ResponseWriter, r *http.Request) {
		v, err := p.Get(r.Context(), r.PathValue("id"))
		respond(w, 200, v, err)
	})
	mux.HandleFunc("PATCH /api/v1/projects/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in project.Input
		if err := httpx.Decode(w, r, &in); err != nil {
			httpx.Fail(w, err)
			return
		}
		v, err := p.Update(r.Context(), r.PathValue("id"), in)
		respond(w, 200, v, err)
	})
	mux.HandleFunc("GET /api/v1/projects/{id}/tasks", func(w http.ResponseWriter, r *http.Request) {
		v, err := t.List(r.Context(), r.PathValue("id"))
		respond(w, 200, v, err)
	})
	mux.HandleFunc("POST /api/v1/projects/{id}/tasks", func(w http.ResponseWriter, r *http.Request) {
		var in task.Input
		if err := httpx.Decode(w, r, &in); err != nil {
			httpx.Fail(w, err)
			return
		}
		v, err := t.Create(r.Context(), r.PathValue("id"), in)
		respond(w, 201, v, err)
	})
	mux.HandleFunc("GET /api/v1/tasks/{id}", func(w http.ResponseWriter, r *http.Request) {
		v, err := t.Get(r.Context(), r.PathValue("id"))
		respond(w, 200, v, err)
	})
	mux.HandleFunc("PATCH /api/v1/tasks/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in task.Input
		if err := httpx.Decode(w, r, &in); err != nil {
			httpx.Fail(w, err)
			return
		}
		v, err := t.Update(r.Context(), r.PathValue("id"), in)
		respond(w, 200, v, err)
	})
	mux.HandleFunc("POST /api/v1/tasks/{id}/move", func(w http.ResponseWriter, r *http.Request) {
		var in task.MoveInput
		if err := httpx.Decode(w, r, &in); err != nil {
			httpx.Fail(w, err)
			return
		}
		v, err := t.Move(r.Context(), r.PathValue("id"), in)
		respond(w, 200, v, err)
	})
	mux.HandleFunc("GET /api/v1/projects/{id}/pages", func(w http.ResponseWriter, r *http.Request) {
		v, err := pg.List(r.Context(), r.PathValue("id"))
		respond(w, 200, v, err)
	})
	mux.HandleFunc("POST /api/v1/projects/{id}/pages", func(w http.ResponseWriter, r *http.Request) {
		var in page.Input
		if err := httpx.Decode(w, r, &in); err != nil {
			httpx.Fail(w, err)
			return
		}
		v, err := pg.Create(r.Context(), r.PathValue("id"), in)
		respond(w, 201, v, err)
	})
	mux.HandleFunc("GET /api/v1/pages/{id}", func(w http.ResponseWriter, r *http.Request) {
		v, err := pg.Get(r.Context(), r.PathValue("id"))
		respond(w, 200, v, err)
	})
	mux.HandleFunc("PATCH /api/v1/pages/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in page.Input
		if err := httpx.Decode(w, r, &in); err != nil {
			httpx.Fail(w, err)
			return
		}
		v, err := pg.Update(r.Context(), r.PathValue("id"), in)
		respond(w, 200, v, err)
	})
	mux.HandleFunc("POST /api/v1/pages/{id}/move", func(w http.ResponseWriter, r *http.Request) {
		var in page.MoveInput
		if err := httpx.Decode(w, r, &in); err != nil {
			httpx.Fail(w, err)
			return
		}
		v, err := pg.Move(r.Context(), r.PathValue("id"), in)
		respond(w, 200, v, err)
	})
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
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				slog.Error("panic", "value", v)
				httpx.Fail(w, &httpx.Error{Status: 500, Code: "internal", Message: "服务器内部错误"})
			}
		}()
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" {
			origin := r.Header.Get("Origin")
			if origin != "" {
				u, err := url.Parse(origin)
				if err != nil || ((u.Scheme != "http" && u.Scheme != "https") || u.Host != r.Host) && origin != c.DevOrigin {
					httpx.Fail(w, &httpx.Error{Status: 403, Code: "forbidden", Message: "不允许的请求来源"})
					return
				}
			}
		}
		mux.ServeHTTP(w, r)
	})
}
func respond(w http.ResponseWriter, status int, v any, err error) {
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, status, v)
}
