package workspace

import (
	"context"
	"database/sql"
	"errors"
	"noteapp/internal/apperr"
	"strings"
	"time"
)

type Clock func() time.Time
type Service struct {
	db  *sql.DB
	loc *time.Location
	now Clock
}

func New(db *sql.DB, zone string, now Clock) *Service {
	loc, e := time.LoadLocation(zone)
	if e != nil {
		panic(e)
	}
	if now == nil {
		now = time.Now
	}
	return &Service{db, loc, now}
}

type Item struct {
	Type         string  `json:"type"`
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	ProjectID    string  `json:"project_id"`
	ProjectTitle string  `json:"project_title"`
	ParentTitle  string  `json:"parent_title,omitempty"`
	Path         string  `json:"path,omitempty"`
	Stage        string  `json:"stage,omitempty"`
	DueDate      *string `json:"due_date,omitempty"`
	StartAt      string  `json:"start_at,omitempty"`
	EndAt        string  `json:"end_at,omitempty"`
	Archived     bool    `json:"archived"`
	UpdatedAt    int64   `json:"updated_at"`
}
type Today struct {
	Date     string `json:"date"`
	Timezone string `json:"timezone"`
	Today    []Item `json:"today"`
	Overdue  []Item `json:"overdue"`
	Events   []Item `json:"events"`
}

func (s *Service) Today(ctx context.Context) (Today, error) {
	n := s.now().In(s.loc)
	start := time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, s.loc)
	next := start.AddDate(0, 0, 1)
	v := Today{Date: start.Format("2006-01-02"), Timezone: s.loc.String(), Today: []Item{}, Overdue: []Item{}, Events: []Item{}}
	stageFilter, stageArgs := openTaskStages()
	rows, e := s.db.QueryContext(ctx, `SELECT t.id,t.title,t.project_id,p.title,coalesce(a.title,''),t.stage,t.due_date FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN tasks a ON a.id=t.parent_id WHERE t.deleted_at IS NULL AND p.archived_at IS NULL AND `+stageFilter+` AND t.due_date<=? ORDER BY t.due_date,t.id`, append(stageArgs, v.Date)...)
	if e != nil {
		return v, e
	}
	for rows.Next() {
		it := Item{Type: "tasks"}
		if e = rows.Scan(&it.ID, &it.Title, &it.ProjectID, &it.ProjectTitle, &it.ParentTitle, &it.Stage, &it.DueDate); e != nil {
			rows.Close()
			return v, e
		}
		if *it.DueDate == v.Date {
			v.Today = append(v.Today, it)
		} else {
			v.Overdue = append(v.Overdue, it)
		}
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return v, e
	}
	rows, e = s.db.QueryContext(ctx, `SELECT e.id,e.title,e.project_id,p.title,e.start_at,e.end_at FROM events e JOIN projects p ON p.id=e.project_id WHERE e.deleted_at IS NULL AND p.archived_at IS NULL AND e.start_at<? AND e.end_at>? ORDER BY e.start_at,e.id`, next.UnixMilli(), start.UnixMilli())
	if e != nil {
		return v, e
	}
	defer rows.Close()
	for rows.Next() {
		it := Item{Type: "events"}
		var a, b int64
		if e = rows.Scan(&it.ID, &it.Title, &it.ProjectID, &it.ProjectTitle, &a, &b); e != nil {
			return v, e
		}
		it.StartAt = time.UnixMilli(a).In(s.loc).Format(time.RFC3339)
		it.EndAt = time.UnixMilli(b).In(s.loc).Format(time.RFC3339)
		v.Events = append(v.Events, it)
	}
	return v, rows.Err()
}

type SearchResult struct {
	Items  []Item `json:"items"`
	Total  int    `json:"total"`
	Limit  int    `json:"limit"`
	Offset int    `json:"offset"`
}

const union = `SELECT 'projects' type,p.id,p.title,p.description body,p.id project_id,p.title project_title,p.archived_at,p.updated_at FROM projects p WHERE p.deleted_at IS NULL UNION ALL SELECT 'tasks',o.id,o.title,(SELECT coalesce(group_concat(j.value,char(10)),'') FROM json_tree(o.body_document) j WHERE j.key IN ('text','name') AND j.type='text'),p.id,p.title,p.archived_at,o.updated_at FROM tasks o JOIN projects p ON p.id=o.project_id WHERE o.deleted_at IS NULL UNION ALL SELECT 'pages',o.id,o.title,(SELECT coalesce(group_concat(j.value,char(10)),'') FROM json_tree(o.body_document) j WHERE j.key IN ('text','name') AND j.type='text'),p.id,p.title,p.archived_at,o.updated_at FROM pages o JOIN projects p ON p.id=o.project_id WHERE o.deleted_at IS NULL UNION ALL SELECT 'events',o.id,o.title,(SELECT coalesce(group_concat(j.value,char(10)),'') FROM json_tree(o.body_document) j WHERE j.key IN ('text','name') AND j.type='text'),p.id,p.title,p.archived_at,o.updated_at FROM events o JOIN projects p ON p.id=o.project_id WHERE o.deleted_at IS NULL`

