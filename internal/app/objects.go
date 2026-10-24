package app

import (
	"net/http"
	"noteapp/internal/event"
	"noteapp/internal/object"
	"noteapp/internal/page"
	"noteapp/internal/project"
	"noteapp/internal/relation"
	"noteapp/internal/task"
)

// registerObjects composes the common object read model from concrete services.
// Updates and moves continue through their typed transactional APIs, so archive,
// hierarchy, conflict and same-project constraints have one implementation.
func registerObjects(mux *http.ServeMux, p *project.Service, t *task.Service, pg *page.Service, ev *event.Service, relations *relation.Service) {
	mux.HandleFunc("GET /api/v1/object-types/{type}", func(w http.ResponseWriter, r *http.Request) {
		v, err := object.Describe(object.Type(r.PathValue("type")))
		respond(w, 200, v, err)
	})
	mux.HandleFunc("GET /api/v1/objects/{type}/{id}", func(w http.ResponseWriter, r *http.Request) {
		typ := object.Type(r.PathValue("type"))
		if _, err := object.Describe(typ); err != nil {
			respond(w, 200, nil, err)
			return
		}
		var entity object.Entity
		var err error
		switch typ {
		case object.Task:
			entity, err = t.Get(r.Context(), r.PathValue("id"))
		case object.Note:
			entity, err = pg.Get(r.Context(), r.PathValue("id"))
		case object.Event:
			entity, err = ev.Get(r.Context(), r.PathValue("id"))
		}
		if err != nil {
			respond(w, 200, nil, err)
			return
		}
		v := entity.AsObject()
		project, err := p.Get(r.Context(), v.ProjectID)
		if err != nil {
			respond(w, 200, nil, err)
			return
		}
		v.ReadOnly = project.ArchivedAt != nil
		links, err := relations.List(r.Context(), string(typ), v.ID)
		v.Properties["relations"] = links
		respond(w, 200, v, err)
	})
}
