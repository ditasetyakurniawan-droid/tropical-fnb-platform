// Command api is the Tropical F&B Platform HTTP API (modular monolith).
package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"tropical-fnb/backend/internal/modules/crm"
	"tropical-fnb/backend/internal/modules/finance"
	"tropical-fnb/backend/internal/modules/iam"
	"tropical-fnb/backend/internal/modules/inventory"
	"tropical-fnb/backend/internal/modules/menu"
	"tropical-fnb/backend/internal/modules/payroll"
	"tropical-fnb/backend/internal/modules/pos"
	"tropical-fnb/backend/internal/modules/sop"
	"tropical-fnb/backend/internal/platform/config"
	"tropical-fnb/backend/internal/platform/database"
	"tropical-fnb/backend/internal/platform/logger"
	"tropical-fnb/backend/internal/platform/server"
)

// Injected at build time: -ldflags "-X main.version=... -X main.commit=...".
var (
	version = "dev"
	commit  = "none"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "fatal: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	log := logger.NewWithOptions(os.Stdout, logger.Options{
		Env:         cfg.Env,
		Level:       cfg.LogLevel,
		Format:      cfg.LogFormat,
		ServiceName: cfg.ServiceName,
	})
	log.Info("server_starting", "module", "system", "version", version, "commit", commit)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := database.NewPool(ctx, database.PoolConfig{
		URL:      cfg.DatabaseURL,
		MaxConns: cfg.DBMaxConns,
		MinConns: cfg.DBMinConns,
	})
	if err != nil {
		return err
	}
	defer pool.Close()
	log.Info("database connected")

	txMgr := database.NewTxManager(pool)
	iamMod, err := iam.New(iam.Config{
		TxManager:   txMgr,
		JWTSecret:   cfg.JWTSecret,
		TokenExpiry: cfg.JWTExpiry,
		Log:         log,
	})
	if err != nil {
		return fmt.Errorf("init iam module: %w", err)
	}

	menuMod := menu.New(menu.Config{
		TxManager:    txMgr,
		TokenManager: iamMod.TokenManager(),
		Log:          log,
	})

	posMod := pos.New(pos.Config{
		TxManager:    txMgr,
		TokenManager: iamMod.TokenManager(),
		Log:          log,
	})

	payrollMod := payroll.New(payroll.Config{
		TxManager:    txMgr,
		TokenManager: iamMod.TokenManager(),
		Log:          log,
	})

	inventoryMod := inventory.New(inventory.Config{
		TxManager:       txMgr,
		TokenManager:    iamMod.TokenManager(),
		HPARecalculator: menuMod.Repository(),
		Log:             log,
	})

	financeMod := finance.New(finance.Config{
		TxManager:    txMgr,
		TokenManager: iamMod.TokenManager(),
		Log:          log,
	})

	crmMod := crm.New(crm.Config{
		TxManager:    txMgr,
		TokenManager: iamMod.TokenManager(),
		Log:          log,
	})

	sopMod := sop.New(sop.Config{
		TxManager:    txMgr,
		TokenManager: iamMod.TokenManager(),
		Log:          log,
	})

	handler := server.New(server.Options{
		Log: log,
		DB:  pool,
		Build: server.BuildInfo{
			Service:     "tropical-fnb-api",
			Version:     version,
			Commit:      commit,
			Environment: cfg.Env,
		},
		CORSOrigins: cfg.CORSAllowedOrigins,
		Modules: []server.Module{
			iamMod,
			menuMod,
			posMod,
			payrollMod,
			inventoryMod,
			financeMod,
			crmMod,
			sopMod,
		},
	})

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       cfg.IdleTimeout,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("http server listening", "addr", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case err := <-errCh:
		return fmt.Errorf("http server: %w", err)
	case <-ctx.Done():
		log.Info("shutdown signal received, draining connections")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	log.Info("server stopped cleanly")
	return nil
}
