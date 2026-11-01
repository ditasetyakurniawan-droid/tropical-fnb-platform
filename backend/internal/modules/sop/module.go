// Package sop implements daily operational checklists, quality assurance,
// and store quality audit scorecard management.
package sop

import (
	"log/slog"

	"github.com/go-chi/chi/v5"

	iamdomain "tropical-fnb/backend/internal/modules/iam/domain"
	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/modules/sop/handler"
	"tropical-fnb/backend/internal/modules/sop/repository"
	"tropical-fnb/backend/internal/modules/sop/usecase"
	"tropical-fnb/backend/internal/platform/database"
)

// Module implements server.Module for SOP & Quality Assurance.
type Module struct {
	tokenManager iamdomain.TokenManager
	handler      *handler.SOPHandler
}

// Config provides the module's dependencies.
type Config struct {
	TxManager    *database.TxManager
	TokenManager iamdomain.TokenManager
	Log          *slog.Logger
}

// New wires the SOP module.
func New(cfg Config) *Module {
	repo := repository.NewSOPRepository(cfg.TxManager)
	uc := usecase.NewSOPUsecase(repo)
	return &Module{
		tokenManager: cfg.TokenManager,
		handler:      handler.NewSOPHandler(uc, cfg.Log),
	}
}

// Name returns the module identifier.
func (m *Module) Name() string { return "sop" }

// RegisterRoutes registers the endpoints under /api/v1/sop.
func (m *Module) RegisterRoutes(r chi.Router) {
	r.Group(func(p chi.Router) {
		p.Use(iammw.Authenticate(m.tokenManager))

		// Master SOP Templates
		p.Get("/sop/templates", m.handler.ListTemplates)
		p.Get("/sop/templates/{id}", m.handler.GetTemplate)
		p.Post("/sop/templates", m.handler.CreateTemplate)
		p.Put("/sop/templates/{id}", m.handler.UpdateTemplate)
		p.Delete("/sop/templates/{id}", m.handler.DeleteTemplate)

		// Digital Handbook Guidelines
		p.Get("/sop/handbook", m.handler.ListHandbookArticles)
		p.Get("/sop/handbook/{id}", m.handler.GetHandbookArticle)
		p.Post("/sop/handbook", m.handler.CreateHandbookArticle)
		p.Put("/sop/handbook/{id}", m.handler.UpdateHandbookArticle)
		p.Delete("/sop/handbook/{id}", m.handler.DeleteHandbookArticle)

		// Daily Checklist Runs
		p.Get("/sop/runs", m.handler.ListChecklistRuns)
		p.Get("/sop/runs/{id}", m.handler.GetChecklistRun)
		p.Post("/sop/runs", m.handler.CreateChecklistRun)
		p.Put("/sop/runs/{id}/items/{recordId}", m.handler.UpdateChecklistItem)
		p.Post("/sop/runs/{id}/complete", m.handler.CompleteChecklistRun)

		// Quality Audits & Action Items
		p.Get("/sop/audits", m.handler.ListQualityAudits)
		p.Get("/sop/audits/{id}", m.handler.GetQualityAudit)
		p.Post("/sop/audits", m.handler.CreateQualityAudit)
		p.Put("/sop/audits/actions/{id}", m.handler.UpdateActionItemStatus)
	})
}
