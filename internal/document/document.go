// Package document owns the versioned block document shared by all object types.
package document

import (
	"bytes"
	"encoding/json"
	"noteapp/internal/apperr"
)

// Empty returns a fresh empty block document.
func Empty() json.RawMessage { return json.RawMessage(`{"version":1,"blocks":[]}`) }

// Apply updates the only source of body content. Omission preserves an existing
// document; creation without content gets an empty block document. Explicit null
// is rejected. Callers persist this inside the object's versioned transaction.
func Apply(blocks *json.RawMessage, input json.RawMessage) error {
	if len(input) == 0 {
		if len(*blocks) == 0 {
			*blocks = Empty()
		}
		return nil
	}
	if err := Validate(input); err != nil {
		return err
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, input); err != nil {
		return apperr.Invalid("无效块正文")
	}
	*blocks = append(json.RawMessage(nil), compact.Bytes()...)
	return nil
}

// Validate bounds document shape and depth without stripping library-owned props.
func Validate(raw json.RawMessage) error {
	invalid := apperr.Invalid("无效块正文：需要 version=1 和有效 blocks")
	if len(raw) > 2<<20 {
		return apperr.Invalid("块正文超过 2 MiB")
	}
	var doc struct {
		Version int               `json:"version"`
		Blocks  []json.RawMessage `json:"blocks"`
	}
	if json.Unmarshal(raw, &doc) != nil || doc.Version != 1 || doc.Blocks == nil {
		return invalid
	}
	ids := map[string]bool{}
	var walk func([]json.RawMessage, int) bool
	count := 0
	walk = func(nodes []json.RawMessage, depth int) bool {
		if depth > 32 {
			return false
		}
		for _, raw := range nodes {
			count++
			if count > 10000 {
				return false
			}
			var b struct {
				ID       string            `json:"id"`
				Type     string            `json:"type"`
				Props    map[string]any    `json:"props"`
				Content  json.RawMessage   `json:"content"`
				Children []json.RawMessage `json:"children"`
			}
			if json.Unmarshal(raw, &b) != nil || b.ID == "" || ids[b.ID] {
				return false
			}
			switch b.Type {
			case "paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem", "codeBlock", "table", "image", "video", "audio", "file", "quote", "divider":
			default:
				return false
			}
			ids[b.ID] = true
			if b.Type == "table" {
				if !validTable(b.Content) {
					return false
				}
			} else if b.Type == "image" || b.Type == "video" || b.Type == "audio" || b.Type == "file" || b.Type == "divider" {
				if len(b.Content) > 0 && string(b.Content) != "null" {
					return false
				}
			} else if len(b.Content) > 0 && !validInline(b.Content, true) {
				return false
			}

			if !walk(b.Children, depth+1) {
				return false
			}
		}
		return true
	}
	if !walk(doc.Blocks, 0) {
		return invalid
	}
	return nil
}

// BlockNote's default inline schema contains styled text and links. Keeping
// these checks here prevents persisting a document the UI cannot reopen.
func validInline(raw json.RawMessage, links bool) bool {
	var items []json.RawMessage
	if json.Unmarshal(raw, &items) != nil || items == nil {
		return false
	}
	for _, raw := range items {
		var item struct {
			Type    string          `json:"type"`
			Text    *string         `json:"text"`
			Styles  map[string]any  `json:"styles"`
			Href    *string         `json:"href"`
			Content json.RawMessage `json:"content"`
		}
		if json.Unmarshal(raw, &item) != nil {
			return false
		}
		switch item.Type {
		case "text":
			if item.Text == nil {
				return false
			}
			for _, v := range item.Styles {
				switch v.(type) {
				case bool, string:
				default:
					return false
				}
			}
		case "link":
			if !links || item.Href == nil || !validInline(item.Content, false) {
				return false
			}
		default:
			return false
		}
	}
	return true
}
func validTable(raw json.RawMessage) bool {
	var table struct {
		Type string `json:"type"`
		Rows []struct {
			Cells []json.RawMessage `json:"cells"`
		} `json:"rows"`
	}
	if json.Unmarshal(raw, &table) != nil || table.Type != "tableContent" || len(table.Rows) == 0 {
		return false
	}
	for _, row := range table.Rows {
		if len(row.Cells) == 0 {
			return false
		}
		for _, raw := range row.Cells {
			if validInline(raw, true) {
				continue
			}
			var cell struct {
				Type    string          `json:"type"`
				Content json.RawMessage `json:"content"`
				Props   map[string]any  `json:"props"`
			}
			if json.Unmarshal(raw, &cell) != nil || cell.Type != "tableCell" || !validInline(cell.Content, true) {
				return false
			}
		}
	}
	return true
}
