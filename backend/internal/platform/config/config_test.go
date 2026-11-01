package config

import (
	"strings"
	"testing"
	"time"
)

// env builds a Getenv backed by a map.
func env(m map[string]string) Getenv {
	return func(k string) string { return m[k] }
}

const validDSN = "postgres://user:pass@localhost:5432/tropical?sslmode=disable"

func TestLoad_Defaults(t *testing.T) {
	cfg, err := Load(env(map[string]string{"DATABASE_URL": validDSN}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Env != EnvDevelopment || cfg.LogLevel != "info" || cfg.HTTPAddr != ":8080" {
		t.Errorf("unexpected defaults: %+v", cfg)
	}
	if cfg.ServiceName != "tropical-erp" || cfg.LogFormat != "pretty" {
		t.Errorf("unexpected service/log defaults: %+v", cfg)
	}
	if cfg.ShutdownTimeout != 20*time.Second || cfg.DBMaxConns != 20 || cfg.DBMinConns != 2 {
		t.Errorf("unexpected numeric defaults: %+v", cfg)
	}
	if len(cfg.CORSAllowedOrigins) != 0 {
		t.Errorf("expected no CORS origins by default, got %v", cfg.CORSAllowedOrigins)
	}
}

func TestLoad_Overrides(t *testing.T) {
	cfg, err := Load(env(map[string]string{
		"APP_ENV":              "Production",
		"SERVICE_NAME":         "tropical-erp-cloud",
		"LOG_LEVEL":            "WARN",
		"LOG_FORMAT":           "json",
		"HTTP_ADDR":            ":9000",
		"SHUTDOWN_TIMEOUT":     "45s",
		"DATABASE_URL":         validDSN,
		"DB_MAX_CONNS":         "50",
		"DB_MIN_CONNS":         "5",
		"CORS_ALLOWED_ORIGINS": " https://a.example.com , https://b.example.com ,",
		"JWT_SECRET":           "production-super-secret-key-that-is-definitely-over-32-chars",
		"JWT_EXPIRY":           "12h",
	}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !cfg.IsProduction() || cfg.LogLevel != "warn" || cfg.HTTPAddr != ":9000" {
		t.Errorf("overrides not applied: %+v", cfg)
	}
	if cfg.ServiceName != "tropical-erp-cloud" || cfg.LogFormat != "json" {
		t.Errorf("service/log overrides not applied: %+v", cfg)
	}

	if cfg.ShutdownTimeout != 45*time.Second || cfg.DBMaxConns != 50 || cfg.DBMinConns != 5 {
		t.Errorf("numeric overrides not applied: %+v", cfg)
	}
	if cfg.JWTExpiry != 12*time.Hour || cfg.JWTSecret != "production-super-secret-key-that-is-definitely-over-32-chars" {
		t.Errorf("jwt overrides not applied: %+v", cfg)
	}
	if got := strings.Join(cfg.CORSAllowedOrigins, "|"); got != "https://a.example.com|https://b.example.com" {
		t.Errorf("unexpected CORS origins: %q", got)
	}
}

func TestLoad_JWTSecretProduction(t *testing.T) {
	_, err := Load(env(map[string]string{
		"APP_ENV":      "production",
		"DATABASE_URL": validDSN,
		"JWT_SECRET":   "too-short",
	}))
	if err == nil || !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Fatalf("expected error for short JWT_SECRET in production, got %v", err)
	}
}

func TestLoad_ReportsAllProblemsAtOnce(t *testing.T) {
	_, err := Load(env(map[string]string{
		"APP_ENV":           "prod", // invalid
		"HTTP_READ_TIMEOUT": "soon", // invalid
		"DB_MAX_CONNS":      "zero", // invalid
		// DATABASE_URL missing
	}))
	if err == nil {
		t.Fatal("expected an error")
	}
	for _, want := range []string{"APP_ENV", "HTTP_READ_TIMEOUT", "DB_MAX_CONNS", "DATABASE_URL is required"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error should mention %q, got:\n%v", want, err)
		}
	}
}

func TestLoad_DatabaseURLValidation(t *testing.T) {
	cases := map[string]string{
		"wrong scheme": "mysql://u:p@host/db",
		"no host":      "postgres:///db",
		"not a url":    "::::",
	}
	for name, dsn := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := Load(env(map[string]string{"DATABASE_URL": dsn})); err == nil {
				t.Fatalf("expected error for %q", dsn)
			}
		})
	}
}

func TestLoad_NeverLeaksSecretsInErrors(t *testing.T) {
	_, err := Load(env(map[string]string{"DATABASE_URL": "mysql://admin:SuperSecret@host/db"}))
	if err == nil {
		t.Fatal("expected error")
	}
	if strings.Contains(err.Error(), "SuperSecret") {
		t.Fatalf("error leaks credentials: %v", err)
	}
}

func TestLoad_PoolBounds(t *testing.T) {
	_, err := Load(env(map[string]string{"DATABASE_URL": validDSN, "DB_MAX_CONNS": "5", "DB_MIN_CONNS": "10"}))
	if err == nil || !strings.Contains(err.Error(), "DB_MIN_CONNS") {
		t.Fatalf("expected pool bounds error, got %v", err)
	}
}

func TestLoad_RejectsWildcardCORSInProduction(t *testing.T) {
	base := map[string]string{"DATABASE_URL": validDSN, "CORS_ALLOWED_ORIGINS": "*"}

	if _, err := Load(env(base)); err != nil {
		t.Fatalf("wildcard should be allowed in development: %v", err)
	}
	base["APP_ENV"] = "production"
	if _, err := Load(env(base)); err == nil {
		t.Fatal("wildcard must be rejected in production")
	}
}
