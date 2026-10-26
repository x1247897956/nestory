package customproperty

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"noteapp/internal/apperr"
	"noteapp/internal/idempotency"
	"noteapp/internal/object"
	"noteapp/internal/platform/clock"
	"noteapp/internal/platform/id"
	"noteapp/internal/project"
	"strings"
	"unicode"
	"unicode/utf8"
)

type CreateInput struct {
	RequestID     string `json:"request_id,omitempty"`
	Kind          string `json:"kind,omitempty"`
	SourceID      string `json:"source_id,omitempty"`
	SourceVersion int64  `json:"source_version,omitempty"`
	Name          string `json:"name,omitempty"`
}
type UpdateInput struct {
	Version int64                  `json:"version"`
	Name    *string                `json:"name"`
	Options *[]object.CustomOption `json:"options"`
}

var kindNames = map[string]string{"text": "文本", "single_select": "单选", "multi_select": "多选", "url": "网址"}

func validName(name string, typ object.Type) error {
	if !utf8.ValidString(name) || strings.TrimSpace(name) == "" || utf8.RuneCountInString(name) > 80 {
		return apperr.Invalid("属性名称须为1–80个字符")
	}
	for _, r := range name {
		if unicode.IsControl(r) {
			return apperr.Invalid("属性名称不能包含控制字符")
		}
	}
	d, e := object.Describe(typ)
	if e != nil {
		return e
	}
	key := strings.ToLower(name)
	for _, p := range d.Properties {
		if key == strings.ToLower(p.Label) || key == p.Key {
			return apperr.Invalid("名称不能与固有属性重复")
		}
	}
	return nil
}
func uniqueName(ctx context.Context, tx *sql.Tx, pid string, typ object.Type, name, except string) error {
	var count int
	err := tx.QueryRowContext(ctx, "SELECT count(*) FROM custom_property_definitions WHERE project_id=? AND object_type=? AND name_key=? AND id<>?", pid, typ, strings.ToLower(name), except).Scan(&count)
	if err != nil {
		return err
	}
	if count > 0 {
		return apperr.Conflict("同类型已有此名称的属性")
	}
	return nil
}
func (s *Service) Create(ctx context.Context, pid string, typ object.Type, in CreateInput) (object.CustomDefinition, error) {
	if _, e := object.Describe(typ); e != nil {
		return object.CustomDefinition{}, e
	}
	if _, ok := kindNames[in.Kind]; in.SourceID == "" && !ok {
		return object.CustomDefinition{}, apperr.Invalid("无效属性类型")
	}
	key := in.RequestID
	in.RequestID = ""
	return idempotency.Create(ctx, s.db, key, "custom-property:"+pid+":"+string(typ), in, func(tx *sql.Tx) (object.CustomDefinition, error) {
		var d object.CustomDefinition
		if e := project.Writable(ctx, tx, pid); e != nil {
			return d, e
		}
		options := []object.CustomOption{}
		kind, requestedName := in.Kind, in.Name
		if in.SourceID != "" {
			if in.Kind != "" || in.Name != "" {
				return d, apperr.Invalid("复用时不能同时指定新类型或名称")
			}
			source, err := definition(ctx, tx, in.SourceID)
			if err != nil {
				return d, err
			}
			if source.ProjectID != pid || source.ObjectType == typ {
				return d, apperr.Invalid("只能复用同项目其他对象类型的属性")
			}
			if source.Version != in.SourceVersion {
				return d, apperr.Conflict("来源属性已更新，请重新选择")
			}
			kind, requestedName, options = source.Kind, source.Name, source.Options
		} else if in.SourceVersion != 0 {
			return d, apperr.Invalid("缺少来源属性")
		}
		var count int
		if e := tx.QueryRowContext(ctx, "SELECT count(*) FROM custom_property_definitions WHERE project_id=? AND object_type=?", pid, typ).Scan(&count); e != nil {
			return d, e
		}
		if count >= 64 {
			return d, apperr.Invalid("每种对象最多64个自定义属性")
		}
		name := strings.TrimSpace(requestedName)
		if name == "" {
			name = kindNames[kind]
			for i := 2; ; i++ {
				if e := uniqueName(ctx, tx, pid, typ, name, ""); e == nil {
					break
				} else if _, ok := e.(*apperr.Error); !ok {
					return d, e
				}
				name = fmt.Sprintf("%s %d", kindNames[kind], i)
			}
		}
		if e := validName(name, typ); e != nil {
			return d, e
		}
		if e := uniqueName(ctx, tx, pid, typ, name, ""); e != nil {
			return d, e
		}
		key, e := id.New()
		if e != nil {
			return d, e
		}
		now := clock.Now()
		d = object.CustomDefinition{ID: key, ProjectID: pid, ObjectType: typ, Name: name, Kind: kind, Options: options, Version: 1, CreatedAt: now, UpdatedAt: now}
		raw, e := json.Marshal(options)
		if e != nil {
			return d, e
		}
		_, e = tx.ExecContext(ctx, "INSERT INTO custom_property_definitions(id,project_id,object_type,name,name_key,kind,options,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", key, pid, typ, name, strings.ToLower(name), kind, string(raw), now, now)
		return d, e
	})
}
func validateOptions(old, options []object.CustomOption) error {
	if len(options) > 100 {
		return apperr.Invalid("最多100个选项")
	}
	ids, names := map[string]bool{}, map[string]bool{}
	for _, o := range options {
		switch o.Color {
		case "", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red":
		default:
			return apperr.Invalid("无效选项颜色")
		}
		if o.ID == "" || len(o.ID) > 64 || !utf8.ValidString(o.ID) || !utf8.ValidString(o.Name) || strings.TrimSpace(o.Name) != o.Name || o.Name == "" || utf8.RuneCountInString(o.Name) > 80 {
			return apperr.Invalid("选项ID或名称无效")
		}
		for _, c := range o.ID {
			if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-') {
				return apperr.Invalid("选项ID无效")
			}
		}
		for _, r := range o.Name {
			if unicode.IsControl(r) {
				return apperr.Invalid("选项名称不能包含控制字符")
			}
		}
		key := strings.ToLower(o.Name)
		if ids[o.ID] || names[key] {
			return apperr.Invalid("选项ID和名称不能重复")
		}
		ids[o.ID] = true
		names[key] = true
	}
	for _, o := range old {
		if !ids[o.ID] {
			return apperr.Invalid("选项暂不支持删除，可重命名")
		}
	}
	return nil
}
func (s *Service) Update(ctx context.Context, key string, in UpdateInput) (object.CustomDefinition, error) {
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return object.CustomDefinition{}, e
	}
	defer tx.Rollback()
	d, e := definition(ctx, tx, key)
	if e != nil {
		return d, e
	}
	if e = project.Writable(ctx, tx, d.ProjectID); e != nil {
		return d, e
	}
	if d.Version != in.Version {
		return d, apperr.Conflict("属性定义已更新，请刷新后重试；输入仍保留")
	}
	if in.Name != nil {
		d.Name = strings.TrimSpace(*in.Name)
		if e = validName(d.Name, d.ObjectType); e != nil {
			return d, e
		}
		if e = uniqueName(ctx, tx, d.ProjectID, d.ObjectType, d.Name, d.ID); e != nil {
			return d, e
		}
	}
	if in.Options != nil {
		if d.Kind != "single_select" && d.Kind != "multi_select" {
			return d, apperr.Invalid("此类型不支持选项")
		}
		if e = validateOptions(d.Options, *in.Options); e != nil {
			return d, e
		}
		d.Options = *in.Options
	}
	raw, e := json.Marshal(d.Options)
	if e != nil {
		return d, e
	}
	d.UpdatedAt = clock.Now()
	d.Version++
	_, e = tx.ExecContext(ctx, "UPDATE custom_property_definitions SET name=?,name_key=?,options=?,version=?,updated_at=? WHERE id=?", d.Name, strings.ToLower(d.Name), string(raw), d.Version, d.UpdatedAt, key)
	if e != nil {
		return d, e
	}
	return d, tx.Commit()
}
