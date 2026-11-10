package app

import (
	"net/http"

	"noteapp/internal/event"
	"noteapp/internal/page"
	"noteapp/internal/platform/httpx"
	"noteapp/internal/task"
)

func registerTasks(mux *http.ServeMux, t *task.Service) {
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
}

func registerPages(mux *http.ServeMux, pg *page.Service) {
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
}

func registerEvents(mux *http.ServeMux, events *event.Service) {
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
}
