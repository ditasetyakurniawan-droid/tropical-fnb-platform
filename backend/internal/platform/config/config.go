// Package config loads runtime configuration exclusively from environment
// variables (12-factor). It never reads .env files: in Kubernetes the values
// are injected by Helm through ConfigMap/Secret, and for local development the
// Makefile/docker-compose exports them.
//
// Load validates everything up-front and reports *all* problems at once, so a
// misconfigured Pod fails fast with an actionable message instead of crashing
// later on the first request.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Environment names accepted by APP_ENV.
const (
	EnvDevelopment = "development"
	EnvStaging     = "staging"
	EnvProduction  = "production"
)

// Config is the fully validated application configuration.
type Config struct {
	Env         string // APP_ENV
	ServiceName string // SERVICE_NAME: default "tropical-erp"
	LogLevel    string // LOG_LEVEL: debug|info|warn|error
	LogFormat   string // LOG_FORMAT: pretty|json

	HTTPAddr        string        // HTTP_ADDR, e.g. ":8080"
	ReadTimeout     time.Duration // HTTP_READ_TIMEOUT
	WriteTimeout    time.Duration // HTTP_WRITE_TIMEOUT
	IdleTimeout     time.Duration // HTTP_IDLE_TIMEOUT
	ShutdownTimeout time.Duration // SHUTDOWN_TIMEOUT

	CORSAllowedOrigins []string // CORS_ALLOWED_ORIGINS (comma separated)

	DatabaseURL string // DATABASE_URL (secret)
	DBMaxConns  int32  // DB_MAX_CONNS
	DBMinConns  int32  // DB_MIN_CONNS

	JWTSecret string        // JWT_SECRET (secret)
	JWTExpiry time.Duration // JWT_EXPIRY
}

// IsProduction reports whether the service runs in the production environment.
func (c Config) IsProduction() bool { return c.Env == EnvProduction }

// Getenv abstracts os.Getenv so Load can be tested without touching the real
// process environment.
type Getenv func(key string) string

// Load reads and validates configuration using the provided getenv function
// (pass os.Getenv in production code).
func Load(getenv Getenv) (Config, error) {
	r := &reader{getenv: getenv}

	env := r.oneOf("APP_ENV", EnvDevelopment, EnvDevelopment, EnvStaging, EnvProduction)
	defaultLogFormat := "json"
	if env == EnvDevelopment {
		defaultLogFormat = "pretty"
	}

	cfg := Config{
		Env:         env,
		ServiceName: r.str("SERVICE_NAME", "tropical-erp"),
		LogLevel:    r.oneOf("LOG_LEVEL", "info", "debug", "info", "warn", "error"),
		LogFormat:   r.oneOf("LOG_FORMAT", defaultLogFormat, "pretty", "json"),

		HTTPAddr:        r.str("HTTP_ADDR", ":8080"),
		ReadTimeout:     r.duration("HTTP_READ_TIMEOUT", 15*time.Second),
		WriteTimeout:    r.duration("HTTP_WRITE_TIMEOUT", 30*time.Second),
		IdleTimeout:     r.duration("HTTP_IDLE_TIMEOUT", 120*time.Second),
		ShutdownTimeout: r.duration("SHUTDOWN_TIMEOUT", 20*time.Second),

		CORSAllowedOrigins: r.list("CORS_ALLOWED_ORIGINS"),

		DatabaseURL: r.requiredURL("DATABASE_URL", "postgres", "postgresql"),
		DBMaxConns:  r.int32("DB_MAX_CONNS", 20, 1),
		DBMinConns:  r.int32("DB_MIN_CONNS", 2, 0),

		JWTSecret: r.str("JWT_SECRET", "tropical-dev-jwt-secret-do-not-use-in-production-min-32-chars"),
		JWTExpiry: r.duration("JWT_EXPIRY", 24*time.Hour),
	}

	if cfg.DBMinConns > cfg.DBMaxConns {
		r.errs = append(r.errs, fmt.Errorf("DB_MIN_CONNS (%d) must not exceed DB_MAX_CONNS (%d)", cfg.DBMinConns, cfg.DBMaxConns))
	}
	if cfg.IsProduction() {
		if cfg.JWTSecret == "tropical-dev-jwt-secret-do-not-use-in-production-min-32-chars" || len(cfg.JWTSecret) < 32 {
			r.errs = append(r.errs, errors.New("JWT_SECRET must be set and contain at least 32 characters in production"))
		}
	}
	// In production the SPA is normally served same-origin behind the Ingress,
	// so an empty origin list is valid; a wildcard is never acceptable.
	for _, o := range cfg.CORSAllowedOrigins {
		if o == "*" && cfg.IsProduction() {
			r.errs = append(r.errs, errors.New(`CORS_ALLOWED_ORIGINS must not contain "*" in production`))
		}
	}

	if len(r.errs) > 0 {
		return Config{}, fmt.Errorf("invalid configuration:\n  - %s", joinErrs(r.errs))
	}
	return cfg, nil
}

func joinErrs(errs []error) string {
	msgs := make([]string, len(errs))
	for i, e := range errs {
		msgs[i] = e.Error()
	}
	return strings.Join(msgs, "\n  - ")
}

// reader accumulates validation errors while reading variables.
type reader struct {
	getenv Getenv
	errs   []error
}

func (r *reader) raw(key string) string { return strings.TrimSpace(r.getenv(key)) }

func (r *reader) str(key, def string) string {
	if v := r.raw(key); v != "" {
		return v
	}
	return def
}

func (r *reader) oneOf(key, def string, allowed ...string) string {
	v := strings.ToLower(r.str(key, def))
	for _, a := range allowed {
		if v == a {
			return v
		}
	}
	r.errs = append(r.errs, fmt.Errorf("%s=%q is invalid, expected one of: %s", key, v, strings.Join(allowed, ", ")))
	return def
}

func (r *reader) duration(key string, def time.Duration) time.Duration {
	v := r.raw(key)
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		r.errs = append(r.errs, fmt.Errorf("%s=%q is not a valid positive duration (e.g. 15s, 2m)", key, v))
		return def
	}
	return d
}

func (r *reader) int32(key string, def, min int32) int32 {
	v := r.raw(key)
	if v == "" {
		return def
	}
	n, err := strconv.ParseInt(v, 10, 32)
	if err != nil || int32(n) < min {
		r.errs = append(r.errs, fmt.Errorf("%s=%q must be an integer >= %d", key, v, min))
		return def
	}
	return int32(n)
}

func (r *reader) list(key string) []string {
	v := r.raw(key)
	if v == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// requiredURL reads a mandatory variable and validates its URL scheme. The
// value itself is never included in error messages because it may contain
// credentials.
func (r *reader) requiredURL(key string, schemes ...string) string {
	v := r.raw(key)
	if v == "" {
		r.errs = append(r.errs, fmt.Errorf("%s is required but not set", key))
		return ""
	}
	u, err := url.Parse(v)
	if err != nil || u.Host == "" {
		r.errs = append(r.errs, fmt.Errorf("%s is not a valid URL", key))
		return ""
	}
	for _, s := range schemes {
		if u.Scheme == s {
			return v
		}
	}
	r.errs = append(r.errs, fmt.Errorf("%s must use one of the schemes: %s", key, strings.Join(schemes, ", ")))
	return ""
}
