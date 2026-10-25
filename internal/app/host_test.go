package app

import (
	"net/http"
	"net/http/httptest"
	"noteapp/internal/platform/config"
	"testing"
)

func TestHostBoundaryAllRoutes(t *testing.T) {
	h := New(nil, config.Config{})
	for _, method := range []string{"GET", "POST", "OPTIONS", "HEAD"} {
		for _, path := range []string{"/", "/api/v1/healthz", "/api/v1/projects", "/assets/test.js"} {
			r := httptest.NewRequest(method, "http://audit.invalid"+path, nil)
			r.Header.Set("Origin", "http://audit.invalid")
			r.Header.Set("X-Forwarded-Host", "localhost")
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != 403 {
				t.Fatalf("%s %s: %d", method, path, w.Code)
			}
		}
	}
}
func TestConfiguredHostAndOrigin(t *testing.T) {
	h := New(nil, config.Config{AllowedHosts: []string{"lan.example", "::1"}})
	for _, host := range []string{"LAN.Example.:8080", "[::1]:8080"} {
		r := httptest.NewRequest("GET", "http://"+host+"/api/v1/healthz", nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 200 {
			t.Fatalf("%s: %d", host, w.Code)
		}
	}
	r := httptest.NewRequest("POST", "http://lan.example/api/v1/projects", nil)
	r.Header.Set("Origin", "https://lan.example")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatalf("forged scheme: %d", w.Code)
	}
}
func TestOriginMatching(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "http://localhost:8080/", nil)
	for _, test := range []struct {
		origin, dev string
		want        bool
	}{
		{"http://localhost:8080", "", true}, {"http://LOCALHOST.:8080", "", true}, {"https://localhost:8080", "", false}, {"http://evil.example", "", false}, {"http://localhost:8080/path", "", false}, {"http://localhost:8080#x", "", false}, {"http://127.0.0.1:5173", "http://127.0.0.1:5173", true}, {"null", "", false},
	} {
		if got := allowedOrigin(test.origin, r, test.dev); got != test.want {
			t.Errorf("%s: %v", test.origin, got)
		}
	}
}
