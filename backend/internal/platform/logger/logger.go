// Package logger builds the process-wide structured logger (log/slog).
// Supports dual-mode output: 'pretty' for clean local terminal development,
// and 'json' single-line output optimized for Grafana Loki / Alloy ingestion.
package logger

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"time"
)

// Options configures the logger.
type Options struct {
	Env         string
	Level       string
	Format      string // "pretty" | "json"
	ServiceName string
}

// sensitiveKeys are lowercase substrings that require value redaction.
var sensitiveKeys = []string{
	"password",
	"token",
	"authorization",
	"secret",
	"pin",
	"cookie",
}

// redactAttr checks if an attribute key or string content is sensitive and replaces it with [REDACTED].
func redactAttr(a slog.Attr) slog.Attr {
	keyLower := strings.ToLower(a.Key)
	for _, sk := range sensitiveKeys {
		if strings.Contains(keyLower, sk) {
			return slog.String(a.Key, "[REDACTED]")
		}
	}

	// If value is a string, check if it contains obvious authorization or password patterns
	if a.Value.Kind() == slog.KindString {
		str := a.Value.String()
		if strings.HasPrefix(str, "Bearer ") {
			return slog.String(a.Key, "Bearer [REDACTED]")
		}
	}
	return a
}

// New returns a slog.Logger with backwards-compatible signature.
// When env is "development", it defaults to "pretty" mode.
func New(w io.Writer, env, level string) *slog.Logger {
	format := "json"
	if strings.ToLower(env) == "development" {
		format = "pretty"
	}
	return NewWithOptions(w, Options{
		Env:         env,
		Level:       level,
		Format:      format,
		ServiceName: "tropical-erp",
	})
}

// NewWithOptions builds an slog.Logger matching Grafana Loki best practices.
func NewWithOptions(w io.Writer, opts Options) *slog.Logger {
	lvl := parseLevel(opts.Level)
	service := opts.ServiceName
	if service == "" {
		service = "tropical-erp"
	}
	env := opts.Env
	if env == "" {
		env = "development"
	}

	format := strings.ToLower(opts.Format)
	if format == "" {
		if env == "development" {
			format = "pretty"
		} else {
			format = "json"
		}
	}

	if format == "pretty" {
		handler := NewPrettyHandler(w, lvl, service, env)
		return slog.New(NewContextHandler(handler)).With(
			"service", service,
			"env", env,
			"source", "backend",
		)
	}

	// JSON Mode: 1-line structured JSON (Grafana Loki ready)
	jsonOpts := &slog.HandlerOptions{
		Level: lvl,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			// Redact sensitive fields
			a = redactAttr(a)

			switch a.Key {
			case slog.TimeKey:
				// Grafana Loki standard ISO8601/RFC3339 timestamp as "ts"
				return slog.String("ts", a.Value.Time().UTC().Format(time.RFC3339Nano))
			case slog.LevelKey:
				// Lowercase level: debug, info, warn, error
				return slog.String("level", strings.ToLower(a.Value.String()))
			case slog.MessageKey:
				// Static message key "msg"
				return slog.String("msg", a.Value.String())
			}
			return a
		},
	}

	jsonHandler := slog.NewJSONHandler(w, jsonOpts)
	return slog.New(NewContextHandler(jsonHandler)).With(
		"service", service,
		"env", env,
		"source", "backend",
	)
}

func parseLevel(s string) slog.Level {
	switch strings.ToLower(s) {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// ContextWithRequestID adds a request ID to a context for logging.
type ctxKey string

const (
	RequestIDCtxKey ctxKey = "req_id"
	TraceIDCtxKey   ctxKey = "trace_id"
)

// WithRequestID returns a new context with the given req_id.
func WithRequestID(ctx context.Context, reqID string) context.Context {
	return context.WithValue(ctx, RequestIDCtxKey, reqID)
}

// RequestIDFromContext extracts req_id from context.
func RequestIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if v, ok := ctx.Value(RequestIDCtxKey).(string); ok {
		return v
	}
	return ""
}
