package document

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestRejectMalformedDocuments(t *testing.T) {
	for _, input := range []string{`{"version":1,"blocks":[{"id":"a","type":"paragraph","content":{}}]}`,
		`{"version":1,"blocks":[{"id":"a","type":"table","content":{"type":"tableContent"}}]}`,
		`{"version":1,"blocks":[{"id":"a","type":"paragraph","content":[{"type":"text","text":123}]}]}`,
		`null`, `[]`, `{"version":1}`, `{"version":1,"blocks":[{"type":"paragraph"}]}`, `{"version":1,"blocks":[{"id":"a","type":"unknown"}]}`, `{"version":1,"blocks":[{"id":"a","type":"paragraph"},{"id":"a","type":"paragraph"}]}`, `{"version":1,"blocks":[{"id":"a","type":"paragraph","content":"bad"}]}`, strings.Repeat("x", (2<<20)+1)} {
		if Validate(json.RawMessage(input)) == nil {
			t.Errorf("accepted malformed document %.100s", input)
		}
	}
}
