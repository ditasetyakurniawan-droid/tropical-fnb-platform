package logger

import (
	"context"
	"log/slog"
	"sync"
)

// requestFieldsKey is the context key under which the per-request log annotations live.
type requestFieldsKey struct{}

// RequestFields is a mutable, concurrency-safe holder of key/value pairs that
// downstream layers (auth middleware, error helpers, use cases) add to while a
// request is being served. The outermost AccessLog middleware emits them once, in
// the single access-log line, so every request can be traced by user, tenant,
// outlet and error code without each layer writing its own log line.
type RequestFields struct {
	mu    sync.Mutex
	order []string
	vals  map[string]any
}

// WithRequestFields returns a context carrying an empty RequestFields holder.
// If ctx already carries one it is returned unchanged.
func WithRequestFields(ctx context.Context) context.Context {
	if _, ok := ctx.Value(requestFieldsKey{}).(*RequestFields); ok {
		return ctx
	}
	return context.WithValue(ctx, requestFieldsKey{}, &RequestFields{vals: map[string]any{}})
}

// Annotate records key=value on the request's field holder. It is a no-op when
// ctx has no holder (e.g. unit tests or background jobs). Later calls for the
// same key overwrite earlier ones, except that first-wins semantic is kept for
// error_code so the root cause is not hidden by a wrapper.
func Annotate(ctx context.Context, key string, value any) {
	if ctx == nil {
		return
	}
	rf, ok := ctx.Value(requestFieldsKey{}).(*RequestFields)
	if !ok {
		return
	}
	rf.mu.Lock()
	defer rf.mu.Unlock()
	if _, exists := rf.vals[key]; !exists {
		rf.order = append(rf.order, key)
	} else if key == "error_code" {
		return
	}
	rf.vals[key] = value
}

// AnnotatedAttrs returns the annotations collected so far as slog key/value args.
func AnnotatedAttrs(ctx context.Context) []any {
	rf, ok := ctx.Value(requestFieldsKey{}).(*RequestFields)
	if !ok {
		return nil
	}
	rf.mu.Lock()
	defer rf.mu.Unlock()
	out := make([]any, 0, len(rf.order)*2)
	for _, k := range rf.order {
		out = append(out, k, rf.vals[k])
	}
	return out
}

// contextHandler decorates a slog.Handler so every record emitted through a
// *Context logging call automatically carries req_id / trace_id (and the request
// annotations such as user/outlet), making domain logs joinable with the access log.
type contextHandler struct {
	next slog.Handler
}

// NewContextHandler wraps next with request-correlation enrichment.
func NewContextHandler(next slog.Handler) slog.Handler {
	return &contextHandler{next: next}
}

func (h *contextHandler) Enabled(ctx context.Context, l slog.Level) bool {
	return h.next.Enabled(ctx, l)
}

func (h *contextHandler) Handle(ctx context.Context, r slog.Record) error {
	if ctx != nil {
		existing := map[string]struct{}{}
		r.Attrs(func(a slog.Attr) bool {
			existing[a.Key] = struct{}{}
			return true
		})
		add := func(k string, v any) {
			if _, dup := existing[k]; dup || v == nil {
				return
			}
			if s, ok := v.(string); ok && s == "" {
				return
			}
			r.AddAttrs(slog.Any(k, v))
			existing[k] = struct{}{}
		}
		if id := RequestIDFromContext(ctx); id != "" {
			add("req_id", id)
		}
		if v, ok := ctx.Value(TraceIDCtxKey).(string); ok {
			add("trace_id", v)
		}
		attrs := AnnotatedAttrs(ctx)
		for i := 0; i+1 < len(attrs); i += 2 {
			if k, ok := attrs[i].(string); ok {
				add(k, attrs[i+1])
			}
		}
	}
	return h.next.Handle(ctx, r)
}

func (h *contextHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &contextHandler{next: h.next.WithAttrs(attrs)}
}

func (h *contextHandler) WithGroup(name string) slog.Handler {
	return &contextHandler{next: h.next.WithGroup(name)}
}
