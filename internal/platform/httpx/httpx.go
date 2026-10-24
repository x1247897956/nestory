package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"noteapp/internal/apperr"
	"noteapp/internal/document"
)

type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Message }

// Compatibility helpers preserve callers at the HTTP boundary.
func Invalid(s string) error  { return apperr.Invalid(s) }
func Conflict(s string) error { return apperr.Conflict(s) }

var NotFound = apperr.NotFound

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func Fail(w http.ResponseWriter, err error) {
	var domain *apperr.Error
	var transport *Error
	status, code, message := 500, "internal", "服务器内部错误"
	if errors.As(err, &domain) {
		switch domain.Code {
		case "invalid":
			status = 400
		case "conflict":
			status = 409
		case "not_found":
			status = 404
		case "too_large":
			status = 413
		}
		if status != 500 {
			code, message = domain.Code, domain.Message
		}
	} else if errors.As(err, &transport) {
		status, code, message = transport.Status, transport.Code, transport.Message
	}
	if status == 500 {
		slog.Error("request failed", "error", err)
	}
	JSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

const MaxJSONBytes = document.MaxBytes + (1 << 20)

func decodeError(err error) error {
	var too *http.MaxBytesError
	if errors.As(err, &too) {
		return apperr.TooLarge("请求超过 3 MiB；正文上限为 2 MiB，请缩减内容后重试")
	}
	return Invalid("无效 JSON 请求")
}

func Decode(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, MaxJSONBytes)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return decodeError(err)
	}
	if err := d.Decode(new(any)); err != io.EOF {
		if err != nil {
			return decodeError(err)
		}
		return Invalid("请求只能包含一个 JSON 对象")
	}
	return nil
}
