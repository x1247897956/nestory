package page

import "noteapp/internal/object"

var _ object.Entity = Page{}

func (t Page) AsObject() object.Object {
	return object.Object{ID: t.ID, Type: object.Note, ProjectID: t.ProjectID, Title: t.Title, Body: t.Body, Version: t.Version, CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt, Properties: map[string]any{"parent_id": t.ParentID, "position": t.Position}}
}
