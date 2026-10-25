package customproperty

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/url"
	"noteapp/internal/apperr"
	"noteapp/internal/object"
	"noteapp/internal/platform/clock"
	"noteapp/internal/project"
	"strings"
	"unicode/utf8"
)

type ValueInput struct {
	Version           int64           `json:"version"`
	DefinitionVersion int64           `json:"definition_version"`
	Value             json.RawMessage `json:"value"`
}

func validateValue(d object.CustomDefinition, raw json.RawMessage) (json.RawMessage, error) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || !json.Valid(raw) || !utf8.Valid(raw) {
		return nil, apperr.Invalid("属性值不是有效JSON")
	}
	if string(raw) == "null" {
		return json.RawMessage("null"), nil
	}
	contains := func(id string) bool {
		for _, o := range d.Options {
			if o.ID == id {
				return true
			}
		}
		return false
	}
	var value any
	switch d.Kind {
	case "text", "url", "single_select":
		var text string
		if e := json.Unmarshal(raw, &text); e != nil {
			return nil, apperr.Invalid("此属性需要文本值")
		}
		if d.Kind == "url" {
			text = strings.TrimSpace(text)
		}
		if text == "" {
			return json.RawMessage("null"), nil
		}
		switch d.Kind {
		case "text":
			if utf8.RuneCountInString(text) > 4000 {
				return nil, apperr.Invalid("文本不能超过4000个字符")
			}
		case "url":
			u, e := url.ParseRequestURI(text)
			if u != nil {
				u.Scheme = strings.ToLower(u.Scheme)
			}
			if e != nil || u.Hostname() == "" || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil || utf8.RuneCountInString(text) > 2048 {
				return nil, apperr.Invalid("请输入完整HTTP或HTTPS网址（最长2048字符，不含账号密码）")
			}
		case "single_select":
			if !contains(text) {
				return nil, apperr.Invalid("选项不属于此属性")
			}
		}
		value = text
	case "multi_select":
		var selections []string
		if e := json.Unmarshal(raw, &selections); e != nil || len(selections) > 100 {
			return nil, apperr.Invalid("多选值需要选项ID数组")
		}
		seen := map[string]bool{}
		for _, key := range selections {
			if !contains(key) || seen[key] {
				return nil, apperr.Invalid("选项不存在或重复")
			}
			seen[key] = true
		}
		if len(selections) == 0 {
			return json.RawMessage("null"), nil
		}
		value = selections
	default:
		return nil, apperr.Invalid("无效属性类型")
	}
	return json.Marshal(value)
}
func (s *Service) Set(ctx context.Context, typ object.Type, oid, did string, in ValueInput) (object.CustomProperty, error) {
	var out object.CustomProperty
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return out, e
	}
	defer tx.Rollback()
	pid, e := objectProject(ctx, tx, typ, oid)
	if e != nil {
		return out, e
	}
	if e = project.Writable(ctx, tx, pid); e != nil {
		return out, e
	}
	d, e := definition(ctx, tx, did)
	if e != nil {
		return out, e
	}
	if d.ProjectID != pid || d.ObjectType != typ {
		return out, apperr.Conflict("属性不属于此项目和对象类型")
	}
	if in.DefinitionVersion != d.Version {
		return out, apperr.Conflict("属性定义已更新，请刷新属性后重试；输入仍保留")
	}
	value, e := validateValue(d, in.Value)
	if e != nil {
		return out, e
	}
	var version int64
	e = tx.QueryRowContext(ctx, "SELECT version FROM custom_property_values WHERE definition_id=? AND object_id=?", did, oid).Scan(&version)
	if e != nil && !errors.Is(e, sql.ErrNoRows) {
		return out, e
	}
	if in.Version != version {
		return out, apperr.Conflict("属性值已更新，请重新载入或复制本机输入后处理冲突")
	}
	var taskID, pageID, eventID any
	switch typ {
	case object.Task:
		taskID = oid
	case object.Note:
		pageID = oid
	case object.Event:
		eventID = oid
	}
	_, e = tx.ExecContext(ctx, `INSERT INTO custom_property_values(definition_id,project_id,object_type,object_id,task_id,page_id,event_id,value_json,version,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(definition_id,object_id) DO UPDATE SET value_json=excluded.value_json,version=excluded.version,updated_at=excluded.updated_at`, did, pid, typ, oid, taskID, pageID, eventID, string(value), version+1, clock.Now())
	if e != nil {
		return out, e
	}
	out = object.CustomProperty{Definition: d, Value: value, Version: version + 1}
	return out, tx.Commit()
}
