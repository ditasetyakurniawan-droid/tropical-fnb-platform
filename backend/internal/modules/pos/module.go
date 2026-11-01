// Package pos implements the Point of Sale, Dining Tables, Split Bills, and Event Reservations module.
package pos

import (
	"log/slog"

	"github.com/go-chi/chi/v5"

	iamdomain "tropical-fnb/backend/internal/modules/iam/domain"
	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/modules/pos/handler"
	"tropical-fnb/backend/internal/modules/pos/repository"
	"tropical-fnb/backend/internal/modules/pos/usecase"
	"tropical-fnb/backend/internal/platform/database"
)

// Module implements server.Module for POS.
type Module struct {
	tokenManager iamdomain.TokenManager
	handler      *handler.POSHandler
	log          *slog.Logger
}

// Config provides dependencies for the POS module.
type Config struct {
	TxManager    *database.TxManager
	TokenManager iamdomain.TokenManager
	Log          *slog.Logger
}

// New creates and wires a POS Module instance.
func New(cfg Config) *Module {
	repo := repository.NewPostgresPOSRepository(cfg.TxManager)
	uc := usecase.NewPOSUsecase(repo)
	h := handler.NewPOSHandler(uc, cfg.Log)

	return &Module{
		tokenManager: cfg.TokenManager,
		handler:      h,
		log:          cfg.Log,
	}
}

// Name returns the module identifier.
func (m *Module) Name() string {
	return "pos"
}

// RegisterRoutes registers endpoints under /api/v1.
func (m *Module) RegisterRoutes(r chi.Router) {
	r.Group(func(protected chi.Router) {
		protected.Use(iammw.Authenticate(m.tokenManager))

		// Meja & Gazebo Management
		protected.Get("/pos/tables", m.handler.ListTables)
		protected.Patch("/pos/tables/{id}/status", m.handler.UpdateTableStatus)

		// Orders & Cashiering
		protected.Get("/pos/orders", m.handler.ListOrders)
		protected.Get("/pos/orders/{id}", m.handler.GetOrderByID)
		protected.Post("/pos/orders", m.handler.CreateOrder)
		protected.Post("/pos/orders/{id}/items", m.handler.AddOrderItems)
		protected.Post("/pos/orders/{id}/pay", m.handler.ProcessPayment)

		// Split Bill Engine
		protected.Post("/pos/orders/{id}/split/evenly", m.handler.SplitBillEvenly)
		protected.Post("/pos/orders/{id}/split/by-items", m.handler.SplitBillByItems)
		protected.Post("/pos/orders/{id}/split/{split_id}/pay", m.handler.PaySplitBill)

		// Event & Gathering Reservations
		protected.Get("/pos/reservations", m.handler.ListReservations)
		protected.Post("/pos/reservations", m.handler.CreateReservation)
		protected.Post("/pos/reservations/{id}/check-in", m.handler.CheckInReservation)
		protected.Get("/pos/reservations/{id}/preorders", m.handler.ListReservationPreorders)
		protected.Post("/pos/reservations/{id}/preorders", m.handler.AddReservationPreorder)
		protected.Put("/pos/reservations/{id}/prep-status", m.handler.UpdateReservationPrepStatus)
		protected.Post("/pos/reservations/{id}/wa-reminder", m.handler.SendReservationWAReminder)

		// Banquet Packages (Buffet & Set Menus)
		protected.Get("/pos/banquet-packages", m.handler.ListBanquetPackages)
		protected.Post("/pos/banquet-packages", m.handler.CreateBanquetPackage)

		// Kitchen Display System (KDS) & Multi-Station Routing
		protected.Get("/pos/kds/tickets", m.handler.ListKitchenTickets)
		protected.Patch("/pos/kds/orders/{id}/status", m.handler.UpdateOrderStatus)
		protected.Patch("/pos/kds/orders/{order_id}/items/{item_id}/status", m.handler.UpdateOrderItemStatus)
		protected.Post("/pos/kds/orders/{id}/bump", m.handler.BumpTicket)

		// Cashier Shifts & Cash Drawer Reconciliation
		protected.Get("/pos/shifts/current", m.handler.GetCurrentShift)
		protected.Get("/pos/shifts", m.handler.ListShifts)
		protected.Post("/pos/shifts/open", m.handler.OpenShift)
		protected.Post("/pos/shifts/{id}/close", m.handler.CloseShift)
		protected.Get("/pos/shifts/{id}/x-report", m.handler.GetXReport)
		protected.Get("/pos/shifts/{id}/z-report", m.handler.GetZReport)
		protected.Get("/pos/shifts/{id}/cash-movements", m.handler.ListCashMovements)
		protected.Post("/pos/shifts/{id}/cash-movements", m.handler.AddCashMovement)
	})
}
