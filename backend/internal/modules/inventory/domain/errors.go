package domain

import "fmt"

// ErrorKind classifies domain errors.
type ErrorKind int

const (
	KindValidation ErrorKind = iota
	KindNotFound
	KindUnauthorized
	KindForbidden
	KindConflict
)

type DomainError struct {
	Kind    ErrorKind
	Message string
}

func (e *DomainError) Error() string {
	return e.Message
}

func Validation(msg string, args ...any) *DomainError {
	return &DomainError{Kind: KindValidation, Message: fmt.Sprintf(msg, args...)}
}

func NotFound(msg string, args ...any) *DomainError {
	return &DomainError{Kind: KindNotFound, Message: fmt.Sprintf(msg, args...)}
}

func Unauthorized(msg string, args ...any) *DomainError {
	return &DomainError{Kind: KindUnauthorized, Message: fmt.Sprintf(msg, args...)}
}

func Forbidden(msg string, args ...any) *DomainError {
	return &DomainError{Kind: KindForbidden, Message: fmt.Sprintf(msg, args...)}
}

func Conflict(msg string, args ...any) *DomainError {
	return &DomainError{Kind: KindConflict, Message: fmt.Sprintf(msg, args...)}
}
