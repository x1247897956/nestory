package app_test

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"noteapp/internal/app"
	"noteapp/internal/platform/config"
	"noteapp/internal/platform/database"
)

func transferApp(t *testing.T) http.Handler {
	t.Helper()
	dir := t.TempDir()
	db, err := database.Open(context.Background(), filepath.Join(dir, "noteapp.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return app.New(db, config.Config{DataDir: dir, Timezone: "Asia/Shanghai", AllowedHosts: []string{"example.com"}})
}

func transferRequest(h http.Handler, method, path string, body []byte) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/api/v1/transfer/"+path, bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/zip")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestWorkspaceTransferRoundTrip(t *testing.T) {
	source, target := transferApp(t), transferApp(t)
	p := project(t, source, "完整工作空间")
	pid := p["id"].(string)
	parent := task(t, source, p, "父任务", nil)
	child := task(t, source, p, "子任务", parent["id"])
	page := req(t, source, "POST", "/projects/"+pid+"/pages", object{"title": "附件笔记"}, 201)
	pageID := page["id"].(string)
	definition := req(t, source, "POST", "/projects/"+pid+"/property-definitions/pages", object{"kind": "text"}, 201)
	req(t, source, "PUT", "/objects/pages/"+pageID+"/custom-properties/"+definition["id"].(string), object{"version": 0, "definition_version": 1, "value": "保留自定义属性"}, 200)
	ev := req(t, source, "POST", "/projects/"+pid+"/events", object{"title": "会议", "start_at": "2026-11-10T09:00:00+08:00", "end_at": "2026-11-10T10:00:00+08:00"}, 201)
	req(t, source, "PUT", "/relations/task-page/"+child["id"].(string)+"/"+pageID, nil, 200)
	req(t, source, "PUT", "/relations/task-event/"+child["id"].(string)+"/"+ev["id"].(string), nil, 200)
	req(t, source, "PUT", "/relations/page-event/"+pageID+"/"+ev["id"].(string), nil, 200)
	var upload bytes.Buffer
	writer := multipart.NewWriter(&upload)
	file, _ := writer.CreateFormFile("file", "evidence.bin")
	content := []byte{0, 1, 2, 255, 128}
	file.Write(content)
	writer.Close()
	r := httptest.NewRequest("POST", "/api/v1/projects/"+pid+"/assets", &upload)
	r.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()
	source.ServeHTTP(w, r)
	if w.Code != 201 {
		t.Fatalf("upload %d %s", w.Code, w.Body.String())
	}
	var attachment object
	json.Unmarshal(w.Body.Bytes(), &attachment)
	trashPage := req(t, source, "POST", "/projects/"+pid+"/pages", object{"title": "回收站内容"}, 201)
	preview := req(t, source, "GET", "/pages/"+trashPage["id"].(string)+"/delete-preview", nil, 200)
	req(t, source, "DELETE", "/pages/"+trashPage["id"].(string), preview, 200)
	req(t, source, "PATCH", "/projects/"+pid, object{"version": p["version"], "archived": true}, 200)
	exported := transferRequest(source, "GET", "export", nil)
	if exported.Code != 200 {
		t.Fatalf("export %d %s", exported.Code, exported.Body.String())
	}
	if _, err := zip.NewReader(bytes.NewReader(exported.Body.Bytes()), int64(exported.Body.Len())); err != nil {
		t.Fatal(err)
	}
	imported := transferRequest(target, "POST", "import", exported.Body.Bytes())
	if imported.Code != 200 {
		t.Fatalf("import %d %s", imported.Code, imported.Body.String())
	}
	restored := req(t, target, "GET", "/tasks/"+child["id"].(string), nil, 200)
	if restored["parent_id"] != parent["id"] {
		t.Fatal("lost hierarchy")
	}
	if req(t, target, "GET", "/projects/"+pid, nil, 200)["archived_at"] == nil {
		t.Fatal("lost archived state")
	}
	properties := req(t, target, "GET", "/objects/pages/"+pageID+"/custom-properties", nil, 200)
	if raw, _ := json.Marshal(properties); !bytes.Contains(raw, []byte("保留自定义属性")) {
		t.Fatal("lost custom properties")
	}
	trash := httptest.NewRecorder()
	target.ServeHTTP(trash, httptest.NewRequest("GET", "/api/v1/trash", nil))
	if trash.Code != 200 || !bytes.Contains(trash.Body.Bytes(), []byte("回收站内容")) {
		t.Fatalf("lost trash: %s", trash.Body.String())
	}
	downloaded := httptest.NewRecorder()
	target.ServeHTTP(downloaded, httptest.NewRequest("GET", attachment["url"].(string), nil))
	if downloaded.Code != 200 || !bytes.Equal(downloaded.Body.Bytes(), content) {
		t.Fatal("lost binary attachment")
	}
	if again := transferRequest(target, "POST", "import", exported.Body.Bytes()); again.Code != 409 {
		t.Fatalf("nonempty restore: %d", again.Code)
	}
	// Search index is derived from authoritative rows during restore.
	search := httptest.NewRecorder()
	target.ServeHTTP(search, httptest.NewRequest("GET", "/api/v1/search?q=子任务&include_archived=true", nil))
	if search.Code != 200 || !bytes.Contains(search.Body.Bytes(), []byte("子任务")) {
		t.Fatalf("search: %s", search.Body.String())
	}
}

func rewriteTransfer(t *testing.T, archive []byte, mutate func(map[string][]byte), rehash bool) []byte {
	t.Helper()
	z, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		t.Fatal(err)
	}
	files := map[string][]byte{}
	for _, f := range z.File {
		r, e := f.Open()
		if e != nil {
			t.Fatal(e)
		}
		files[f.Name], e = io.ReadAll(r)
		r.Close()
		if e != nil {
			t.Fatal(e)
		}
	}
	mutate(files)
	if rehash {
		var m object
		if err = json.Unmarshal(files["manifest.json"], &m); err != nil {
			t.Fatal(err)
		}
		entries := object{}
		for name, raw := range files {
			if name != "manifest.json" {
				entries[name] = object{"size": len(raw), "sha256": fmt.Sprintf("%x", sha256.Sum256(raw))}
			}
		}
		m["files"] = entries
		files["manifest.json"], _ = json.Marshal(m)
	}
	var out bytes.Buffer
	writer := zip.NewWriter(&out)
	for name, raw := range files {
		f, e := writer.Create(name)
		if e != nil {
			t.Fatal(e)
		}
		f.Write(raw)
	}
	if err = writer.Close(); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}

