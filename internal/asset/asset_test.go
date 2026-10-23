package asset

import (
	"bytes"
	"context"
	"net/http/httptest"
	"noteapp/internal/platform/database"
	"noteapp/internal/project"
	"path/filepath"
	"strings"
	"testing"
)

func TestUpload(t *testing.T) {
	ctx := context.Background()
	db, e := database.Open(ctx, filepath.Join(t.TempDir(), "db"))
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	title := "p"
	p, _ := project.New(db).Create(ctx, project.Input{Title: &title})
	s := New(db, t.TempDir(), 8)
	a, e := s.Upload(ctx, p.ID, "a.txt", strings.NewReader("hello"))
	if e != nil {
		t.Fatal(e)
	}
	b, e := s.Upload(ctx, p.ID, "a.txt", strings.NewReader("hello"))
	if e != nil || a.ID == b.ID {
		t.Fatal(b, e)
	}
	if _, e = s.Upload(ctx, p.ID, "../evil", strings.NewReader("a")); e == nil {
		t.Fatal("traversal accepted")
	}
	if _, e = s.Upload(ctx, p.ID, "large", strings.NewReader("123456789")); e == nil {
		t.Fatal("limit accepted")
	}
}

func TestRestartAndDownloadPolicy(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	path := filepath.Join(dir, "db")
	db, e := database.Open(ctx, path)
	if e != nil {
		t.Fatal(e)
	}
	title := "p"
	p, _ := project.New(db).Create(ctx, project.Input{Title: &title})
	s := New(db, dir, 1024)
	html, e := s.Upload(ctx, p.ID, "danger.html", strings.NewReader("<script>alert(1)</script>"))
	if e != nil {
		t.Fatal(e)
	}
	svg, e := s.Upload(ctx, p.ID, "danger.svg", strings.NewReader("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))
	if e != nil {
		t.Fatal(e)
	}
	png, e := s.Upload(ctx, p.ID, "image.png", bytes.NewReader([]byte{137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0}))
	if e != nil {
		t.Fatal(e)
	}
	db.Close()
	db, e = database.Open(ctx, path)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	s = New(db, dir, 1024)
	for _, a := range []Asset{html, svg, png} {
		r := httptest.NewRequest("GET", a.URL, nil)
		r.SetPathValue("id", a.ID)
		w := httptest.NewRecorder()
		s.Download(w, r)
		if w.Code != 200 || int64(w.Body.Len()) != a.Size {
			t.Fatalf("restart lost asset %s: %d", a.Name, w.Code)
		}
		disposition := "attachment"
		if a.ID == png.ID {
			disposition = "inline"
		}
		if !strings.HasPrefix(w.Header().Get("Content-Disposition"), disposition) || w.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Fatal(w.Header())
		}
	}
	archived := true
	_, e = project.New(db).Update(ctx, p.ID, project.Input{Archived: &archived, Version: p.Version})
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.Upload(ctx, p.ID, "no.txt", strings.NewReader("a")); e == nil {
		t.Fatal("archived upload allowed")
	}
}
