package app

import (
	"net/http"
	"noteapp/internal/object"
	"noteapp/internal/objectquery"
)

func registerObjects(mux *http.ServeMux, queries *objectquery.Service) {
	mux.HandleFunc("GET /api/v1/object-types/{type}", func(w http.ResponseWriter, r *http.Request) {
		v, err := object.Describe(object.Type(r.PathValue("type")))
		respond(w, 200, v, err)
	})
	mux.HandleFunc("GET /api/v1/objects/{type}/{id}", func(w http.ResponseWriter, r *http.Request) {
		v, err := queries.Get(r.Context(), object.Type(r.PathValue("type")), r.PathValue("id"))
		respond(w, 200, v, err)
	})
}
