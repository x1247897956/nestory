package app

import (
	"context"
	"database/sql"
	"net/http"

	"noteapp/internal/asset"
	"noteapp/internal/customproperty"
	"noteapp/internal/event"
	"noteapp/internal/object"
	"noteapp/internal/objectquery"
	"noteapp/internal/page"
	"noteapp/internal/platform/config"
	"noteapp/internal/platform/httpx"
	"noteapp/internal/project"
	"noteapp/internal/relation"
	"noteapp/internal/task"
	"noteapp/internal/trash"
	"noteapp/internal/workspace"
)

// New assembles the modular monolith with explicit constructors. HTTP handlers
// translate requests; each business service continues to own its transactions.
func New(db *sql.DB, c config.Config) http.Handler {
	mux := http.NewServeMux()
	p := project.New(db)
	t := task.New(db)
	pg := page.New(db)
	events := event.New(db)
	relations := relation.New(db)
	properties := customproperty.New(db)
	assets := asset.New(db, c.DataDir, c.UploadLimit)
	mux.HandleFunc("POST /api/v1/projects/{id}/assets", assets.UploadHTTP)
	mux.HandleFunc("GET /api/v1/assets/{id}", assets.Download)
	registerStatus(mux, db, c)
	registerProjects(mux, p)
	registerTasks(mux, t)
	registerPages(mux, pg)
	registerEvents(mux, events)
	registerRelations(mux, relations)
	registerTrash(mux, trash.New(db))
	registerWorkspace(mux, workspace.New(db, c.Timezone, nil))
	registerCustomProperties(mux, properties)
	registerObjects(mux, objectquery.New(map[object.Type]objectquery.Reader{
		object.Task: func(ctx context.Context, id string) (object.Object, error) {
			v, err := t.Get(ctx, id)
			return v.AsObject(), err
		},
		object.Note: func(ctx context.Context, id string) (object.Object, error) {
			v, err := pg.Get(ctx, id)
			return v.AsObject(), err
		},
		object.Event: func(ctx context.Context, id string) (object.Object, error) {
			v, err := events.Get(ctx, id)
			return v.AsObject(), err
		},
	}, func(ctx context.Context, pid string) (bool, error) {
		v, err := p.Get(ctx, pid)
		return v.ArchivedAt != nil, err
	}, relations.List, func(ctx context.Context, typ object.Type, id string) ([]object.CustomProperty, error) {
		v, e := properties.Fields(ctx, typ, id)
		return v.Fields, e
	}))
	registerFrontend(mux)
	return protectRequests(httpx.CompressJSON(mux), c)
}
func respond(w http.ResponseWriter, status int, v any, err error) {
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	httpx.JSON(w, status, v)
}
