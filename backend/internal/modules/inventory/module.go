// Package inventory implements multi-warehouse inventory, procurement (PO & receiving),
// central kitchen stock transfers, blind stock opname, waste/spoilage, and dynamic/manual HPA.
package inventory

import (
	"log/slog"

	"github.com/go-chi/chi/v5"

	iamdomain "tropical-fnb/backend/internal/modules/iam/domain"
	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/modules/inventory/handler"
	"tropical-fnb/backend/internal/modules/inventory/repository"
	"tropical-fnb/backend/internal/modules/inventory/usecase"
	"tropical-fnb/backend/internal/platform/database"
)

// Module implements server.Module for Inventory & Procurement.
type Module struct {
	tokenManager iamdomain.TokenManager
	handler      *handler.InventoryHandler
}

// Config provides the module's dependencies.
type Config struct {
	TxManager       *database.TxManager
	TokenManager    iamdomain.TokenManager
	HPARecalculator repository.CascadingHPARecalculator
	Log             *slog.Logger
}

// New wires the inventory module.
func New(cfg Config) *Module {
	repo := repository.NewInventoryRepo(cfg.TxManager)
	if cfg.HPARecalculator != nil {
		repo.SetHPARecalculator(cfg.HPARecalculator)
	}
	uc := usecase.NewUsecase(repo)
	return &Module{
		tokenManager: cfg.TokenManager,
		handler:      handler.NewInventoryHandler(uc, cfg.Log),
	}
}

// Name returns the module identifier.
func (m *Module) Name() string { return "inventory" }

// RegisterRoutes registers the endpoints under /api/v1/inventory and /api/v1/procurement.
func (m *Module) RegisterRoutes(r chi.Router) {
	r.Group(func(p chi.Router) {
		p.Use(iammw.Authenticate(m.tokenManager))

		// 1. Warehouses & Balances (Decentralized Multi-Outlet)
		p.Get("/inventory/warehouses", m.handler.ListWarehouses)
		p.Post("/inventory/warehouses", m.handler.CreateWarehouse)
		p.Get("/inventory/warehouses/{id}", m.handler.GetWarehouse)
		p.Put("/inventory/warehouses/{id}", m.handler.UpdateWarehouse)
		p.Delete("/inventory/warehouses/{id}", m.handler.DeleteWarehouse)
		p.Get("/inventory/stock-balances", m.handler.ListStockBalances)
		p.Get("/inventory/items", m.handler.ListInventoryItems)

		// 2. Suppliers
		p.Get("/procurement/suppliers", m.handler.ListSuppliers)
		p.Post("/procurement/suppliers", m.handler.CreateSupplier)

		// 3. Purchase Orders
		p.Get("/procurement/purchase-orders", m.handler.ListPurchaseOrders)
		p.Get("/procurement/purchase-orders/{id}", m.handler.GetPurchaseOrder)
		p.Post("/procurement/purchase-orders", m.handler.CreatePurchaseOrder)
		p.Post("/procurement/purchase-orders/{id}/cancel", m.handler.CancelPurchaseOrder)

		// 4. Goods Receipts (Receiving with actual weight scale)
		p.Get("/procurement/goods-receipts", m.handler.ListGoodsReceipts)
		p.Post("/procurement/goods-receipts", m.handler.CreateGoodsReceipt)

		// 5. Stock Transfers (Decentralized Peer-to-Peer Inter-Branch & Intra-Branch)
		p.Get("/inventory/transfers", m.handler.ListStockTransfers)
		p.Post("/inventory/transfers", m.handler.CreateStockTransfer)
		p.Get("/inventory/transfers/{id}", m.handler.GetStockTransfer)
		p.Post("/inventory/transfers/{id}/dispatch", m.handler.DispatchStockTransfer)
		p.Post("/inventory/transfers/{id}/receive", m.handler.ReceiveStockTransfer)
		p.Post("/inventory/transfers/{id}/cancel", m.handler.CancelStockTransfer)

		// 6. Blind Stock Opname
		p.Get("/inventory/opnames", m.handler.ListStockOpnames)
		p.Get("/inventory/opnames/{id}", m.handler.GetStockOpname)
		p.Post("/inventory/opnames", m.handler.CreateStockOpname)
		p.Post("/inventory/opnames/{id}/count", m.handler.SaveOpnameCount)
		p.Post("/inventory/opnames/{id}/approve", m.handler.ApproveStockOpname)

		// 7. Waste, Spoilage & Staff Meal
		p.Get("/inventory/waste", m.handler.ListWasteRecords)
		p.Post("/inventory/waste", m.handler.CreateWasteRecord)

		// 8. Menu HPA Configuration & Monitoring (Dynamic BOM vs Manual Override)
		p.Get("/inventory/menu-hpa", m.handler.ListMenuHpa)
		p.Put("/inventory/menu-hpa/{id}", m.handler.UpdateMenuHpaMode)
	})
}
