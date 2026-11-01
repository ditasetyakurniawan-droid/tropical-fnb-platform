// Package payroll implements HR & Payroll: employees, geofenced attendance,
// kasbon, service-charge pool and the monthly payroll run of each outlet.
package payroll

import (
	"log/slog"

	"github.com/go-chi/chi/v5"

	iamdomain "tropical-fnb/backend/internal/modules/iam/domain"
	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/modules/payroll/handler"
	"tropical-fnb/backend/internal/modules/payroll/repository"
	"tropical-fnb/backend/internal/modules/payroll/usecase"
	"tropical-fnb/backend/internal/platform/database"
)

// Module implements server.Module for HR & Payroll.
type Module struct {
	tokenManager iamdomain.TokenManager
	handler      *handler.PayrollHandler
}

// Config provides the module's dependencies.
type Config struct {
	TxManager    *database.TxManager
	TokenManager iamdomain.TokenManager
	Log          *slog.Logger
}

// New wires the payroll module.
func New(cfg Config) *Module {
	repo := repository.NewPostgresPayrollRepository(cfg.TxManager)
	uc := usecase.New(repo, cfg.Log)
	return &Module{
		tokenManager: cfg.TokenManager,
		handler:      handler.NewPayrollHandler(uc, cfg.Log),
	}
}

// Name returns the module identifier.
func (m *Module) Name() string { return "payroll" }

// RegisterRoutes registers the endpoints under /api/v1/hr. Authorization is
// enforced per outlet inside the use case (role_permissions in the database).
func (m *Module) RegisterRoutes(r chi.Router) {
	r.Group(func(p chi.Router) {
		p.Use(iammw.Authenticate(m.tokenManager))

		p.Get("/hr/policy", m.handler.GetPolicy)
		p.Put("/hr/policy", m.handler.UpdatePolicy)
		p.Get("/hr/shifts", m.handler.ListShifts)

		p.Get("/hr/employees", m.handler.ListEmployees)
		p.Post("/hr/employees", m.handler.CreateEmployee)
		p.Put("/hr/employees/{id}", m.handler.UpdateEmployee)

		p.Get("/hr/attendance", m.handler.ListAttendance)
		p.Post("/hr/attendance", m.handler.UpsertAttendance)
		p.Post("/hr/attendance/clock-in", m.handler.ClockIn)
		p.Post("/hr/attendance/clock-out", m.handler.ClockOut)
		p.Patch("/hr/attendance/{id}/overtime", m.handler.SetOvertimeApproval)

		p.Get("/hr/advances", m.handler.ListAdvances)
		p.Post("/hr/advances", m.handler.CreateAdvance)
		p.Post("/hr/advances/{id}/cancel", m.handler.CancelAdvance)

		p.Get("/hr/payroll/runs", m.handler.ListRuns)
		p.Post("/hr/payroll/runs", m.handler.GenerateRun)
		p.Get("/hr/payroll/runs/{id}", m.handler.GetRun)
		p.Post("/hr/payroll/runs/{id}/approve", m.handler.ApproveRun)
		p.Post("/hr/payroll/runs/{id}/pay", m.handler.MarkRunPaid)
		p.Post("/hr/payroll/runs/{id}/cancel", m.handler.CancelRun)
	})
}
