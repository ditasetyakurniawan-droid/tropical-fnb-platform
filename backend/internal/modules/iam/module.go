// Package iam implements the Identity & Access Management module.
package iam

import (
	"log/slog"
	"time"

	"github.com/go-chi/chi/v5"

	"tropical-fnb/backend/internal/modules/iam/domain"
	"tropical-fnb/backend/internal/modules/iam/handler"
	"tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/modules/iam/repository"
	"tropical-fnb/backend/internal/modules/iam/token"
	"tropical-fnb/backend/internal/modules/iam/usecase"
	"tropical-fnb/backend/internal/platform/database"
)

// Module implements server.Module for IAM.
type Module struct {
	tokenManager domain.TokenManager
	authUsecase  *usecase.AuthUsecase
	handler      *handler.AuthHandler
	log          *slog.Logger
}

// Config provides dependencies to build the IAM module.
type Config struct {
	TxManager   *database.TxManager
	JWTSecret   string
	TokenExpiry time.Duration
	Log         *slog.Logger
}

// New creates and wires an IAM Module instance.
func New(cfg Config) (*Module, error) {
	jwtMgr, err := token.NewJWTManager(cfg.JWTSecret)
	if err != nil {
		return nil, err
	}
	userRepo := repository.NewPostgresUserRepository(cfg.TxManager)
	authUc := usecase.NewAuthUsecase(userRepo, jwtMgr, cfg.TokenExpiry)
	authHandler := handler.NewAuthHandler(authUc, cfg.Log)

	return &Module{
		tokenManager: jwtMgr,
		authUsecase:  authUc,
		handler:      authHandler,
		log:          cfg.Log,
	}, nil
}

// Name returns the module identifier.
func (m *Module) Name() string {
	return "iam"
}

// RegisterRoutes registers IAM endpoints under the /api/v1 prefix.
func (m *Module) RegisterRoutes(r chi.Router) {
	r.Post("/auth/login", m.handler.Login)

	r.Group(func(protected chi.Router) {
		protected.Use(middleware.Authenticate(m.tokenManager))
		protected.Get("/auth/me", m.handler.Me)
		protected.Post("/auth/verify-pin", m.handler.VerifyPIN)
	})
}

// TokenManager exposes the token manager for other modules if needed.
func (m *Module) TokenManager() domain.TokenManager {
	return m.tokenManager
}
