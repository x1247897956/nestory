package task

import "noteapp/internal/object"

var _ object.Entity = Task{}

func (t Task) AsObject() object.Object {
	return object.Object{ID: t.ID, Type: object.Task, ProjectID: t.ProjectID, Title: t.Title, Body: t.Body, BodyDocument: t.BodyDocument, LegacyBody: t.LegacyBody, Version: t.Version, CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt, Properties: map[string]any{"stage": t.Stage, "priority": t.Priority, "due_date": t.DueDate, "parent_id": t.ParentID}}
}
