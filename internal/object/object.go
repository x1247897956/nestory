// Package object defines the shared identity and fixed intrinsic properties of
// tasks, notes and events. Type-specific services retain their own validation
// and storage; properties are not user-defined fields or an EAV persistence model.
package object

import (
	"encoding/json"
	"noteapp/internal/apperr"
	"noteapp/internal/taskmeta"
)

type Type string

const (
	Task  Type = "tasks"
	Note  Type = "pages"
	Event Type = "events"
)

type PropertyDefinition struct {
	Key      string            `json:"key"`
	Label    string            `json:"label"`
	Kind     string            `json:"kind"`
	Default  any               `json:"default"`
	Mutation string            `json:"mutation"`
	Options  []taskmeta.Option `json:"options,omitempty"`
}
type Definition struct {
	Type       Type                 `json:"type"`
	Name       string               `json:"name"`
	Properties []PropertyDefinition `json:"properties"`
}

// Entity is implemented by each concrete domain object.
type Entity interface{ AsObject() Object }

// Object is a shared read view. Version tracks the native object row; relation
// changes use their own idempotent operations and do not increment that version.
type Object struct {
	BodyDocument json.RawMessage `json:"body_document"`
	ID           string          `json:"id"`
	Type         Type            `json:"type"`
	ProjectID    string          `json:"project_id"`
	Title        string          `json:"title"`
	Version      int64           `json:"version"`
	CreatedAt    int64           `json:"created_at"`
	UpdatedAt    int64           `json:"updated_at"`
	ReadOnly     bool            `json:"read_only"`
	Properties   map[string]any  `json:"properties"`
}

func Describe(typ Type) (Definition, error) {
	d := Definition{Type: typ}
	switch typ {
	case Task:
		d.Name = "任务"
		d.Properties = []PropertyDefinition{
			{Key: "stage", Label: "阶段", Kind: "stage", Default: taskmeta.DefaultStage, Mutation: "update", Options: taskmeta.StageOptions()},
			{Key: "priority", Label: "优先级", Kind: "priority", Default: taskmeta.DefaultPriority, Mutation: "update", Options: taskmeta.Priorities()},
			{Key: "due_date", Label: "截止日期", Kind: "date", Mutation: "update"},
			{Key: "parent_id", Label: "父任务", Kind: "task", Mutation: "move"},
		}
	case Note:
		d.Name = "笔记"
		d.Properties = []PropertyDefinition{{Key: "parent_id", Label: "父笔记", Kind: "note", Mutation: "move"}, {Key: "position", Label: "顺序", Kind: "number", Default: 0, Mutation: "move"}}
	case Event:
		d.Name = "日程"
		d.Properties = []PropertyDefinition{{Key: "start_at", Label: "开始时间", Kind: "datetime", Mutation: "update"}, {Key: "end_at", Label: "结束时间", Kind: "datetime", Mutation: "update"}}
	default:
		return d, apperr.Invalid("无效对象类型")
	}
	d.Properties = append(d.Properties, PropertyDefinition{Key: "relations", Label: "关联对象", Kind: "relations", Default: []any{}, Mutation: "relation"})
	return d, nil
}
