// Package object defines the shared identity and fixed intrinsic properties of
// tasks, notes and events. Type-specific services retain their own validation
// and storage; properties are not user-defined fields or an EAV persistence model.
package object

import "noteapp/internal/platform/httpx"

type Type string

const (
	Task  Type = "tasks"
	Note  Type = "pages"
	Event Type = "events"
)

type PropertyDefinition struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Kind     string `json:"kind"`
	Default  any    `json:"default"`
	Mutation string `json:"mutation"`
}
type Definition struct {
	Type       Type                 `json:"type"`
	Name       string               `json:"name"`
	Properties []PropertyDefinition `json:"properties"`
}

// Entity is implemented by each concrete domain object.
type Entity interface{ AsObject() Object }
type Object struct {
	ID         string         `json:"id"`
	Type       Type           `json:"type"`
	ProjectID  string         `json:"project_id"`
	Title      string         `json:"title"`
	Body       string         `json:"body"`
	Version    int64          `json:"version"`
	CreatedAt  int64          `json:"created_at"`
	UpdatedAt  int64          `json:"updated_at"`
	ReadOnly   bool           `json:"read_only"`
	Properties map[string]any `json:"properties"`
}

func Describe(typ Type) (Definition, error) {
	d := Definition{Type: typ}
	switch typ {
	case Task:
		d.Name = "任务"
		d.Properties = []PropertyDefinition{{"stage", "阶段", "stage", "todo", "update"}, {"priority", "优先级", "priority", "none", "update"}, {"due_date", "截止日期", "date", nil, "update"}, {"parent_id", "父任务", "task", nil, "move"}}
	case Note:
		d.Name = "笔记"
		d.Properties = []PropertyDefinition{{"parent_id", "父笔记", "note", nil, "move"}, {"position", "顺序", "number", 0, "move"}}
	case Event:
		d.Name = "日程"
		d.Properties = []PropertyDefinition{{"start_at", "开始时间", "datetime", nil, "update"}, {"end_at", "结束时间", "datetime", nil, "update"}}
	default:
		return d, httpx.Invalid("无效对象类型")
	}
	d.Properties = append(d.Properties, PropertyDefinition{"relations", "关联对象", "relations", []any{}, "relation"})
	return d, nil
}
