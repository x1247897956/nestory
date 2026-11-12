package transfer

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"noteapp/internal/platform/database"
)

func TestExportRefusesMoreAttachmentsThanImportCanRead(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	db, err := database.Open(ctx, filepath.Join(dir, "noteapp.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.ExecContext(ctx, "INSERT INTO projects(id,title,created_at,updated_at) VALUES('p','test',1,1)")
	if err != nil {
		t.Fatal(err)
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	for i := 0; i < 10001; i++ {
		key := fmt.Sprintf("%032x", i)
		if _, err = tx.ExecContext(ctx, "INSERT INTO assets VALUES(?,?,?,?,?,?,?)", key, "p", "empty.txt", key, "text/plain", 0, 1); err != nil {
			t.Fatal(err)
		}
	}
	if err = tx.Commit(); err != nil {
		t.Fatal(err)
	}
	_, err = New(db, dir).Export(ctx)
	if err == nil || !strings.Contains(err.Error(), "附件数量") {
		t.Fatalf("want actionable attachment count error before reading files, got %v", err)
	}
}
