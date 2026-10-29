package app

import (
	"context"
	"database/sql"
	"io/fs"
	"log/slog"
	"net/http"

	"noteapp/internal/asset"
	"noteapp/internal/customproperty"
	"noteapp/internal/event"
	"noteapp/internal/object"
	"noteapp/internal/objectquery"
	"noteapp/internal/page"
	"noteapp/internal/platform/config"
	"noteapp/internal/platform/httpx"
	"noteapp/internal/project"
	"noteapp/internal/relation"
	"noteapp/internal/task"
	"noteapp/internal/taskmeta"
	"noteapp/internal/trash"
	"noteapp/internal/workspace"
	"noteapp/web"
	"strconv"
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
		httpx.JSON(w, 200, map[string]any{"timezone": c.Timezone, "stages": taskmeta.Stages(), "priorities": taskmeta.Priorities()})
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

	events := event.New(db)
	relations := relation.New(db)
	properties := customproperty.New(db)
	registerCustomProperties(mux, properties)
	registerObjects(mux, objectquery.New(map[object.Type]objectquery.Reader{
		object.Task: func(ctx context.Context, id string) (object.Object, error) {
			v, err := t.Get(ctx, id)
			return v.AsObject(), err
		},
		object.Note: func(ctx context.Context, id string) (object.Object, error) {
			v, err := pg.Get(ctx, id)
			return v.AsObject(), err
		},
		object.Event: func(ctx context.Context, id string) (object.Object, error) {
			v, err := events.Get(ctx, id)
			return v.AsObject(), err
		},
	}, func(ctx context.Context, pid string) (bool, error) {
		v, err := p.Get(ctx, pid)
		return v.ArchivedAt != nil, err
	}, relations.List, func(ctx context.Context, typ object.Type, id string) ([]object.CustomProperty, error) {
		v, e := properties.Fields(ctx, typ, id)
		return v.Fields, e
	}))
	mux.HandleFunc("GET /api/v1/projects/{id}/relation-options", func(w http.ResponseWriter, r *http.Request) {
		v, e := relations.Candidates(r.Context(), r.PathValue("id"))
		respond(w, 200, v, e)
	})
	mux.HandleFunc("GET /api/v1/projects/{id}/events", func(w http.ResponseWriter, r *http.Request) {
		v, e := events.List(r.Context(), r.PathValue("id"), r.URL.Query().Get("from"), r.URL.Query().Get("to"))
		respond(w, 200, v, e)
	})
	mux.HandleFunc("POST /api/v1/projects/{id}/events", func(w http.ResponseWriter, r *http.Request) {
		var in event.Input
		if e := httpx.Decode(w, r, &in); e != nil {
			httpx.Fail(w, e)
			return
		}
		v, e := events.Create(r.Context(), r.PathValue("id"), in)
		respond(w, 201, v, e)
	})
	mux.HandleFunc("GET /api/v1/events/{id}", func(w http.ResponseWriter, r *http.Request) {
		v, e := events.Get(r.Context(), r.PathValue("id"))
		respond(w, 200, v, e)
	})
	mux.HandleFunc("PATCH /api/v1/events/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in event.Input
		if e := httpx.Decode(w, r, &in); e != nil {
			httpx.Fail(w, e)
			return
		}
		v, e := events.Update(r.Context(), r.PathValue("id"), in)
		respond(w, 200, v, e)
	})
	for _, typ := range []string{"tasks", "pages", "events"} {
		mux.HandleFunc("GET /api/v1/"+typ+"/{id}/relations", func(w http.ResponseWriter, r *http.Request) {
			v, e := relations.List(r.Context(), typ, r.PathValue("id"))
			respond(w, 200, v, e)
		})
	}
	for _, method := range []string{"PUT", "DELETE"} {
		mux.HandleFunc(method+" /api/v1/relations/{kind}/{left}/{right}", func(w http.ResponseWriter, r *http.Request) {
			e := relations.Change(r.Context(), r.PathValue("kind"), r.PathValue("left"), r.PathValue("right"), method == "PUT")
			respond(w, 200, map[string]bool{"ok": true}, e)
		})
	}

	ws := workspace.New(db, c.Timezone, nil)
	bin := trash.New(db)
	mux.HandleFunc("GET /api/v1/workspace", func(w http.ResponseWriter, r *http.Request) {
		v, e := ws.Dashboard(r.Context(), r.URL.Query().Get("from"), r.URL.Query().Get("to"))
		respond(w, 200, v, e)
	})
	mux.HandleFunc("GET /api/v1/workspace/today", func(w http.ResponseWriter, r *http.Request) { v, e := ws.Today(r.Context()); respond(w, 200, v, e) })
	mux.HandleFunc("GET /api/v1/search", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		limit, offset := 20, 0
		var e error
		if q.Has("limit") {
			limit, e = strconv.Atoi(q.Get("limit"))
			if e != nil {
				httpx.Fail(w, httpx.Invalid("limit 无效"))
				return
			}
		}
		if q.Has("offset") {
			offset, e = strconv.Atoi(q.Get("offset"))
			if e != nil {
				httpx.Fail(w, httpx.Invalid("offset 无效"))
				return
			}
		}
		v, e := ws.Search(r.Context(), q.Get("q"), q.Get("include_archived") == "true", limit, offset)
		respond(w, 200, v, e)
	})
	mux.HandleFunc("GET /api/v1/recent", func(w http.ResponseWriter, r *http.Request) {
		v, e := ws.Recent(r.Context(), r.URL.Query().Get("include_archived") == "true")
		respond(w, 200, v, e)
	})
	mux.HandleFunc("POST /api/v1/recent", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Type string `json:"type"`
			ID   string `json:"id"`
		}
		if e := httpx.Decode(w, r, &in); e != nil {
			httpx.Fail(w, e)
			return
		}
		e := ws.Visit(r.Context(), in.Type, in.ID)
		respond(w, 200, map[string]bool{"ok": true}, e)
	})
	mux.HandleFunc("GET /api/v1/trash", func(w http.ResponseWriter, r *http.Request) { v, e := bin.List(r.Context()); respond(w, 200, v, e) })
	mux.HandleFunc("POST /api/v1/trash/{batch}/restore", func(w http.ResponseWriter, r *http.Request) {
		e := bin.Restore(r.Context(), r.PathValue("batch"))
		respond(w, 200, map[string]bool{"ok": true}, e)
	})
	for _, typ := range []string{"projects", "tasks", "pages", "events"} {
		mux.HandleFunc("GET /api/v1/"+typ+"/{id}/delete-preview", func(w http.ResponseWriter, r *http.Request) {
			v, e := bin.Preview(r.Context(), typ, r.PathValue("id"))
			respond(w, 200, v, e)
		})
		mux.HandleFunc("DELETE /api/v1/"+typ+"/{id}", func(w http.ResponseWriter, r *http.Request) {
			var in trash.Preview
			if e := httpx.Decode(w, r, &in); e != nil {
				httpx.Fail(w, e)
				return
			}
			v, e := bin.Delete(r.Context(), typ, r.PathValue("id"), in)
			respond(w, 200, map[string]string{"batch_id": v}, e)
		})
	}
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
	compressed := httpx.CompressJSON(mux)
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
		compressed.ServeHTTP(w, r)
	})
}
func respond(w http.ResponseWriter, status int, v any, err error) {
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, status, v)
}
