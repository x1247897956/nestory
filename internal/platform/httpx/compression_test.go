package httpx

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCompressJSON(t *testing.T) {
	for _, tc := range []struct {
		name, method, path, accept, content string
		status                              int
		compressed                          bool
	}{
		{"json", "GET", "/api/v1/projects/p/tasks", "gzip", "application/json", 200, true},
		{"no negotiation", "GET", "/api/v1/projects", "", "application/json", 200, false},
		{"disabled", "GET", "/api/v1/projects", "gzip;q=0, *;q=1", "application/json", 200, false},
		{"supported wildcard", "GET", "/api/v1/projects", "br, *;q=0.5", "application/json", 200, true},
		{"invalid quality", "GET", "/api/v1/projects", "gzip;q=invalid", "application/json", 200, false},
		{"write unaffected", "POST", "/api/v1/projects", "gzip", "application/json", 201, false},
		{"asset unaffected", "GET", "/api/v1/assets/a", "gzip", "application/json", 200, false},
		{"static unaffected", "GET", "/assets/app.js", "gzip", "application/javascript", 200, false},
		{"error JSON", "GET", "/api/v1/projects", "gzip", "application/json", 500, true},
		{"no content", "GET", "/api/v1/projects", "gzip", "application/json", 204, false},
		{"not modified", "GET", "/api/v1/projects", "gzip", "application/json", 304, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			raw := []byte(strings.Repeat("中文正文", 2000))
			handler := CompressJSON(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", tc.content)
				w.WriteHeader(tc.status)
				if tc.status != 204 && tc.status != 304 {
					_, _ = w.Write(raw)
				}
			}))
			req := httptest.NewRequest(tc.method, tc.path, nil)
			req.Header.Set("Accept-Encoding", tc.accept)
			res := httptest.NewRecorder()
			handler.ServeHTTP(res, req)
			if res.Code != tc.status {
				t.Fatalf("status %d", res.Code)
			}
			compressed := res.Header().Get("Content-Encoding") == "gzip"
			if compressed != tc.compressed {
				t.Fatalf("compression %v", compressed)
			}
			body := res.Body.Bytes()
			if compressed {
				gz, err := gzip.NewReader(bytes.NewReader(body))
				if err != nil {
					t.Fatal(err)
				}
				defer gz.Close()
				decoded, err := io.ReadAll(gz)
				if err != nil {
					t.Fatal(err)
				}
				if !bytes.Equal(decoded, raw) {
					t.Fatal("changed response")
				}
				if len(body) >= len(raw)/5 {
					t.Fatal("ineffective compression")
				}
			}
			if !compressed && tc.status != 204 && tc.status != 304 && !bytes.Equal(body, raw) {
				t.Fatal("identity response changed")
			}
		})
	}
}
func TestCompressionPreservesRangesAndExistingEncoding(t *testing.T) {
	for _, ranged := range []bool{false, true} {
		req := httptest.NewRequest("GET", "/api/v1/projects/p/pages", nil)
		req.Header.Set("Accept-Encoding", "gzip")
		if ranged {
			req.Header.Set("Range", "bytes=0-4")
		}
		res := httptest.NewRecorder()
		CompressJSON(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			if !ranged {
				w.Header().Set("Content-Encoding", "br")
			}
			_, _ = w.Write([]byte("hello"))
		})).ServeHTTP(res, req)
		if res.Body.String() != "hello" || res.Header().Get("Content-Encoding") == "gzip" {
			t.Fatal("modified range/encoded body")
		}
	}
}
