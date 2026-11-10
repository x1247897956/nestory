package workspace

import (
	"context"
	"database/sql"
	"strings"

	"noteapp/internal/apperr"
)

// Search uses derived text/FTS candidates, never parses block JSON at read time.
// LIKE remains the final matcher, preserving short Chinese and literal symbols.
func (s *Service) Search(ctx context.Context, q string, archived bool, limit, offset int) (SearchResult, error) {
	if limit < 1 || limit > 100 || offset < 0 {
		return SearchResult{}, apperr.Invalid("分页范围无效")
	}
	v := SearchResult{Items: []Item{}, Limit: limit, Offset: offset}
	q = strings.TrimSpace(q)
	if q == "" {
		return v, nil
	}
	matcher := "SELECT rowid AS id FROM search_fts WHERE title LIKE ? UNION SELECT rowid AS id FROM search_fts WHERE body LIKE ?"
	pattern := "%" + q + "%"
	// FTS5 cannot accelerate LIKE ESCAPE. Only use ESCAPE when literal wildcard
	// characters require it; match against the text cache instead of re-reading JSON.
	if strings.ContainsAny(q, `%_\`) {
		matcher = `SELECT id FROM search_documents WHERE title LIKE ? ESCAPE '\' OR body LIKE ? ESCAPE '\'`
		pattern = "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(q) + "%"
	}
	query := `WITH matches AS MATERIALIZED (
  SELECT d.object_type AS type,d.object_id AS id,d.title,d.project_id,p.title AS project_title,p.archived_at,
   CASE d.object_type WHEN 'projects' THEN p.updated_at WHEN 'tasks' THEN t.updated_at WHEN 'pages' THEN n.updated_at ELSE e.updated_at END AS updated_at
  FROM (` + matcher + `) hits JOIN search_documents d ON d.id=hits.id
  JOIN projects p ON p.id=d.project_id
  LEFT JOIN tasks t ON d.object_type='tasks' AND t.id=d.object_id
  LEFT JOIN pages n ON d.object_type='pages' AND n.id=d.object_id
  LEFT JOIN events e ON d.object_type='events' AND e.id=d.object_id
  WHERE p.deleted_at IS NULL AND (? OR p.archived_at IS NULL)
 ) SELECT page.type,page.id,page.title,page.project_id,page.project_title,page.archived_at IS NOT NULL,page.updated_at,
  (SELECT count(*) FROM matches)
 FROM (SELECT 1) LEFT JOIN (SELECT * FROM matches ORDER BY updated_at DESC,id,type LIMIT ? OFFSET ?) page ON 1 ORDER BY page.updated_at DESC,page.id,page.type`
	rows, err := s.db.QueryContext(ctx, query, pattern, pattern, archived, limit, offset)
	if err != nil {
		return v, err
	}
	for rows.Next() {
		var typ, id, title, pid, pt sql.NullString
		var updated sql.NullInt64
		var isArchived bool
		if err = rows.Scan(&typ, &id, &title, &pid, &pt, &isArchived, &updated, &v.Total); err != nil {
			rows.Close()
			return v, err
		}
		if id.Valid {
			v.Items = append(v.Items, Item{Type: typ.String, ID: id.String, Title: title.String, ProjectID: pid.String, ProjectTitle: pt.String, Archived: isArchived, UpdatedAt: updated.Int64})
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return v, err
	}
	for i := range v.Items {
		if v.Items[i].Type == "pages" {
			v.Items[i].Path, err = s.path(ctx, v.Items[i].ID)
			if err != nil {
				return v, err
			}
		}
	}
	return v, nil
}