func (s *Service) Search(ctx context.Context, q string, archived bool, limit, offset int) (SearchResult, error) {
	if limit < 1 || limit > 100 || offset < 0 {
		return SearchResult{}, apperr.Invalid("分页范围无效")
	}
	v := SearchResult{Items: []Item{}, Limit: limit, Offset: offset}
	q = strings.TrimSpace(q)
	if q == "" {
		return v, nil
	}
	q = "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(q) + "%"
	where := ` WHERE (? OR archived_at IS NULL) AND (title LIKE ? ESCAPE '\' OR body LIKE ? ESCAPE '\')`
	e := s.db.QueryRowContext(ctx, "SELECT count(*) FROM ("+union+")"+where, archived, q, q).Scan(&v.Total)
	if e != nil {
		return v, e
	}
	rows, e := s.db.QueryContext(ctx, "SELECT type,id,title,project_id,project_title,archived_at IS NOT NULL,updated_at FROM ("+union+")"+where+" ORDER BY updated_at DESC,id,type LIMIT ? OFFSET ?", archived, q, q, limit, offset)
	if e != nil {
		return v, e
	}
	for rows.Next() {
		var it Item
		if e = rows.Scan(&it.Type, &it.ID, &it.Title, &it.ProjectID, &it.ProjectTitle, &it.Archived, &it.UpdatedAt); e != nil {
			rows.Close()
			return v, e
		}
		v.Items = append(v.Items, it)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return v, e
	}
	for i := range v.Items {
		if v.Items[i].Type == "pages" {
			v.Items[i].Path, e = s.path(ctx, v.Items[i].ID)
			if e != nil {
				return v, e
			}
		}
	}
	return v, nil
}
func (s *Service) path(ctx context.Context, key string) (string, error) {
	var parts []string
	seen := map[string]bool{}
	for key != "" && !seen[key] {
		seen[key] = true
		var title string
		var parent *string
		e := s.db.QueryRowContext(ctx, `SELECT title,parent_id FROM pages WHERE id=?`, key).Scan(&title, &parent)
		if e != nil {
			return "", e
		}
		parts = append([]string{title}, parts...)
		key = ""
		if parent != nil {
			key = *parent
		}
	}
	return strings.Join(parts, " / "), nil
}
func (s *Service) Visit(ctx context.Context, typ, key string) error {
	table := "projects"
	if typ == "page" {
		table = "pages"
	} else if typ != "project" {
		return apperr.Invalid("无效访问类型")
	}
	condition := " AND deleted_at IS NULL"
	if typ == "page" {
		condition = " AND deleted_at IS NULL"
	}
	var n int
	e := s.db.QueryRowContext(ctx, "SELECT 1 FROM "+table+" WHERE id=?"+condition, key).Scan(&n)
	if errors.Is(e, sql.ErrNoRows) {
		return apperr.NotFound
	}
	if e != nil {
		return e
	}
	_, e = s.db.ExecContext(ctx, `INSERT INTO recent_visits(object_type,object_id,visited_at) VALUES(?,?,?) ON CONFLICT(object_type,object_id) DO UPDATE SET visited_at=excluded.visited_at`, typ, key, s.now().UnixMilli())
	return e
}
func (s *Service) Recent(ctx context.Context, archived bool) ([]Item, error) {
	rows, e := s.db.QueryContext(ctx, `SELECT o.type,o.id,o.title,o.project_id,o.project_title,o.archived_at IS NOT NULL,r.visited_at FROM recent_visits r JOIN (`+union+`) o ON o.id=r.object_id AND o.type=CASE r.object_type WHEN 'project' THEN 'projects' ELSE 'pages' END WHERE (? OR o.archived_at IS NULL) ORDER BY r.visited_at DESC,o.id LIMIT 20`, archived)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Item{}
	for rows.Next() {
		var it Item
		if e = rows.Scan(&it.Type, &it.ID, &it.Title, &it.ProjectID, &it.ProjectTitle, &it.Archived, &it.UpdatedAt); e != nil {
			return nil, e
		}
		out = append(out, it)
	}
	return out, rows.Err()
}
