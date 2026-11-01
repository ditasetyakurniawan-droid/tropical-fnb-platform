package domain

import (
	"errors"
	"fmt"
)

// ErrorKind classifies a user-facing POS error so the HTTP layer can pick a status code.
type ErrorKind int

const (
	// KindInvalid is a validation failure caused by the request (HTTP 400/422).
	KindInvalid ErrorKind = iota
	// KindNotFound means the referenced resource does not exist (HTTP 404).
	KindNotFound
	// KindConflict means the request conflicts with the current state, e.g.
	// paying an order that is already settled (HTTP 409).
	KindConflict
)

// UserError is an error whose message is safe to show to the end user. Any error
// that is NOT a UserError (database failures, driver errors, bugs) is treated as an
// internal error: logged with full detail but returned to clients as a generic 500
// so internals never leak.
type UserError struct {
	Kind ErrorKind
	Code string // stable machine-readable code, e.g. "order_already_paid"
	Msg  string
}

func (e *UserError) Error() string { return e.Msg }

// Invalid builds a KindInvalid UserError.
func Invalid(format string, a ...any) error {
	return &UserError{Kind: KindInvalid, Msg: fmt.Sprintf(format, a...)}
}

// NotFound builds a KindNotFound UserError.
func NotFound(format string, a ...any) error {
	return &UserError{Kind: KindNotFound, Code: "not_found", Msg: fmt.Sprintf(format, a...)}
}

// Conflict builds a KindConflict UserError with a stable code.
func Conflict(code, format string, a ...any) error {
	return &UserError{Kind: KindConflict, Code: code, Msg: fmt.Sprintf(format, a...)}
}

// AsUserError extracts a UserError from err's chain.
func AsUserError(err error) (*UserError, bool) {
	var ue *UserError
	if errors.As(err, &ue) {
		return ue, true
	}
	return nil, false
}
