// Package document owns the versioned block document shared by all object types.
package document

import (
	"bytes"
	"encoding/json"
	"math"
	"noteapp/internal/apperr"
)

const MaxBytes = 2 << 20

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
	if len(raw) > MaxBytes {
		return apperr.TooLarge("正文超过 2 MiB，请缩减内容或拆分为多篇笔记")
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
			if !validProps(b.Type, b.Props) {
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
			for key, v := range item.Styles {
				switch key {
				case "bold", "italic", "underline", "strike", "code":
					if _, ok := v.(bool); !ok {
						return false
					}
				case "textColor", "backgroundColor":
					if _, ok := v.(string); !ok {
						return false
					}
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

// These schemas mirror @blocknote/core 0.56.0 src/blocks default specs.
// Reject unsupported schema-owned properties; Apply retains the original JSON.
func validProps(kind string, props map[string]any) bool {
	allowed := map[string]string{}
	add := func(keys ...string) {
		for _, key := range keys {
			allowed[key] = "string"
		}
	}
	switch kind {
	case "paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem", "tableCell":
		add("backgroundColor", "textColor", "textAlignment")
	case "quote":
		add("backgroundColor", "textColor")
	case "image", "video":
		add("backgroundColor", "textAlignment", "name", "url", "caption")
		allowed["showPreview"] = "bool"
		allowed["previewWidth"] = "positive"
	case "audio":
		add("backgroundColor", "name", "url", "caption")
		allowed["showPreview"] = "bool"
	case "file":
		add("backgroundColor", "name", "url", "caption")
	case "codeBlock":
		add("language")
	case "table":
		add("textColor")
	}
	switch kind {
	case "heading":
		allowed["level"] = "level"
		allowed["isToggleable"] = "bool"
	case "numberedListItem":
		allowed["start"] = "integer"
	case "checkListItem":
		allowed["checked"] = "bool"
	case "tableCell":
		allowed["colspan"] = "span"
		allowed["rowspan"] = "span"
	}
	for key, v := range props {
		switch allowed[key] {
		case "string":
			if _, ok := v.(string); !ok {
				return false
			}
		case "bool":
			if _, ok := v.(bool); !ok {
				return false
			}
		case "positive", "integer", "level", "span":
			n, ok := v.(float64)
			if !ok || math.IsInf(n, 0) || math.IsNaN(n) {
				return false
			}
			if allowed[key] == "positive" {
				if n <= 0 {
					return false
				}
			} else if n != math.Trunc(n) || math.Abs(n) > 9007199254740991 {
				return false
			}
			if allowed[key] == "level" && (n < 1 || n > 6) {
				return false
			}
			if allowed[key] == "span" && (n < 1 || n > 10000) {
				return false
			}
		default:
			return false
		}
		if key == "textAlignment" && v != "left" && v != "center" && v != "right" && v != "justify" {
			return false
		}
	}
	return true
}
func validTable(raw json.RawMessage) bool {
	var table struct {
		Type         string            `json:"type"`
		HeaderRows   *int              `json:"headerRows"`
		HeaderCols   *int              `json:"headerCols"`
		ColumnWidths []json.RawMessage `json:"columnWidths"`
		Rows         []struct {
			Cells []json.RawMessage `json:"cells"`
		} `json:"rows"`
	}
	if json.Unmarshal(raw, &table) != nil || table.Type != "tableContent" || len(table.Rows) == 0 {
		return false
	}
	// Bound expanded geometry before allocating. Row/column spans occupy a grid,
	// so merged tables can legitimately contain different numbers of cells per row.
	grid := make([]map[int]bool, len(table.Rows))
	for i := range grid {
		grid[i] = map[int]bool{}
	}
	width := 0
	total := 0
	for r, row := range table.Rows {
		// ProseMirror tableRow requires at least one physical cell, even when
		// earlier rowspans cover the entire logical row.
		if len(row.Cells) == 0 {
			return false
		}
		c := 0
		for _, raw := range row.Cells {
			for grid[r][c] {
				c++
			}
			cs, rs := 1, 1
			if !validInline(raw, true) {
				var cell struct {
					Type    string          `json:"type"`
					Content json.RawMessage `json:"content"`
					Props   map[string]any  `json:"props"`
				}
				if json.Unmarshal(raw, &cell) != nil || cell.Type != "tableCell" || !validInline(cell.Content, true) || !validProps("tableCell", cell.Props) {
					return false
				}
				if n, ok := cell.Props["colspan"].(float64); ok {
					cs = int(n)
				}
				if n, ok := cell.Props["rowspan"].(float64); ok {
					rs = int(n)
				}
			}
			if r+rs > len(grid) || c+cs > 10000 || cs*rs > 10000-total {
				return false
			}
			total += cs * rs
			for y := r; y < r+rs; y++ {
				for x := c; x < c+cs; x++ {
					if grid[y][x] {
						return false
					}
					grid[y][x] = true
				}
			}
			c += cs
		}
		if len(grid[r]) == 0 {
			return false
		}
		if r == 0 {
			width = len(grid[r])
		}
		if len(grid[r]) != width {
			return false
		}
	}
	for _, n := range []*int{table.HeaderRows, table.HeaderCols} {
		if n != nil && *n < 0 {
			return false
		}
	}
	if table.HeaderRows != nil && *table.HeaderRows > len(grid) || table.HeaderCols != nil && *table.HeaderCols > width {
		return false
	}
	if table.ColumnWidths != nil && len(table.ColumnWidths) != width {
		return false
	}
	for _, raw := range table.ColumnWidths {
		if string(raw) == "null" {
			continue
		}
		var n float64
		if json.Unmarshal(raw, &n) != nil || n <= 0 || math.IsInf(n, 0) || math.IsNaN(n) {
			return false
		}
	}
	return true
}
