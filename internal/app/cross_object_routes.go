package app

import (
	"net/http"

	"noteapp/internal/platform/httpx"
	"noteapp/internal/relation"
	"noteapp/internal/trash"
)

func registerRelations(mux *http.ServeMux, relations *relation.Service) {
	mux.HandleFunc("GET /api/v1/projects/{id}/relation-options", func(w http.ResponseWriter, r *http.Request) {
		v, e := relations.Candidates(r.Context(), r.PathValue("id"))
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
}

func registerTrash(mux *http.ServeMux, bin *trash.Service) {
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
}
