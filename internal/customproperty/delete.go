package customproperty

import (
	"context"
	"database/sql"
	"encoding/json"
	"noteapp/internal/apperr"
	"noteapp/internal/object"
	"noteapp/internal/platform/clock"
	"noteapp/internal/project"
)

type DeleteInput struct {
	Version int64 `json:"version"`
}

func writableDefinition(ctx context.Context, tx *sql.Tx, key string, version int64) (object.CustomDefinition, error) {
	d, err := definition(ctx, tx, key)
	if err != nil {
		return d, err
	}
	if err = project.Writable(ctx, tx, d.ProjectID); err != nil {
		return d, err
	}
	if d.Version != version {
		return d, apperr.Conflict("属性定义已更新，请刷新后重试；输入仍保留")
	}
	return d, nil
}

// Delete removes the definition and every value, including values of trashed objects.
func (s *Service) Delete(ctx context.Context, key string, in DeleteInput) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = writableDefinition(ctx, tx, key, in.Version); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM custom_property_values WHERE definition_id=?", key); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, "DELETE FROM custom_property_definitions WHERE id=? AND version=?", key, in.Version)
	if err != nil {
		return err
	}
	if n, err := result.RowsAffected(); err != nil {
		return err
	} else if n != 1 {
		return apperr.Conflict("属性定义已更新，请刷新后重试")
	}
	return tx.Commit()
}

// DeleteOption removes one option and clears only values that reference it.
func (s *Service) DeleteOption(ctx context.Context, key, optionID string, in DeleteInput) (object.CustomDefinition, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return object.CustomDefinition{}, err
	}
	defer tx.Rollback()
	d, err := writableDefinition(ctx, tx, key, in.Version)
	if err != nil {
		return d, err
	}
	if d.Kind != "single_select" && d.Kind != "multi_select" {
		return d, apperr.Invalid("此类型不支持选项")
	}
	options := make([]object.CustomOption, 0, len(d.Options))
	found := false
	for _, option := range d.Options {
		if option.ID == optionID {
			found = true
		} else {
			options = append(options, option)
		}
	}
	if !found {
		return d, apperr.NotFound
	}
	type change struct{ objectID, value string }
	changes := []change{}
	rows, err := tx.QueryContext(ctx, "SELECT object_id,value_json FROM custom_property_values WHERE definition_id=?", key)
	if err != nil {
		return d, err
	}
	defer rows.Close()
	for rows.Next() {
		var oid, raw string
		if err = rows.Scan(&oid, &raw); err != nil {
			return d, err
		}
		if raw == "null" {
			continue
		}
		affected := false
		value := "null"
		if d.Kind == "single_select" {
			var selected string
			if err = json.Unmarshal([]byte(raw), &selected); err != nil {
				return d, err
			}
			affected = selected == optionID
		} else {
			var selected []string
			if err = json.Unmarshal([]byte(raw), &selected); err != nil {
				return d, err
			}
			kept := make([]string, 0, len(selected))
			for _, id := range selected {
				if id == optionID {
					affected = true
				} else {
					kept = append(kept, id)
				}
			}
			if len(kept) > 0 {
				encoded, e := json.Marshal(kept)
				if e != nil {
					return d, e
				}
				value = string(encoded)
			}
		}
		if affected {
			changes = append(changes, change{oid, value})
		}
	}
	if err = rows.Err(); err != nil {
		return d, err
	}
	if err = rows.Close(); err != nil {
		return d, err
	}
	now := clock.Now()
	for _, change := range changes {
		if _, err = tx.ExecContext(ctx, "UPDATE custom_property_values SET value_json=?,version=version+1,updated_at=? WHERE definition_id=? AND object_id=?", change.value, now, key, change.objectID); err != nil {
			return d, err
		}
	}
	raw, err := json.Marshal(options)
	if err != nil {
		return d, err
	}
	result, err := tx.ExecContext(ctx, "UPDATE custom_property_definitions SET options=?,version=version+1,updated_at=? WHERE id=? AND version=?", string(raw), now, key, in.Version)
	if err != nil {
		return d, err
	}
	if n, e := result.RowsAffected(); e != nil {
		return d, e
	} else if n != 1 {
		return d, apperr.Conflict("属性定义已更新，请刷新后重试")
	}
	d.Options, d.Version, d.UpdatedAt = options, d.Version+1, now
	return d, tx.Commit()
}
