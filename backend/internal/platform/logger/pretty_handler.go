package logger

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"sync"
)

// ANSI Color Codes
const (
	colorReset   = "\033[0m"
	colorGray    = "\033[90m"
	colorRed     = "\033[31m"
	colorGreen   = "\033[32m"
	colorYellow  = "\033[33m"
	colorBlue    = "\033[34m"
	colorMagenta = "\033[35m"
	colorCyan    = "\033[36m"
	colorBold    = "\033[1m"
)

// PrettyHandler writes colorized, human-friendly logs to the terminal.
type PrettyHandler struct {
	w       io.Writer
	mu      *sync.Mutex
	level   slog.Level
	attrs   []slog.Attr
	groups  []string
	service string
	env     string
}

// NewPrettyHandler returns an slog.Handler tailored for local development readability.
func NewPrettyHandler(w io.Writer, level slog.Level, service, env string) *PrettyHandler {
	return &PrettyHandler{
		w:       w,
		mu:      &sync.Mutex{},
		level:   level,
		service: service,
		env:     env,
	}
}

func (h *PrettyHandler) Enabled(_ context.Context, level slog.Level) bool {
	return level >= h.level
}

func (h *PrettyHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	cloned := make([]slog.Attr, 0, len(h.attrs)+len(attrs))
	cloned = append(cloned, h.attrs...)
	for _, a := range attrs {
		cloned = append(cloned, redactAttr(a))
	}
	return &PrettyHandler{
		w:       h.w,
		mu:      h.mu,
		level:   h.level,
		attrs:   cloned,
		groups:  h.groups,
		service: h.service,
		env:     h.env,
	}
}

func (h *PrettyHandler) WithGroup(name string) slog.Handler {
	if name == "" {
		return h
	}
	groups := make([]string, len(h.groups)+1)
	copy(groups, h.groups)
	groups[len(h.groups)] = name
	return &PrettyHandler{
		w:       h.w,
		mu:      h.mu,
		level:   h.level,
		attrs:   h.attrs,
		groups:  groups,
		service: h.service,
		env:     h.env,
	}
}

func (h *PrettyHandler) Handle(_ context.Context, r slog.Record) error {
	timeStr := r.Time.Format("15:04:05")

	var levelBadge string
	switch {
	case r.Level <= slog.LevelDebug:
		levelBadge = fmt.Sprintf("%s[DEBUG]%s", colorBlue, colorReset)
	case r.Level < slog.LevelWarn:
		levelBadge = fmt.Sprintf("%s[INFO ]%s", colorGreen, colorReset)
	case r.Level < slog.LevelError:
		levelBadge = fmt.Sprintf("%s[WARN ]%s", colorYellow, colorReset)
	default:
		levelBadge = fmt.Sprintf("%s[ERROR]%s", colorRed, colorReset)
	}

	// Extract module and separate remaining attributes
	module := "system"
	attrMap := make(map[string]string)
	var orderedKeys []string

	processAttr := func(a slog.Attr) {
		a = redactAttr(a)
		if a.Key == "module" {
			module = a.Value.String()
			return
		}
		// Skip low-cardinality static labels in terminal mode if default
		if a.Key == "service" || a.Key == "env" {
			return
		}
		if a.Key == "source" && a.Value.String() == "backend" {
			return
		}
		if _, exists := attrMap[a.Key]; !exists {
			orderedKeys = append(orderedKeys, a.Key)
		}
		attrMap[a.Key] = a.Value.String()
	}

	// 1. Pre-configured handler attributes
	for _, a := range h.attrs {
		processAttr(a)
	}

	// 2. Record attributes (can override pre-configured ones, e.g. source="frontend")
	r.Attrs(func(a slog.Attr) bool {
		processAttr(a)
		return true
	})

	var keyValues []string
	for _, k := range orderedKeys {
		valStr := attrMap[k]
		if strings.ContainsAny(valStr, " \t\n\"") {
			valStr = fmt.Sprintf("%q", valStr)
		}
		keyValues = append(keyValues, fmt.Sprintf("%s%s%s=%s", colorCyan, k, colorReset, valStr))
	}

	moduleBadge := fmt.Sprintf("%s[%s]%s", colorMagenta, module, colorReset)

	var b strings.Builder
	b.WriteString(fmt.Sprintf("%s[%s]%s %s %s %s%s%s",
		colorGray, timeStr, colorReset,
		levelBadge,
		moduleBadge,
		colorBold, r.Message, colorReset,
	))

	if len(keyValues) > 0 {
		b.WriteString(" | ")
		b.WriteString(strings.Join(keyValues, " "))
	}
	b.WriteString("\n")

	h.mu.Lock()
	defer h.mu.Unlock()
	_, err := io.WriteString(h.w, b.String())
	return err
}

func formatAttr(a slog.Attr) string {
	valStr := a.Value.String()
	if strings.ContainsAny(valStr, " \t\n\"") {
		valStr = fmt.Sprintf("%q", valStr)
	}
	return fmt.Sprintf("%s%s%s=%s", colorCyan, a.Key, colorReset, valStr)
}
