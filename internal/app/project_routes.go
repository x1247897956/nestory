package app

import (
	"net/http"

	"noteapp/internal/platform/httpx"
	"noteapp/internal/project"
)

func registerProjects(mux *http.ServeMux, p *project.Service) {
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
}
