package workspace

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"noteapp/internal/platform/database"
)

// BenchmarkSearch measures the real SQLite JSON search, including count and page
// queries. Fixture insertion is outside timing; it does not replace API latency.
func BenchmarkSearch(b *testing.B) {
	for _, count := range []int{1000, 5000} {
		b.Run(fmt.Sprintf("per_type=%d", count), func(b *testing.B) {
			ctx := context.Background()
			db, err := database.Open(ctx, filepath.Join(b.TempDir(), "search.db"))
			if err != nil {
				b.Fatal(err)
			}
			defer db.Close()
			tx, err := db.BeginTx(ctx, nil)
			if err != nil {
				b.Fatal(err)
			}
			defer tx.Rollback()
			if _, err = tx.Exec(`INSERT INTO projects(id,title,created_at,updated_at) VALUES('p','Benchmark',1,1)`); err != nil {
				b.Fatal(err)
			}
			text, err := json.Marshal(strings.Repeat("searchable中文 ", 500))
			if err != nil {
				b.Fatal(err)
			}
			doc := `{"version":1,"blocks":[{"id":"body","type":"paragraph","content":[{"type":"text","text":` + string(text) + `,"styles":{}}]}]}`
			for _, table := range []string{"tasks", "pages", "events"} {
				query := "INSERT INTO " + table + "(id,project_id,title,body_document,created_at,updated_at) VALUES(?,'p',?,?,1,1)"
				if table == "events" {
					query = "INSERT INTO events(id,project_id,title,body_document,start_at,end_at,created_at,updated_at) VALUES(?,'p',?,?,1,2,1,1)"
				}
				stmt, err := tx.PrepareContext(ctx, query)
				if err != nil {
					b.Fatal(err)
				}
				for i := 0; i < count; i++ {
					id := fmt.Sprintf("%s-%d", table, i)
					if _, err = stmt.ExecContext(ctx, id, id, doc); err != nil {
						stmt.Close()
						b.Fatal(err)
					}
				}
				if err = stmt.Close(); err != nil {
					b.Fatal(err)
				}
			}
			if err = tx.Commit(); err != nil {
				b.Fatal(err)
			}
			service := New(db, "Asia/Shanghai", nil)
			for _, query := range []struct {
				name, text string
				total      int
			}{{"miss", "no-match-perf-token", 0}, {"body", "searchable", count * 3}} {
				b.Run(query.name, func(b *testing.B) {
					b.ReportAllocs()
					for b.Loop() {
						result, err := service.Search(ctx, query.text, false, 20, 0)
						if err != nil || result.Total != query.total {
							b.Fatalf("total=%d want=%d err=%v", result.Total, query.total, err)
						}
					}
				})
			}
		})
	}
}
