// Package crm implements customer relationship management (CRM),
// membership loyalty tiers, points ledger, and promotional discount voucher engines.
package crm

import (
	"log/slog"

	"github.com/go-chi/chi/v5"

	"tropical-fnb/backend/internal/modules/crm/handler"
	"tropical-fnb/backend/internal/modules/crm/repository"
	"tropical-fnb/backend/internal/modules/crm/usecase"
	iamdomain "tropical-fnb/backend/internal/modules/iam/domain"
	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/platform/database"
)

// Module implements server.Module for CRM, Loyalty & Vouchers.
type Module struct {
	tokenManager iamdomain.TokenManager
	handler      *handler.CRMHandler
}

// Config provides the module's dependencies.
type Config struct {
	TxManager    *database.TxManager
	TokenManager iamdomain.TokenManager
	Log          *slog.Logger
}

// New wires the CRM module.
func New(cfg Config) *Module {
	repo := repository.NewCRMRepository(cfg.TxManager)
	uc := usecase.NewCRMUsecase(repo)
	return &Module{
		tokenManager: cfg.TokenManager,
		handler:      handler.NewCRMHandler(uc, cfg.Log),
	}
}

// Name returns the module identifier.
func (m *Module) Name() string { return "crm" }

// RegisterRoutes registers the endpoints under /api/v1/crm.
func (m *Module) RegisterRoutes(r chi.Router) {
	r.Group(func(p chi.Router) {
		p.Use(iammw.Authenticate(m.tokenManager))

		// Customers & Membership CRM
		p.Get("/crm/customers", m.handler.ListCustomers)
		p.Post("/crm/customers", m.handler.CreateCustomer)
		p.Get("/crm/customers/{id}", m.handler.GetCustomer)
		p.Put("/crm/customers/{id}", m.handler.UpdateCustomer)
		p.Post("/crm/customers/{id}/points", m.handler.AdjustCustomerPoints)

		// Points Ledger
		p.Get("/crm/points-ledger", m.handler.ListPointsLedger)

		// Vouchers & Promotions
		p.Get("/crm/vouchers", m.handler.ListVouchers)
		p.Post("/crm/vouchers", m.handler.CreateVoucher)
		p.Post("/crm/vouchers/validate", m.handler.ValidateVoucher)
	})
}
