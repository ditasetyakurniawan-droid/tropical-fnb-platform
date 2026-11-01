package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

type fakeDB struct{ err error }

func (f fakeDB) Ping(context.Context) error { return f.err }

type fakeModule struct{ mounted *bool }

func (fakeModule) Name() string { return "fake" }
func (f fakeModule) RegisterRoutes(r chi.Router) {
	*f.mounted = true
	r.Get("/fake/ping", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	r.Get("/fake/panic", func(http.ResponseWriter, *http.Request) { panic("boom") })
}

func newTestServer(db Pinger, mounted *bool) http.Handler {
	return New(Options{
		Log:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		DB:    db,
		Build: BuildInfo{Service: "tropical-fnb-api", Version: "test", Commit: "abc123", Environment: "development"},
		Modules: []Module{
			fakeModule{mounted: mounted},
		},
	})
}

func do(h http.Handler, method, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	return rec
}

func TestHealthz_DoesNotDependOnDatabase(t *testing.T) {
	var mounted bool
	rec := do(newTestServer(fakeDB{err: errors.New("db down")}, &mounted), http.MethodGet, "/healthz")
	if rec.Code != http.StatusOK {
		t.Fatalf("liveness must stay 200 even if DB is down, got %d", rec.Code)
	}
}

func TestReadiness(t *testing.T) {
	var mounted bool
	// /readyz is for Kubernetes; /api/v1/system/status is the same check
	// exposed through the Ingress /api prefix for the UI.
	for _, path := range []string{"/readyz", "/api/v1/system/status"} {
		t.Run(path+" ready", func(t *testing.T) {
			rec := do(newTestServer(fakeDB{}, &mounted), http.MethodGet, path)
			if rec.Code != http.StatusOK {
				t.Fatalf("want 200, got %d", rec.Code)
			}
		})
		t.Run(path+" database down", func(t *testing.T) {
			rec := do(newTestServer(fakeDB{err: errors.New("db down")}, &mounted), http.MethodGet, path)
			if rec.Code != http.StatusServiceUnavailable {
				t.Fatalf("want 503, got %d", rec.Code)
			}
			if body := rec.Body.String(); strings.Contains(body, "db down") {
				t.Fatalf("readiness body must not leak internal error details: %s", body)
			}
		})
	}
}

func TestSystemInfo(t *testing.T) {
	var mounted bool
	rec := do(newTestServer(fakeDB{}, &mounted), http.MethodGet, "/api/v1/system/info")
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	var got BuildInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Service != "tropical-fnb-api" || got.Commit != "abc123" {
		t.Fatalf("unexpected build info: %+v", got)
	}
}

func TestModulesAreMountedUnderAPIv1(t *testing.T) {
	var mounted bool
	h := newTestServer(fakeDB{}, &mounted)
	if !mounted {
		t.Fatal("module RegisterRoutes was not called")
	}
	if rec := do(h, http.MethodGet, "/api/v1/fake/ping"); rec.Code != http.StatusNoContent {
		t.Fatalf("want 204, got %d", rec.Code)
	}
}

func TestPanicBecomesJSON500(t *testing.T) {
	var mounted bool
	rec := do(newTestServer(fakeDB{}, &mounted), http.MethodGet, "/api/v1/fake/panic")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("want 500, got %d", rec.Code)
	}
	var body struct {
		Error struct {
			Code      string `json:"code"`
			RequestID string `json:"request_id"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("panic response is not the JSON error envelope: %v", err)
	}
	if body.Error.Code != "internal_error" || body.Error.RequestID == "" {
		t.Fatalf("unexpected envelope: %+v", body)
	}
}

func TestUnknownRouteUsesErrorEnvelope(t *testing.T) {
	var mounted bool
	rec := do(newTestServer(fakeDB{}, &mounted), http.MethodGet, "/nope")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Fatalf("unexpected content type %q", ct)
	}
}

func TestRequestIDHeaderMatchesErrorEnvelope(t *testing.T) {
	var mounted bool
	rec := do(newTestServer(fakeDB{}, &mounted), http.MethodGet, "/nope")

	header := rec.Header().Get("X-Request-ID")
	if header == "" {
		t.Fatal("response must carry an X-Request-ID header")
	}
	var body struct {
		Error struct {
			RequestID string `json:"request_id"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Error.RequestID != header {
		t.Fatalf("header %q and body %q must carry the same ID", header, body.Error.RequestID)
	}
}

func TestRequestID_PropagatesFromHeader(t *testing.T) {
	var mounted bool
	srv := newTestServer(fakeDB{}, &mounted)

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("X-Request-ID", "custom-client-id-12345")

	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)

	if got := rec.Header().Get("X-Request-ID"); got != "custom-client-id-12345" {
		t.Errorf("expected propagated X-Request-ID, got %s", got)
	}
}

func TestClientLogs(t *testing.T) {
	var mounted bool
	srv := newTestServer(fakeDB{}, &mounted)

	payload := `{"req_id":"req-client-123","message":"crash test","stack":"Error: crash\n at MenuRecipePage","route":"/erp/menu","user_agent":"TestBrowser"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/system/client-logs", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from client-logs, got %d: %s", rec.Code, rec.Body.String())
	}
	var res map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if res["status"] != "logged" {
		t.Errorf("expected status=logged, got %+v", res)
	}
}
