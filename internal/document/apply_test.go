package document

import (
	"encoding/json"
	"testing"
)

func TestApplyOnlyBlocks(t *testing.T) {
	var stored json.RawMessage
	if err := Apply(&stored, nil); err != nil {
		t.Fatal(err)
	}
	if string(stored) != `{"version":1,"blocks":[]}` {
		t.Fatalf("empty document: %s", stored)
	}
	next := json.RawMessage(`{"version":1,"blocks":[{"id":"p","type":"paragraph","content":[{"type":"text","text":"正文","styles":{}}]}]}`)
	if err := Apply(&stored, next); err != nil {
		t.Fatal(err)
	}
	before := string(stored)
	if err := Apply(&stored, nil); err != nil || string(stored) != before {
		t.Fatal("metadata edit changed blocks")
	}
	if err := Apply(&stored, json.RawMessage(`null`)); err == nil || string(stored) != before {
		t.Fatal("invalid write changed blocks")
	}
}
