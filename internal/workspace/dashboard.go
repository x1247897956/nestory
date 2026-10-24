package workspace

import (
	"context"
	"noteapp/internal/platform/httpx"
	"time"
)

type Dashboard struct {
	Date     string `json:"date"`
	Timezone string `json:"timezone"`
	Tasks    []Item `json:"tasks"`
	Events   []Item `json:"events"`
}

// Dashboard returns open tasks across active projects and events overlapping a bounded interval.
func (s *Service) Dashboard(ctx context.Context, from, to string) (Dashboard, error) {
	v := Dashboard{Date: s.now().In(s.loc).Format("2006-01-02"), Timezone: s.loc.String(), Tasks: []Item{}, Events: []Item{}}
	a, err := time.Parse(time.RFC3339Nano, from)
	if err != nil {
		return v, httpx.Invalid("查询起始时间无效")
	}
	b, err := time.Parse(time.RFC3339Nano, to)
	if err != nil || !b.After(a) || b.Sub(a) > 366*24*time.Hour {
		return v, httpx.Invalid("查询区间必须大于零且不超过366天")
	}
	rows, err := s.db.QueryContext(ctx, `SELECT t.id,t.title,t.project_id,p.title,coalesce(a.title,''),t.stage,t.due_date FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN tasks a ON a.id=t.parent_id WHERE t.deleted_at IS NULL AND p.archived_at IS NULL AND t.stage NOT IN ('done','cancelled') ORDER BY t.due_date IS NULL,t.due_date,t.id`)
	if err != nil {
		return v, err
	}
	for rows.Next() {
		it := Item{Type: "tasks"}
		if err = rows.Scan(&it.ID, &it.Title, &it.ProjectID, &it.ProjectTitle, &it.ParentTitle, &it.Stage, &it.DueDate); err != nil {
			rows.Close()
			return v, err
		}
		v.Tasks = append(v.Tasks, it)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return v, err
	}
	rows, err = s.db.QueryContext(ctx, `SELECT e.id,e.title,e.project_id,p.title,e.start_at,e.end_at FROM events e JOIN projects p ON p.id=e.project_id WHERE e.deleted_at IS NULL AND p.archived_at IS NULL AND e.start_at<? AND e.end_at>? ORDER BY e.start_at,e.id`, b.UnixMilli(), a.UnixMilli())
	if err != nil {
		return v, err
	}
	defer rows.Close()
	for rows.Next() {
		it := Item{Type: "events"}
		var start, end int64
		if err = rows.Scan(&it.ID, &it.Title, &it.ProjectID, &it.ProjectTitle, &start, &end); err != nil {
			return v, err
		}
		it.StartAt = time.UnixMilli(start).In(s.loc).Format(time.RFC3339)
		it.EndAt = time.UnixMilli(end).In(s.loc).Format(time.RFC3339)
		v.Events = append(v.Events, it)
	}
	return v, rows.Err()
}
