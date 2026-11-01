// Package middleware holds cross-cutting HTTP middleware that is not specific
// to any business module.
package middleware

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"

	"tropical-fnb/backend/internal/platform/httpx"
	"tropical-fnb/backend/internal/platform/logger"
)

// Correlation & Tracing Context Keys
type contextKey string

const (
	UserIDCtxKey contextKey = "user_id"
)

// RequestID extracts or generates an end-to-end correlation ID (X-Request-ID).
// It populates both chi's RequestIDKey and logger's RequestIDCtxKey in context,
// and guarantees the header is mirrored back in the HTTP response.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := r.Header.Get("X-Request-ID")
		if reqID == "" || len(reqID) > 128 {
			reqID = uuid.New().String()
		}

		ctx := context.WithValue(r.Context(), chimw.RequestIDKey, reqID)
		ctx = logger.WithRequestID(ctx, reqID)

		// Parse W3C traceparent header if present: version(2)-traceid(32)-parentid(16)-flags(2)
		if tp := r.Header.Get("traceparent"); tp != "" {
			parts := strings.Split(tp, "-")
			if len(parts) >= 2 && len(parts[1]) == 32 {
				ctx = context.WithValue(ctx, logger.TraceIDCtxKey, parts[1])
			}
		}

		w.Header().Set("X-Request-ID", reqID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequestIDHeader ensures backwards compatibility if installed alongside RequestID.
func RequestIDHeader(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if id := chimw.GetReqID(r.Context()); id != "" {
			w.Header().Set("X-Request-ID", id)
		}
		next.ServeHTTP(w, r)
	})
}

// Recoverer converts panics into a logged 500 response using standard JSON envelope
// following the "Log Once at the Boundary" rule.
func Recoverer(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				rec := recover()
				if rec == nil {
					return
				}
				// http.ErrAbortHandler is the sanctioned way to abort a response.
				if rec == http.ErrAbortHandler { //nolint:errorlint
					panic(rec)
				}

				reqID := chimw.GetReqID(r.Context())
				routePattern := chi.RouteContext(r.Context()).RoutePattern()
				if routePattern == "" {
					routePattern = r.URL.Path
				}

				stackStr := string(debug.Stack())
				// Find first caller outside runtime/debug
				caller := extractCaller(stackStr)

				log.Error("panic_recovered",
					"module", deriveModule(r.URL.Path),
					"req_id", reqID,
					"http_method", r.Method,
					"http_route", routePattern,
					"http_path", r.URL.Path,
					"http_status", http.StatusInternalServerError,
					"caller", caller,
					"panic", fmt.Sprint(rec),
					"stack", stackStr,
				)
				httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "terjadi kesalahan pada server")
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// AccessLog writes one structured log line per request according to Grafana Loki best practices.
// Low-cardinality labels: service, env, level, source, module.
// High-cardinality payload: ts, req_id, trace_id, user_id, http_method, http_route, http_path, http_status, duration_ms.
func AccessLog(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			// Per-request annotation holder, filled by auth middleware / httpx.Error.
			r = r.WithContext(logger.WithRequestFields(r.Context()))
			ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)

			status := ww.Status()
			if status == 0 {
				status = http.StatusOK
			}

			durationMs := float64(time.Since(start).Microseconds()) / 1000.0

			// Route Pattern for Loki metric aggregation (e.g. /api/v1/menu/items/{id})
			routePattern := chi.RouteContext(r.Context()).RoutePattern()
			if routePattern == "" {
				routePattern = r.URL.Path
			}

			module := deriveModule(r.URL.Path)

			// Determine level & static event message
			var level slog.Level
			var msg string

			isProbe := r.URL.Path == "/healthz" || r.URL.Path == "/readyz"

			switch {
			case isProbe:
				level = slog.LevelDebug
				msg = "http_request_completed"
			case status >= 500:
				level = slog.LevelError
				msg = "http_request_failed"
			case status >= 400:
				level = slog.LevelWarn
				msg = "http_request_failed"
			default:
				level = slog.LevelInfo
				msg = "http_request_completed"
			}

			// Context attributes
			reqID := chimw.GetReqID(r.Context())
			traceID := ""
			if v, ok := r.Context().Value(logger.TraceIDCtxKey).(string); ok {
				traceID = v
			}

			userID := ""
			if v, ok := r.Context().Value(UserIDCtxKey).(string); ok {
				userID = v
			}

			attrs := []any{
				"module", module,
				"req_id", reqID,
				"http_method", r.Method,
				"http_route", routePattern,
				"http_path", r.URL.Path,
				"http_status", status,
				"duration_ms", durationMs,
				"bytes", ww.BytesWritten(),
				"remote_addr", r.RemoteAddr,
			}

			if traceID != "" {
				attrs = append(attrs, "trace_id", traceID)
			}
			if userID != "" {
				attrs = append(attrs, "user_id", userID)
			}
			// Annotations: user, tenant_id, outlet_id, error_code, error_message.
			attrs = append(attrs, logger.AnnotatedAttrs(r.Context())...)

			log.Log(r.Context(), level, msg, attrs...)
		})
	}
}

// deriveModule extracts a low-cardinality module identifier from the request path.
func deriveModule(path string) string {
	switch {
	case strings.HasPrefix(path, "/api/v1/menu"):
		return "menu"
	case strings.HasPrefix(path, "/api/v1/inventory"), strings.HasPrefix(path, "/api/v1/procurement"):
		return "inventory"
	case strings.HasPrefix(path, "/api/v1/crm"):
		return "crm"
	case strings.HasPrefix(path, "/api/v1/finance"):
		return "finance"
	case strings.HasPrefix(path, "/api/v1/pos"):
		return "pos"
	case strings.HasPrefix(path, "/api/v1/hr"):
		return "payroll"
	case strings.HasPrefix(path, "/api/v1/auth"):
		return "iam"
	case strings.HasPrefix(path, "/api/v1/sop"):
		return "sop"
	case strings.HasPrefix(path, "/api/v1/system"):
		return "system"
	case path == "/healthz" || path == "/readyz":
		return "system"
	default:
		return "system"
	}
}

// extractCaller finds the first relevant line from a stack trace string.
func extractCaller(stack string) string {
	lines := strings.Split(stack, "\n")
	for i := 1; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if strings.Contains(line, ".go:") && !strings.Contains(line, "runtime/") && !strings.Contains(line, "middleware/") {
			parts := strings.Split(line, " ")
			return parts[0]
		}
	}
	return "unknown"
}
