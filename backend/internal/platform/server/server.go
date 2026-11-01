// Package server assembles the HTTP router: global middleware, operational
// endpoints (probes, build info) and the versioned API where business modules
// mount their routes.
package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"tropical-fnb/backend/internal/platform/httpx"
	"tropical-fnb/backend/internal/platform/middleware"
)

// Pinger is satisfied by *pgxpool.Pool. It lets the readiness probe be tested
// without a real database.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Module is implemented by every business module (iam, pos, inventory, ...).
// Each module owns its routes; the server only knows this interface, which is
// what keeps modules extractable into separate services later.
type Module interface {
	// Name is a short identifier used for logging.
	Name() string
	// RegisterRoutes mounts the module's routes under /api/v1.
	RegisterRoutes(r chi.Router)
}

// BuildInfo describes the running binary (injected via -ldflags).
type BuildInfo struct {
	Service     string `json:"service"`
	Version     string `json:"version"`
	Commit      string `json:"commit"`
	Environment string `json:"environment"`
}

// Options configures New.
type Options struct {
	Log         *slog.Logger
	DB          Pinger
	Build       BuildInfo
	CORSOrigins []string
	Modules     []Module
}

// readyTimeout bounds the dependency check performed by /readyz.
const readyTimeout = 2 * time.Second

// New builds the root http.Handler.
func New(o Options) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.AccessLog(o.Log))
	r.Use(middleware.Recoverer(o.Log))
	r.Use(chimw.Compress(5, "application/json", "text/plain"))
	if len(o.CORSOrigins) > 0 {
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins:   o.CORSOrigins,
			AllowedMethods:   []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
			AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Request-ID", "X-Outlet-ID", "Idempotency-Key"},
			ExposedHeaders:   []string{"X-Request-ID"},
			AllowCredentials: true,
			MaxAge:           300,
		}))
	}

	// Kubernetes probes. Liveness must NOT depend on external systems,
	// otherwise a DB outage would restart every Pod in a loop.
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Get("/readyz", readyHandler(o.DB))

	r.Route("/api/v1", func(api chi.Router) {
		api.Get("/system/info", func(w http.ResponseWriter, _ *http.Request) {
			httpx.JSON(w, http.StatusOK, o.Build)
		})
		// Same payload as /readyz, but reachable through the Ingress /api
		// prefix so the UI can show backend/database health.
		api.Get("/system/status", readyHandler(o.DB))
		api.Post("/system/client-logs", clientLogHandler(o.Log))
		for _, m := range o.Modules {
			o.Log.Info("mounting module", "module", m.Name())
			m.RegisterRoutes(api)
		}
	})

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.Error(w, req, http.StatusNotFound, "not_found", "endpoint tidak ditemukan")
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.Error(w, req, http.StatusMethodNotAllowed, "method_not_allowed", "method tidak diizinkan")
	})

	return r
}

func readyHandler(db Pinger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), readyTimeout)
		defer cancel()
		if err := db.Ping(ctx); err != nil {
			httpx.JSON(w, http.StatusServiceUnavailable, map[string]string{
				"status":   "unavailable",
				"database": "down",
			})
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]string{
			"status":   "ready",
			"database": "up",
		})
	}
}

type clientLogPayload struct {
	Event          string `json:"event"` // e.g. "client_ui_crash", "print_job_ok", "print_job_failed", "print_deduped"
	Level          string `json:"level"` // "info", "warn", "error"
	ReqID          string `json:"req_id"`
	Message        string `json:"message"`
	Stack          string `json:"stack"`
	ComponentStack string `json:"component_stack"`
	Route          string `json:"route"`
	UserAgent      string `json:"user_agent"`
	OrderID        string `json:"order_id,omitempty"`
	OutletID       string `json:"outlet_id,omitempty"`
	Station        string `json:"station,omitempty"`
}

// clientLogHandler ingests unhandled frontend exceptions and client telemetry events (e.g. print jobs)
// adhering to the Loki structured logging schema. Protected with a 64KB body limit.
func clientLogHandler(log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 64*1024)

		var p clientLogPayload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			httpx.Error(w, r, http.StatusBadRequest, "invalid_payload", "format log klien tidak valid atau ukuran melebihi 64KB")
			return
		}

		reqID := p.ReqID
		if reqID == "" {
			reqID = chimw.GetReqID(r.Context())
		}

		eventName := strings.TrimSpace(p.Event)
		if eventName == "" {
			eventName = "client_ui_crash"
		}

		caller := "frontend"
		if p.ComponentStack != "" {
			lines := strings.Split(p.ComponentStack, "\n")
			for _, l := range lines {
				trimmed := strings.TrimSpace(l)
				if trimmed != "" {
					caller = trimmed
					break
				}
			}
		}

		attrs := []any{
			"source", "frontend",
			"module", "system",
			"req_id", reqID,
			"http_route", p.Route,
			"caller", caller,
			"err_msg", p.Message,
			"user_agent", p.UserAgent,
		}
		if p.Stack != "" {
			attrs = append(attrs, "stack", p.Stack)
		}
		if p.OrderID != "" {
			attrs = append(attrs, "order_id", p.OrderID)
		}
		if p.OutletID != "" {
			attrs = append(attrs, "outlet_id", p.OutletID)
		}
		if p.Station != "" {
			attrs = append(attrs, "station", p.Station)
		}

		var lvl slog.Level
		switch strings.ToLower(p.Level) {
		case "info":
			lvl = slog.LevelInfo
		case "warn":
			lvl = slog.LevelWarn
		case "error":
			lvl = slog.LevelError
		default:
			if strings.HasPrefix(eventName, "print_job_ok") || eventName == "print_deduped" {
				lvl = slog.LevelInfo
			} else if eventName == "print_job_failed" {
				lvl = slog.LevelWarn
			} else {
				lvl = slog.LevelError
			}
		}

		log.Log(r.Context(), lvl, eventName, attrs...)

		httpx.JSON(w, http.StatusOK, map[string]string{"status": "logged"})
	}
}
