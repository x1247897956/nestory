package app_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"noteapp/internal/app"
	"noteapp/internal/platform/config"
	"noteapp/internal/platform/database"
)

// Keep all inputs small: these exercise production parser paths without resource exhaustion.
func TestBoundedRangeAndMultipartHTTP(t *testing.T) {
	dir := t.TempDir()
	db, err := database.Open(context.Background(), filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	h := app.New(db, config.Config{Timezone: "Asia/Shanghai", DataDir: dir, UploadLimit: 64, AllowedHosts: []string{"example.com", "127.0.0.1"}})
	p := project(t, h, "HTTP parser regression")
	server := httptest.NewServer(h)
	defer server.Close()
	client := server.Client()
	client.Timeout = 5 * time.Second
	request := func(method, path, contentType, rangeHeader string, body []byte) (int, http.Header, []byte) {
		t.Helper()
		r, e := http.NewRequest(method, server.URL+path, bytes.NewReader(body))
		if e != nil {
			t.Fatal(e)
		}
		if contentType != "" {
			r.Header.Set("Content-Type", contentType)
		}
		if rangeHeader != "" {
			r.Header.Set("Range", rangeHeader)
		}
		response, e := client.Do(r)
		if e != nil {
			t.Fatal(e)
		}
		defer response.Body.Close()
		data, e := io.ReadAll(io.LimitReader(response.Body, 2<<20))
		if e != nil {
			t.Fatal(e)
		}
		return response.StatusCode, response.Header, data
	}
	uploadPath := "/api/v1/projects/" + p["id"].(string) + "/assets"
	multipartBody := func(data []byte) ([]byte, string) {
		t.Helper()
		var b bytes.Buffer
		w := multipart.NewWriter(&b)
		part, e := w.CreateFormFile("file", "range.txt")
		if e != nil {
			t.Fatal(e)
		}
		if _, e = part.Write(data); e != nil {
			t.Fatal(e)
		}
		if e = w.Close(); e != nil {
			t.Fatal(e)
		}
		return b.Bytes(), w.FormDataContentType()
	}
	content := []byte("0123456789abcdefghijklmnopqrstuvwxyz")
	body, kind := multipartBody(content)
	status, _, data := request("POST", uploadPath, kind, "", body)
	if status != 201 {
		t.Fatalf("upload: %d %s", status, data)
	}
	var uploaded struct {
		URL string `json:"url"`
	}
	if err = json.Unmarshal(data, &uploaded); err != nil || uploaded.URL == "" {
		t.Fatalf("upload response: %s (%v)", data, err)
	}
	for _, path := range []string{"/", uploaded.URL} {
		t.Run(path, func(t *testing.T) {
			status, _, whole := request("GET", path, "", "", nil)
			if status != 200 || len(whole) < 10 {
				t.Fatalf("baseline: %d, %d bytes", status, len(whole))
			}
			for _, tc := range []struct {
				header   string
				status   int
				expected []byte
			}{
				{"bytes=0-3", 206, whole[:4]},
				{"bytes=-4", 206, whole[len(whole)-4:]},
				{"bytes=" + strconv.Itoa(len(whole)+1) + "-", 416, nil},
				{"bytes=bad", 416, nil},
			} {
				status, headers, data := request("GET", path, "", tc.header, nil)
				if status != tc.status {
					t.Fatalf("%s: %d %s", tc.header, status, data)
				}
				if tc.expected != nil && (!bytes.Equal(data, tc.expected) || headers.Get("Content-Range") == "") {
					t.Fatalf("%s: headers=%v body=%q", tc.header, headers, data)
				}
			}
			status, headers, data := request("GET", path, "", "bytes=0-1,4-5", nil)
			if status != 206 || !strings.HasPrefix(headers.Get("Content-Type"), "multipart/byteranges;") {
				t.Fatalf("multiple range: %d %v %s", status, headers, data)
			}

			_, params, err := mime.ParseMediaType(headers.Get("Content-Type"))
			if err != nil {
				t.Fatal(err)
			}
			reader := multipart.NewReader(bytes.NewReader(data), params["boundary"])
			for _, expected := range [][]byte{whole[:2], whole[4:6]} {
				part, err := reader.NextPart()
				if err != nil {
					t.Fatal(err)
				}
				fragment, err := io.ReadAll(part)
				if err != nil || !bytes.Equal(fragment, expected) {
					t.Fatalf("range fragment %q, error %v", fragment, err)
				}
			}
			if _, err := reader.NextPart(); err != io.EOF {
				t.Fatalf("unexpected extra range part: %v", err)
			}
		})
	}
	for _, tc := range []struct {
		name, kind string
		body       []byte
		want       int
	}{
		{"missing boundary", "multipart/form-data", []byte("small malformed body"), 400},
		{"truncated headers", "multipart/form-data; boundary=small", []byte("--small\r\nContent-Disposition: form-data; name=\"file\"; filename=\"x\"\r\n"), 400},
		{"wrong field", "multipart/form-data; boundary=small", []byte("--small\r\nContent-Disposition: form-data; name=\"other\"\r\n\r\nx\r\n--small--\r\n"), 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			status, _, data := request("POST", uploadPath, tc.kind, "", tc.body)
			if status != tc.want {
				t.Fatalf("%d: %s", status, data)
			}
		})
	}
	body, kind = multipartBody(bytes.Repeat([]byte("x"), 65))
	status, _, data = request("POST", uploadPath, kind, "", body)
	if status != 413 {
		t.Fatalf("limit: %d %s", status, data)
	}
	var count int
	if err = db.QueryRow("SELECT count(*) FROM assets").Scan(&count); err != nil || count != 1 {
		t.Fatalf("rejected multipart persisted metadata: count=%d err=%v", count, err)
	}
	// Parser errors and range failures must leave the service available.
	status, _, _ = request("GET", "/api/v1/healthz", "", "", nil)
	if status != 200 {
		t.Fatalf("health after malformed requests: %d", status)
	}
}
