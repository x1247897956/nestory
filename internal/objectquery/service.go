// Package objectquery assembles a shared object view from concrete business services.
// It does not own writes: content, moves, links and deletion retain their native transactions.
package objectquery

import (
	"context"
	"maps"
	"noteapp/internal/apperr"
	"noteapp/internal/object"
	"noteapp/internal/relation"
)

type Reader func(context.Context, string) (object.Object, error)
type ProjectState func(context.Context, string) (bool, error)
type RelationReader func(context.Context, string, string) ([]relation.Item, error)
type CustomPropertyReader func(context.Context, object.Type, string) ([]object.CustomProperty, error)
type Service struct {
	custom    CustomPropertyReader
	readers   map[object.Type]Reader
	archived  ProjectState
	relations RelationReader
}

func New(readers map[object.Type]Reader, archived ProjectState, relations RelationReader, custom CustomPropertyReader) *Service {
	s := &Service{readers: maps.Clone(readers), archived: archived, relations: relations}
	s.custom = custom
	return s
}
func (s *Service) Get(ctx context.Context, typ object.Type, id string) (object.Object, error) {
	if _, err := object.Describe(typ); err != nil {
		return object.Object{}, err
	}
	read, ok := s.readers[typ]
	if !ok {
		return object.Object{}, apperr.Invalid("不支持的对象类型")
	}
	v, err := read(ctx, id)
	if err != nil {
		return object.Object{}, err
	}
	v.ReadOnly, err = s.archived(ctx, v.ProjectID)
	if err != nil {
		return object.Object{}, err
	}
	links, err := s.relations(ctx, string(typ), id)
	if err != nil {
		return object.Object{}, err
	}
	if v.Properties == nil {
		v.Properties = map[string]any{}
	}
	v.Properties["relations"] = links
	v.CustomProperties = []object.CustomProperty{}
	if s.custom != nil {
		v.CustomProperties, err = s.custom(ctx, typ, id)
		if err != nil {
			return object.Object{}, err
		}
	}
	return v, nil
}
