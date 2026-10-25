package document

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestPinnedSchemaRejectsUnsafeValues(t *testing.T) {
	for _, block := range []string{
		`{"id":"a","type":"paragraph","content":[{"type":"text","text":"x","styles":{"unknown":true}}]}`,
		`{"id":"a","type":"paragraph","props":{"textAlignment":"sideways"}}`,
		`{"id":"a","type":"table","content":{"type":"tableContent","headerRows":4294967296,"rows":[{"cells":[[]]}]}}`,
		`{"id":"a","type":"table","content":{"type":"tableContent","rows":[{"cells":[[],[]]},{"cells":[[]]}]}}`,
	} {
		if Validate(json.RawMessage(`{"version":1,"blocks":[`+block+`]}`)) == nil {
			t.Errorf("accepted %s", block)
		}
	}
}

func TestPinnedSchemaCorpusPreserved(t *testing.T) {
	raw, err := os.ReadFile("testdata/blocknote-0.56.0.json")
	if err != nil {
		t.Fatal(err)
	}
	var stored json.RawMessage
	if err := Apply(&stored, raw); err != nil {
		t.Fatal(err)
	}
	var before, after any
	json.Unmarshal(raw, &before)
	json.Unmarshal(stored, &after)
	if !reflect.DeepEqual(before, after) {
		t.Fatal("schema values were stripped")
	}
}

func TestSchemaPropertyTypesAndGeometry(t *testing.T) {
	for _, tc := range []struct{ kind, props string }{
		{"paragraph", `{"textColor":true}`}, {"paragraph", `{"unknown":"x"}`},
		{"heading", `{"level":0}`}, {"heading", `{"level":7}`}, {"heading", `{"level":1.5}`}, {"heading", `{"isToggleable":"yes"}`},
		{"checkListItem", `{"checked":1}`}, {"numberedListItem", `{"start":1.5}`},
		{"codeBlock", `{"language":5}`}, {"image", `{"previewWidth":0}`}, {"video", `{"showPreview":"yes"}`}, {"file", `{"url":{}}`},
	} {
		raw := `{"version":1,"blocks":[{"id":"x","type":"` + tc.kind + `","props":` + tc.props + `}]}`
		if Validate(json.RawMessage(raw)) == nil {
			t.Errorf("accepted %s", raw)
		}
	}
	for _, style := range []string{`{"bold":"yes"}`, `{"textColor":true}`, `{"code":5}`, `{"strike":null}`} {
		raw := `{"version":1,"blocks":[{"id":"x","type":"paragraph","content":[{"type":"text","text":"x","styles":` + style + `}]}]}`
		if Validate(json.RawMessage(raw)) == nil {
			t.Errorf("accepted %s", raw)
		}
	}
	for _, table := range []string{
		`{"rows":[{"cells":[{"type":"tableCell","props":{"rowspan":2},"content":[]}]},{"cells":[]}]}`,
		`{"headerRows":-1,"rows":[{"cells":[[]]}]}`, `{"headerRows":1.5,"rows":[{"cells":[[]]}]}`, `{"headerRows":2,"rows":[{"cells":[[]]}]}`,
		`{"headerCols":2,"rows":[{"cells":[[]]}]}`, `{"columnWidths":[0],"rows":[{"cells":[[]]}]}`, `{"columnWidths":[],"rows":[{"cells":[[]]}]}`, `{"columnWidths":[1,2],"rows":[{"cells":[[]]}]}`,
		`{"rows":[{"cells":[{"type":"tableCell","props":{"rowspan":2},"content":[]}]}]}`,
		`{"rows":[{"cells":[{"type":"tableCell","props":{"colspan":0},"content":[]}]}]}`,
		`{"rows":[{"cells":[{"type":"tableCell","props":{"textAlignment":"bad"},"content":[]}]}]}`,
	} {
		raw := `{"version":1,"blocks":[{"id":"x","type":"table","content":{"type":"tableContent",` + table[1:] + `}]}`
		if Validate(json.RawMessage(raw)) == nil {
			t.Errorf("accepted %s", raw)
		}
	}
}