func TestWorkspaceTransferValidationAndRollback(t *testing.T) {
	source := transferApp(t)
	p := project(t, source, "rollback source")
	task(t, source, p, "task", nil)
	req(t, source, "POST", "/projects/"+p["id"].(string)+"/pages", object{"title": "page"}, 201)
	exported := transferRequest(source, "GET", "export", nil)
	if exported.Code != 200 {
		t.Fatal(exported.Body.String())
	}
	cases := []struct {
		name   string
		rehash bool
		mutate func(map[string][]byte)
	}{
		{"task cycle", true, func(files map[string][]byte) { selfParentTransfer(files, "tasks") }},
		{"page cycle", true, func(files map[string][]byte) { selfParentTransfer(files, "pages") }},
		{"checksum", false, func(files map[string][]byte) { files["workspace.json"] = append(files["workspace.json"], byte(' ')) }},
		{"schema version", false, func(files map[string][]byte) {
			files["manifest.json"] = bytes.Replace(files["manifest.json"], []byte(`"schema":10`), []byte(`"schema":999`), 1)
		}},
		{"foreign key", true, func(files map[string][]byte) {
			var data object
			json.Unmarshal(files["workspace.json"], &data)
			for _, entry := range data["tables"].([]any) {
				tab := entry.(map[string]any)
				if tab["name"] != "tasks" {
					continue
				}
				for i, col := range tab["columns"].([]any) {
					if col == "project_id" {
						tab["rows"].([]any)[0].([]any)[i] = object{"type": "text", "value": strings.Repeat("a", 32)}
					}
				}
			}
			files["workspace.json"], _ = json.Marshal(data)
		}},
		{"invalid document", true, func(files map[string][]byte) {
			var data object
			json.Unmarshal(files["workspace.json"], &data)
			for _, entry := range data["tables"].([]any) {
				tab := entry.(map[string]any)
				if tab["name"] != "tasks" {
					continue
				}
				for i, col := range tab["columns"].([]any) {
					if col == "body_document" {
						tab["rows"].([]any)[0].([]any)[i] = object{"type": "text", "value": `{"version":999,"blocks":[]}`}
					}
				}
			}
			files["workspace.json"], _ = json.Marshal(data)
		}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			target := transferApp(t)
			invalid := rewriteTransfer(t, exported.Body.Bytes(), test.mutate, test.rehash)
			if response := transferRequest(target, "POST", "import", invalid); response.Code != 400 {
				t.Fatalf("got %d: %s", response.Code, response.Body.String())
			}
			if response := transferRequest(target, "POST", "import", exported.Body.Bytes()); response.Code != 200 {
				t.Fatalf("partial restore remained: %d %s", response.Code, response.Body.String())
			}
		})
	}
}

func selfParentTransfer(files map[string][]byte, name string) {
	var data object
	json.Unmarshal(files["workspace.json"], &data)
	for _, entry := range data["tables"].([]any) {
		tab := entry.(map[string]any)
		if tab["name"] != name {
			continue
		}
		row := tab["rows"].([]any)[0].([]any)
		var id any
		for i, col := range tab["columns"].([]any) {
			if col == "id" {
				id = row[i]
			}
		}
		for i, col := range tab["columns"].([]any) {
			if col == "parent_id" {
				row[i] = id
			}
		}
	}
	files["workspace.json"], _ = json.Marshal(data)
}

func TestWorkspaceTransferRejectsInvalidArchives(t *testing.T) {
	for _, name := range []string{"../outside", "assets/../../escape", "/absolute", "manifest.json"} {
		t.Run(name, func(t *testing.T) {
			var buf bytes.Buffer
			z := zip.NewWriter(&buf)
			f, _ := z.Create(name)
			io.WriteString(f, "invalid")
			z.Close()
			h := transferApp(t)
			w := transferRequest(h, "POST", "import", buf.Bytes())
			if w.Code != 400 {
				t.Fatalf("got %d: %s", w.Code, w.Body.String())
			}
			project(t, h, "导入失败后仍可新建")
		})
	}
}
