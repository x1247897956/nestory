package httpx

import (
	"errors"
	"fmt"
	"net/http/httptest"
	"noteapp/internal/apperr"
	"strings"
	"testing"
)

func TestDomainErrorMapping(t *testing.T) {
	for _, v := range []struct {
		err    error
		status int
		code   string
	}{{apperr.Invalid("bad"), 400, "invalid"}, {apperr.Conflict("changed"), 409, "conflict"}, {apperr.NotFound, 404, "not_found"}, {apperr.TooLarge("large"), 413, "too_large"}, {errors.New("private database path"), 500, "internal"}} {
		w := httptest.NewRecorder()
		Fail(w, fmt.Errorf("wrapped: %w", v.err))
		if w.Code != v.status || !strings.Contains(w.Body.String(), `"code":"`+v.code+`"`) {
			t.Fatalf("%d %s", w.Code, w.Body.String())
		}
		if strings.Contains(w.Body.String(), "private database path") {
			t.Fatal("internal error leaked")
		}
	}
	if !errors.Is(NotFound, apperr.NotFound) {
		t.Fatal("legacy error identity changed")
	}
}
