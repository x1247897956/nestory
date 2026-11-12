package app_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"noteapp/internal/platform/buildinfo"
)

func TestConfigReportsBuildVersion(t *testing.T) {
	original := buildinfo.Version
	t.Cleanup(func() { buildinfo.Version = original })
	for _, tc := range []struct {
		name    string
		version string
	}{
		{name: "development", version: "development"},
		{name: "commit", version: "9f5e899"},
		{name: "release tag", version: "v0.1.1+9f5e899"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			buildinfo.Version = tc.version
			h, closeDB := setup(t)
			defer closeDB()
			got := req(t, h, "GET", "/config", nil, 200)
			if got["version"] != tc.version {
				t.Fatalf("version = %v, want %q", got["version"], tc.version)
			}
		})
	}
}

func TestBackendOnlyServesAPI(t *testing.T) {
	h, closeDB := setup(t)
	defer closeDB()
	for _, path := range []string{"/", "/projects/example", "/assets/missing.js"} {
		r := httptest.NewRequest("GET", path, nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusNotFound {
			t.Fatalf("GET %s = %d; backend must not serve frontend", path, w.Code)
		}
	}
	for _, method := range []string{"GET", "POST"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(method, "/api/v1/missing", nil))
		if w.Code != http.StatusNotFound || !strings.HasPrefix(w.Header().Get("Content-Type"), "application/json") {
			t.Fatalf("%s unknown API = %d %s", method, w.Code, w.Header().Get("Content-Type"))
		}
	}
}
