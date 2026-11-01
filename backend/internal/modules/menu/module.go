// Package menu implements the Menu, Recipe BOM, Sub-Recipe, Master Ingredients, and Universal Yield module.
package menu

import (
	"log/slog"

	"github.com/go-chi/chi/v5"

	iamdomain "tropical-fnb/backend/internal/modules/iam/domain"
	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/modules/menu/domain"
	"tropical-fnb/backend/internal/modules/menu/handler"
	"tropical-fnb/backend/internal/modules/menu/repository"
	"tropical-fnb/backend/internal/modules/menu/usecase"
	"tropical-fnb/backend/internal/platform/database"
)

// Module implements server.Module for Menu, Recipes, Sub-Recipes, and Master Ingredients.
type Module struct {
	tokenManager iamdomain.TokenManager
	repo         domain.MenuRepository
	handler      *handler.MenuHandler
	log          *slog.Logger
}

// Config provides dependencies for the Menu module.
type Config struct {
	TxManager    *database.TxManager
	TokenManager iamdomain.TokenManager
	Log          *slog.Logger
}

// New creates and wires a Menu Module instance.
func New(cfg Config) *Module {
	repo := repository.NewPostgresMenuRepository(cfg.TxManager)
	uc := usecase.NewMenuUsecase(repo)
	h := handler.NewMenuHandler(uc, cfg.Log)

	return &Module{
		tokenManager: cfg.TokenManager,
		repo:         repo,
		handler:      h,
		log:          cfg.Log,
	}
}

// Name returns the module identifier.
func (m *Module) Name() string {
	return "menu"
}

// Repository returns the underlying MenuRepository (used for cross-module Cascading HPA Recalculation).
func (m *Module) Repository() domain.MenuRepository {
	return m.repo
}

// RegisterRoutes registers endpoints under /api/v1.
func (m *Module) RegisterRoutes(r chi.Router) {
	r.Group(func(protected chi.Router) {
		protected.Use(iammw.Authenticate(m.tokenManager))

		// Read endpoints (accessible to POS, KDS, and Backoffice)
		protected.Get("/menu/categories", m.handler.ListMenuCategories)
		protected.Get("/menu/items", m.handler.ListMenuItems)
		protected.Get("/menu/items/{id}", m.handler.GetMenuItemDetail)
		protected.Get("/menu/bom-options", m.handler.GetBOMOptions)
		protected.Get("/menu/ingredient-categories", m.handler.ListInventoryCategories)
		protected.Get("/menu/ingredients", m.handler.ListMasterIngredients)
		protected.Get("/recipes", m.handler.ListRecipes)
		protected.Get("/recipes/{id}", m.handler.GetSubRecipeDetail)
		protected.Get("/inventory/yield-tests", m.handler.ListYieldTests)

		// Write endpoints (strictly restricted to OWNER, OUTLET_MANAGER, and KITCHEN_CHEF)
		protected.Group(func(write chi.Router) {
			write.Use(handler.RequireMenuWriteRole)

			write.Post("/menu/categories", m.handler.CreateMenuCategory)
			write.Post("/menu/items", m.handler.CreateMenuItem)
			write.Put("/menu/items/{id}", m.handler.UpdateMenuItem)
			write.Patch("/menu/items/{id}/status", m.handler.UpdateMenuItemStatus)
			write.Delete("/menu/items/{id}", m.handler.DeleteMenuItem)
			write.Put("/menu/items/{id}/recipe", m.handler.SaveMenuRecipe)

			write.Post("/recipes", m.handler.CreateSubRecipe)
			write.Put("/recipes/{id}", m.handler.UpdateSubRecipe)
			write.Delete("/recipes/{id}", m.handler.DeleteSubRecipe)

			write.Post("/menu/ingredient-categories", m.handler.CreateInventoryCategory)
			write.Post("/menu/ingredients", m.handler.CreateMasterIngredient)
			write.Put("/menu/ingredients/{id}", m.handler.UpdateMasterIngredient)
			write.Delete("/menu/ingredients/{id}", m.handler.DeleteMasterIngredient)

			write.Post("/inventory/yield-tests", m.handler.RecordYieldTest)
		})
	})
}
