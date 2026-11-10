package workspace

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"noteapp/internal/platform/database"
)

func TestIndexedSearchMatchesLegacySemantics(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, filepath.Join(t.TempDir(), "search.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO projects(id,title,description,created_at,updated_at)VALUES('p','Project','project%_\\ description',1,1),('a','Archive','',1,1)`)
	exec(`UPDATE projects SET archived_at=2 WHERE id='a'`)
	for i, text := range []string{"中文 笔记 ABC abc abcde %_\\ [x] 🐈 test", "ÉCOLE école Kelvin K k", "line1\nline2", "nil\x00tail", "table.pdf"} {
		doc, _ := json.Marshal(map[string]any{"version": 1, "blocks": []any{map[string]any{"id": "b", "type": "paragraph", "content": []any{map[string]any{"type": "text", "text": text, "styles": map[string]any{}}}}}})
		exec(`INSERT INTO pages(id,project_id,title,body_document,created_at,updated_at)VALUES(?,'p',?,?,1,?)`, fmt.Sprintf("n%d", i), text, doc, i+1)
	}
	exec(`INSERT INTO tasks(id,project_id,title,created_at,updated_at)VALUES('t','p','ABC 中文',1,7),('a','a','ABC 中文',1,8)`)
	exec(`INSERT INTO events(id,project_id,title,start_at,end_at,created_at,updated_at)VALUES('e','p','ABC event',1,2,1,9)`)
	service := New(db, "Asia/Shanghai", nil)
	for _, q := range []string{"中", "中文", "笔记", "abc", "ABC", "abcde", "%", "_", `\`, "%_", `[x]`, "🐈", "É", "é", "Kelvin", "K", "k", "line1\nline2", "table.pdf", "missing", "project"} {
		for _, archived := range []bool{false, true} {
			for _, offset := range []int{0, 2, 100} {
				// The previous implementation remains the compatibility oracle in this test only.
				pattern := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(q) + "%"
				where := ` WHERE (? OR archived_at IS NULL) AND (title LIKE ? ESCAPE '\' OR body LIKE ? ESCAPE '\')`
				var total int
				if err = db.QueryRowContext(ctx, "SELECT count(*) FROM ("+union+")"+where, archived, pattern, pattern).Scan(&total); err != nil {
					t.Fatal(err)
				}
				rows, err := db.QueryContext(ctx, "SELECT type,id FROM ("+union+")"+where+" ORDER BY updated_at DESC,id,type LIMIT 2 OFFSET ?", archived, pattern, pattern, offset)
				if err != nil {
					t.Fatal(err)
				}
				want := []string{}
				for rows.Next() {
					var typ, id string
					if err = rows.Scan(&typ, &id); err != nil {
						t.Fatal(err)
					}
					want = append(want, typ+":"+id)
				}
				if err = rows.Err(); err != nil {
					t.Fatal(err)
				}
				rows.Close()
				got, err := service.Search(ctx, q, archived, 2, offset)
				if err != nil {
					t.Fatal(err)
				}
				ids := []string{}
				for _, v := range got.Items {
					ids = append(ids, v.Type+":"+v.ID)
				}
				if got.Total != total || !reflect.DeepEqual(ids, want) {
					t.Fatalf("q=%q archived=%v offset=%d got=%v/%d want=%v/%d", q, archived, offset, ids, got.Total, want, total)
				}
			}
		}
	}
}
