package event

import "noteapp/internal/object"

var _ object.Entity = Event{}

func (t Event) AsObject() object.Object {
	return object.Object{ID: t.ID, Type: object.Event, ProjectID: t.ProjectID, Title: t.Title, Body: t.Body, Version: t.Version, CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt, Properties: map[string]any{"start_at": t.StartAt, "end_at": t.EndAt}}
}
