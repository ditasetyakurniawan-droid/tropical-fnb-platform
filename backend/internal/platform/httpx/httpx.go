// Package httpx contains tiny helpers shared by every module's HTTP handlers
// so the whole API speaks one consistent JSON dialect.
package httpx

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"reflect"

	chimw "github.com/go-chi/chi/v5/middleware"

	"tropical-fnb/backend/internal/platform/logger"
)

// ErrorBody is the single error envelope returned by the API.
//
//	{"error":{"code":"not_found","message":"...","request_id":"..."}}
type ErrorBody struct {
	Error ErrorDetail `json:"error"`
}

// ErrorDetail describes one API error.
type ErrorDetail struct {
	// Code is a stable, machine-readable identifier clients can switch on.
	Code string `json:"code"`
	// Message is a human-readable explanation, safe to show to end users.
	Message string `json:"message"`
	// RequestID correlates the response with server logs.
	RequestID string `json:"request_id,omitempty"`
}

// normalizeNilSlice converts any top-level nil slice into an initialized empty slice of the same type.
// This guarantees that encoding/json always emits [] rather than null for list endpoints.
func normalizeNilSlice(v any) any {
	if v == nil {
		return nil
	}
	val := reflect.ValueOf(v)
	if val.Kind() == reflect.Slice && val.IsNil() {
		return reflect.MakeSlice(val.Type(), 0, 0).Interface()
	}
	return v
}

// EnsureSlice guarantees that if a slice is nil, a non-nil empty slice is returned.
func EnsureSlice[T any](s []T) []T {
	if s == nil {
		return make([]T, 0)
	}
	return s
}

// NewListResponse normalizes any nil slice into []T{} to guarantee enterprise JSON array contracts.
func NewListResponse[T any](items []T) []T {
	return EnsureSlice(items)
}

// JSON writes v as a JSON response with the given status code.
// Any top-level nil slice is automatically normalized to [] before serialization.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(normalizeNilSlice(v)); err != nil {
		slog.Error("httpx: failed to encode response", "error", err)
	}
}

// WriteList writes a typed slice response, ensuring nil slices serialize to [] instead of null.
func WriteList[T any](w http.ResponseWriter, status int, items []T) {
	JSON(w, status, EnsureSlice(items))
}

// Error writes the standard error envelope.
func Error(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	// Surface the API error in the single access-log line so failures can be
	// traced by req_id without scraping response bodies.
	logger.Annotate(r.Context(), "error_code", code)
	logger.Annotate(r.Context(), "error_message", message)
	JSON(w, status, ErrorBody{Error: ErrorDetail{
		Code:      code,
		Message:   message,
		RequestID: chimw.GetReqID(r.Context()),
	}})
}
