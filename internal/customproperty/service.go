// Package customproperty owns project/type-scoped field definitions and independent values.
package customproperty

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"noteapp/internal/apperr"
	"noteapp/internal/object"
	"noteapp/internal/project"
)

type Service struct{ db *sql.DB }

func New(db *sql.DB) *Service { return &Service{db: db} }

type query interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

const columns = "id,project_id,object_type,name,kind,options,version,created_at,updated_at"

type scanner interface{ Scan(...any) error }

func scanDefinition(row scanner) (object.CustomDefinition, error) {
	var d object.CustomDefinition
	var options string
	err := row.Scan(&d.ID, &d.ProjectID, &d.ObjectType, &d.Name, &d.Kind, &options, &d.Version, &d.CreatedAt, &d.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return d, apperr.NotFound
	}
	if err != nil {
		return d, err
	}
	err = json.Unmarshal([]byte(options), &d.Options)
	return d, err
}
func definition(ctx context.Context, q query, id string) (object.CustomDefinition, error) {
	return scanDefinition(q.QueryRowContext(ctx, "SELECT "+columns+" FROM custom_property_definitions WHERE id=?", id))
}
func definitions(ctx context.Context, q query, pid string, typ object.Type) ([]object.CustomDefinition, error) {
	rows, err := q.QueryContext(ctx, "SELECT "+columns+" FROM custom_property_definitions WHERE project_id=? AND object_type=? ORDER BY created_at,id", pid, typ)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []object.CustomDefinition{}
	for rows.Next() {
		d, e := scanDefinition(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
func (s *Service) Definitions(ctx context.Context, pid string, typ object.Type) ([]object.CustomDefinition, error) {
	if _, err := object.Describe(typ); err != nil {
		return nil, err
	}
	if _, err := project.Read(ctx, s.db, pid); err != nil {
		return nil, err
	}
	return definitions(ctx, s.db, pid, typ)
}
func objectProject(ctx context.Context, q query, typ object.Type, id string) (string, error) {
	if _, err := object.Describe(typ); err != nil {
		return "", err
	}
	var pid string
	err := q.QueryRowContext(ctx, "SELECT project_id FROM "+string(typ)+" WHERE id=? AND deleted_at IS NULL", id).Scan(&pid)
	if errors.Is(err, sql.ErrNoRows) {
		err = apperr.NotFound
	}
	return pid, err
}

type View struct {
	Fields   []object.CustomProperty `json:"fields"`
	ReadOnly bool                    `json:"read_only"`
}

func (s *Service) Fields(ctx context.Context, typ object.Type, id string) (View, error) {
	// A read transaction makes definitions, versions and values one coherent snapshot.
	out := View{Fields: []object.CustomProperty{}}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return out, err
	}
	defer tx.Rollback()
	pid, err := objectProject(ctx, tx, typ, id)
	if err != nil {
		return out, err
	}
	p, err := project.Read(ctx, tx, pid)
	if err != nil {
		return out, err
	}
	out.ReadOnly = p.ArchivedAt != nil
	defs, err := definitions(ctx, tx, pid, typ)
	if err != nil {
		return out, err
	}
	for _, d := range defs {
		field := object.CustomProperty{Definition: d, Value: json.RawMessage("null")}
		var raw string
		err = tx.QueryRowContext(ctx, "SELECT value_json,version FROM custom_property_values WHERE definition_id=? AND object_id=?", d.ID, id).Scan(&raw, &field.Version)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return out, err
		}
		if err == nil {
			field.Value = json.RawMessage(raw)
		}
		out.Fields = append(out.Fields, field)
	}
	return out, tx.Commit()
}
