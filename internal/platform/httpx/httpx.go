package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
)

type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Message }
func Invalid(s string) error   { return &Error{400, "invalid", s} }
func Conflict(s string) error  { return &Error{409, "conflict", s} }

var NotFound = &Error{404, "not_found", "对象不存在"}

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func Fail(w http.ResponseWriter, err error) {
	var e *Error
	if !errors.As(err, &e) {
		slog.Error("request failed", "error", err)
		e = &Error{500, "internal", "服务器内部错误"}
	}
	JSON(w, e.Status, map[string]any{"error": map[string]string{"code": e.Code, "message": e.Message}})
}
func Decode(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return Invalid("无效 JSON 请求")
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return Invalid("请求只能包含一个 JSON 对象")
	}
	return nil
}
