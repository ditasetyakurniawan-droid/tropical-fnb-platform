package logger

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestLogger_PrettyMode(t *testing.T) {
	buf := &bytes.Buffer{}
	log := NewWithOptions(buf, Options{
		Env:         "development",
		Level:       "debug",
		Format:      "pretty",
		ServiceName: "tropical-erp",
	})

	log.Info("http_request_completed",
		"module", "menu",
		"method", "GET",
		"path", "/api/v1/menu/items",
		"status", 200,
		"password", "secret123",
	)

	out := buf.String()
	if !strings.Contains(out, "[INFO ]") {
		t.Errorf("expected [INFO ] badge in output, got: %s", out)
	}
	if !strings.Contains(out, "[menu]") {
		t.Errorf("expected [menu] module in output, got: %s", out)
	}
	if !strings.Contains(out, "http_request_completed") {
		t.Errorf("expected message in output, got: %s", out)
	}
	if !strings.Contains(out, "[REDACTED]") {
		t.Errorf("expected password to be redacted, got: %s", out)
	}
	if strings.Contains(out, "secret123") {
		t.Errorf("secret password leaked in output: %s", out)
	}
}

func TestLogger_JSONMode(t *testing.T) {
	buf := &bytes.Buffer{}
	log := NewWithOptions(buf, Options{
		Env:         "production",
		Level:       "info",
		Format:      "json",
		ServiceName: "tropical-erp",
	})

	log.Warn("http_request_failed",
		"module", "iam",
		"http_method", "POST",
		"http_path", "/api/v1/auth/login",
		"http_status", 401,
		"user_token", "jwt.token.secret",
		"supervisor_pin", "123456",
	)

	line := buf.String()
	var data map[string]any
	if err := json.Unmarshal([]byte(line), &data); err != nil {
		t.Fatalf("failed to parse json log: %v, raw: %s", err, line)
	}

	// Verify standard Loki low-cardinality labels
	if data["service"] != "tropical-erp" {
		t.Errorf("expected service=tropical-erp, got: %v", data["service"])
	}
	if data["env"] != "production" {
		t.Errorf("expected env=production, got: %v", data["env"])
	}
	if data["level"] != "warn" {
		t.Errorf("expected level=warn, got: %v", data["level"])
	}
	if data["source"] != "backend" {
		t.Errorf("expected source=backend, got: %v", data["source"])
	}
	if data["module"] != "iam" {
		t.Errorf("expected module=iam, got: %v", data["module"])
	}

	// Verify standard Loki high-cardinality metadata
	if data["msg"] != "http_request_failed" {
		t.Errorf("expected msg=http_request_failed, got: %v", data["msg"])
	}
	if data["ts"] == nil || data["ts"] == "" {
		t.Errorf("expected ts timestamp to be set")
	}

	// Verify automatic redactions
	if data["user_token"] != "[REDACTED]" {
		t.Errorf("expected user_token to be [REDACTED], got: %v", data["user_token"])
	}
	if data["supervisor_pin"] != "[REDACTED]" {
		t.Errorf("expected supervisor_pin to be [REDACTED], got: %v", data["supervisor_pin"])
	}
}

func TestLogger_ContextRequestID(t *testing.T) {
	ctx := context.Background()
	reqID := "01931a2c-9821-72f1-bc81-a9f82d01e102"

	ctxWithID := WithRequestID(ctx, reqID)
	got := RequestIDFromContext(ctxWithID)
	if got != reqID {
		t.Errorf("expected %s, got %s", reqID, got)
	}

	empty := RequestIDFromContext(ctx)
	if empty != "" {
		t.Errorf("expected empty string, got %s", empty)
	}
}
