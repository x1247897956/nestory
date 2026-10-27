package customproperty

import (
	"context"
	"encoding/json"
	"noteapp/internal/object"
	"noteapp/internal/project"
)

// Snapshot is a coherent project/type-scoped catalog and sparse value map.
// Missing entries mean null; soft-deleted objects are deliberately excluded.
type Snapshot struct {
	Definitions []object.CustomDefinition             `json:"definitions"`
	Values      map[string]map[string]json.RawMessage `json:"values"`
}

func (s *Service) Snapshot(ctx context.Context, pid string, typ object.Type) (Snapshot, error) {
	out := Snapshot{Definitions: []object.CustomDefinition{}, Values: map[string]map[string]json.RawMessage{}}
	if _, err := object.Describe(typ); err != nil {
		return out, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return out, err
	}
	defer tx.Rollback()
	if _, err = project.Read(ctx, tx, pid); err != nil {
		return out, err
	}
	out.Definitions, err = definitions(ctx, tx, pid, typ)
	if err != nil {
		return out, err
	}
	// typ is an allowlisted native table name, never arbitrary request SQL.
	rows, err := tx.QueryContext(ctx, `SELECT v.object_id,v.definition_id,v.value_json FROM custom_property_values v JOIN `+string(typ)+` o ON o.id=v.object_id AND o.project_id=v.project_id WHERE v.project_id=? AND v.object_type=? AND o.deleted_at IS NULL ORDER BY v.object_id,v.definition_id`, pid, typ)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, property, raw string
		if err = rows.Scan(&id, &property, &raw); err != nil {
			return out, err
		}
		if out.Values[id] == nil {
			out.Values[id] = map[string]json.RawMessage{}
		}
		out.Values[id][property] = json.RawMessage(raw)
	}
	if err = rows.Err(); err != nil {
		return out, err
	}
	if err = rows.Close(); err != nil {
		return out, err
	}
	return out, tx.Commit()
}
