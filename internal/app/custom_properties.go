package app

import (
	"net/http"
	"noteapp/internal/customproperty"
	"noteapp/internal/object"
	"noteapp/internal/platform/httpx"
)

func registerCustomProperties(mux *http.ServeMux, s *customproperty.Service) {
	mux.HandleFunc("GET /api/v1/projects/{id}/property-definitions/{type}", func(w http.ResponseWriter, r *http.Request) {
		v, e := s.Definitions(r.Context(), r.PathValue("id"), object.Type(r.PathValue("type")))
		respond(w, 200, map[string]any{"definitions": v}, e)
	})
	mux.HandleFunc("POST /api/v1/projects/{id}/property-definitions/{type}", func(w http.ResponseWriter, r *http.Request) {
		var in customproperty.CreateInput
		if e := httpx.Decode(w, r, &in); e != nil {
			httpx.Fail(w, e)
			return
		}
		v, e := s.Create(r.Context(), r.PathValue("id"), object.Type(r.PathValue("type")), in)
		respond(w, 201, v, e)
	})
	mux.HandleFunc("PATCH /api/v1/property-definitions/{id}", func(w http.ResponseWriter, r *http.Request) {
		var in customproperty.UpdateInput
		if e := httpx.Decode(w, r, &in); e != nil {
			httpx.Fail(w, e)
			return
		}
		v, e := s.Update(r.Context(), r.PathValue("id"), in)
		respond(w, 200, v, e)
	})
	mux.HandleFunc("GET /api/v1/objects/{type}/{id}/custom-properties", func(w http.ResponseWriter, r *http.Request) {
		v, e := s.Fields(r.Context(), object.Type(r.PathValue("type")), r.PathValue("id"))
		respond(w, 200, v, e)
	})
	mux.HandleFunc("PUT /api/v1/objects/{type}/{id}/custom-properties/{property}", func(w http.ResponseWriter, r *http.Request) {
		var in customproperty.ValueInput
		if e := httpx.Decode(w, r, &in); e != nil {
			httpx.Fail(w, e)
			return
		}
		v, e := s.Set(r.Context(), object.Type(r.PathValue("type")), r.PathValue("id"), r.PathValue("property"), in)
		respond(w, 200, v, e)
	})
}
