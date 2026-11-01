// Package finance implements financial reports, P&L (Profit & Loss),
// operating expense ledger (OPEX), and Break-Even Point (BEP) tracking.
package finance

import (
	"log/slog"

	"github.com/go-chi/chi/v5"

	"tropical-fnb/backend/internal/modules/finance/handler"
	"tropical-fnb/backend/internal/modules/finance/repository"
	"tropical-fnb/backend/internal/modules/finance/usecase"
	iamdomain "tropical-fnb/backend/internal/modules/iam/domain"
	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/platform/database"
)

// Module implements server.Module for Finance.
type Module struct {
	tokenManager iamdomain.TokenManager
	handler      *handler.FinanceHandler
}

// Config provides the module's dependencies.
type Config struct {
	TxManager    *database.TxManager
	TokenManager iamdomain.TokenManager
	Log          *slog.Logger
}

// New wires the finance module.
func New(cfg Config) *Module {
	repo := repository.NewFinanceRepo(cfg.TxManager)
	uc := usecase.NewFinanceUsecase(repo)
	return &Module{
		tokenManager: cfg.TokenManager,
		handler:      handler.NewFinanceHandler(uc, cfg.Log),
	}
}

// Name returns the module identifier.
func (m *Module) Name() string { return "finance" }

// RegisterRoutes registers the endpoints under /api/v1/finance.
func (m *Module) RegisterRoutes(r chi.Router) {
	r.Group(func(p chi.Router) {
		p.Use(iammw.Authenticate(m.tokenManager))

		// 1. Profit & Loss Statement (P&L)
		p.Get("/finance/pnl", m.handler.GetPnL)

		// 2. Break-Even Point (BEP) Realtime Cockpit
		p.Get("/finance/bep", m.handler.GetBEP)

		// 3. Operating Expense Categories & Ledger
		p.Get("/finance/categories", m.handler.ListCategories)
		p.Get("/finance/expenses", m.handler.ListExpenses)
		p.Post("/finance/expenses", m.handler.CreateExpense)
	})
}
