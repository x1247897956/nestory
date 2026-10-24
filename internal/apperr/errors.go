// Package apperr defines application failures without transport status codes.
package apperr

type Error struct {
	Code    string
	Message string
}

func (e *Error) Error() string      { return e.Message }
func Invalid(message string) error  { return &Error{Code: "invalid", Message: message} }
func Conflict(message string) error { return &Error{Code: "conflict", Message: message} }
func TooLarge(message string) error { return &Error{Code: "too_large", Message: message} }

var NotFound = &Error{Code: "not_found", Message: "对象不存在"}
