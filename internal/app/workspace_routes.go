package app

import (
	"net/http"
	"strconv"

	"noteapp/internal/platform/httpx"
	"noteapp/internal/workspace"
)

func registerWorkspace(mux *http.ServeMux, ws *workspace.Service) {
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
}
