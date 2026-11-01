// Package handler provides HTTP endpoints for Menu, Categories, Recipes, Sub-Recipes, Master Ingredients, and Yield Tests.
package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	"tropical-fnb/backend/internal/modules/menu/domain"
	"tropical-fnb/backend/internal/modules/menu/usecase"
	"tropical-fnb/backend/internal/platform/httpx"
)

// MenuHandler serves HTTP requests for menus, recipes, sub-recipes, and master ingredients.
type MenuHandler struct {
	menuUsecase *usecase.MenuUsecase
	log         *slog.Logger
}

// NewMenuHandler creates a new MenuHandler.
func NewMenuHandler(menuUsecase *usecase.MenuUsecase, log *slog.Logger) *MenuHandler {
	return &MenuHandler{
		menuUsecase: menuUsecase,
		log:         log,
	}
}

// RequireMenuWriteRole enforces that only OWNER, OUTLET_MANAGER, or KITCHEN_CHEF can mutate master menus, recipes, and ingredients.
func RequireMenuWriteRole(next http.Handler) http.Handler {
	allowed := map[string]bool{
		"OWNER":          true,
		"OUTLET_MANAGER": true,
		"KITCHEN_CHEF":   true,
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		roles := iammw.RolesFromContext(r.Context())
		for _, role := range roles {
			if allowed[strings.ToUpper(strings.TrimSpace(role))] {
				next.ServeHTTP(w, r)
				return
			}
		}
		httpx.Error(w, r, http.StatusForbidden, "forbidden", "akses ditolak: hanya Owner, Manajer Resto, atau Master Chef yang diizinkan mengubah Master Menu & Resep")
	})
}

func isBusinessValidationError(errStr string) bool {
	keywords := []string{
		"wajib",
		"tidak kompatibel",
		"sirkular",
		"circular",
		"lebih besar dari 0",
		"tidak boleh",
		"tidak dapat dihapus",
		"masih digunakan",
		"tidak valid",
		"harus",
		"tentukan Harga Jual",
		"antara 0.01%",
	}
	lower := strings.ToLower(errStr)
	for _, kw := range keywords {
		if strings.Contains(lower, strings.ToLower(kw)) {
			return true
		}
	}
	return false
}

// -----------------------------------------------------------------------------
// 1. Menu Categories & Menu Items (Tier 3 + R&D Lifecycle)
// -----------------------------------------------------------------------------

// ListMenuCategories handles GET /api/v1/menu/categories.
func (h *MenuHandler) ListMenuCategories(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	cats, err := h.menuUsecase.ListMenuCategories(r.Context(), tenantID)
	if err != nil {
		h.log.Error("list menu categories error", "error", err)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mengambil kategori menu")
		return
	}
	if cats == nil {
		cats = make([]domain.MenuCategory, 0)
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(cats))
}

// CreateMenuCategory handles POST /api/v1/menu/categories.
func (h *MenuHandler) CreateMenuCategory(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 32*1024)
	var req domain.CreateMenuCategoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_request", "payload JSON kategori menu tidak valid")
		return
	}

	cat, err := h.menuUsecase.CreateMenuCategory(r.Context(), tenantID, req)
	if err != nil {
		if isBusinessValidationError(err.Error()) {
			httpx.Error(w, r, http.StatusUnprocessableEntity, "unprocessable_entity", err.Error())
			return
		}
		h.log.Error("create menu category error", "error", err)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal membuat kategori menu")
		return
	}
	httpx.JSON(w, http.StatusCreated, cat)
}

// ListMenuItems handles GET /api/v1/menu/items.
func (h *MenuHandler) ListMenuItems(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	var outletID *uuid.UUID
	if q := r.URL.Query().Get("outlet_id"); q != "" && q != "ALL" {
		if parsed, err := uuid.Parse(q); err == nil {
			outletID = &parsed
		}
	} else if q != "ALL" {
		if oid, ok := iammw.ActiveOutletIDFromContext(r.Context()); ok {
			outletID = &oid
		}
	}

	posOnly := strings.EqualFold(r.URL.Query().Get("pos_only"), "true") || r.URL.Query().Get("pos_only") == "1"

	items, err := h.menuUsecase.ListMenuItems(r.Context(), tenantID, domain.MenuListFilter{
		OutletID: outletID,
		POSOnly:  posOnly,
	})
	if err != nil {
		h.log.Error("list menu items error", "error", err)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mengambil daftar menu")
		return
	}

	if items == nil {
		items = make([]domain.MenuItemWithHPA, 0)
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(items))
}

// GetMenuItemDetail handles GET /api/v1/menu/items/{id}.
func (h *MenuHandler) GetMenuItemDetail(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	menuID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID menu tidak valid")
		return
	}

	detail, err := h.menuUsecase.GetMenuItemDetail(r.Context(), tenantID, menuID)
	if err != nil {
		if errors.Is(err, usecase.ErrMenuNotFound) {
			httpx.Error(w, r, http.StatusNotFound, "menu_not_found", "menu tidak ditemukan")
			return
		}
		h.log.Error("get menu detail error", "error", err, "menu_id", menuID)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mengambil rincian menu")
		return
	}

	httpx.JSON(w, http.StatusOK, detail)
}

// CreateMenuItem handles POST /api/v1/menu/items.
func (h *MenuHandler) CreateMenuItem(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 128*1024)
	var req domain.SaveMenuItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_request", "payload JSON menu tidak valid")
		return
	}

	detail, err := h.menuUsecase.CreateMenuItem(r.Context(), tenantID, req)
	if err != nil {
		if isBusinessValidationError(err.Error()) {
			httpx.Error(w, r, http.StatusUnprocessableEntity, "unprocessable_entity", err.Error())
			return
		}
		h.log.Error("create menu item error", "error", err)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal membuat menu baru: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusCreated, detail)
}

// UpdateMenuItem handles PUT /api/v1/menu/items/{id}.
func (h *MenuHandler) UpdateMenuItem(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	menuID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID menu tidak valid")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 128*1024)
	var req domain.SaveMenuItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_request", "payload JSON menu tidak valid")
		return
	}

	detail, err := h.menuUsecase.UpdateMenuItem(r.Context(), tenantID, menuID, req)
	if err != nil {
		if errors.Is(err, usecase.ErrMenuNotFound) {
			httpx.Error(w, r, http.StatusNotFound, "menu_not_found", "menu tidak ditemukan")
			return
		}
		if isBusinessValidationError(err.Error()) {
			httpx.Error(w, r, http.StatusUnprocessableEntity, "unprocessable_entity", err.Error())
			return
		}
		h.log.Error("update menu item error", "error", err, "menu_id", menuID)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal memperbarui menu: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, detail)
}

// UpdateMenuItemStatus handles PATCH /api/v1/menu/items/{id}/status.
func (h *MenuHandler) UpdateMenuItemStatus(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	menuID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID menu tidak valid")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	var req domain.UpdateMenuItemStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_request", "payload JSON status menu tidak valid")
		return
	}

	detail, err := h.menuUsecase.UpdateMenuItemStatus(r.Context(), tenantID, menuID, req)
	if err != nil {
		if errors.Is(err, usecase.ErrMenuNotFound) {
			httpx.Error(w, r, http.StatusNotFound, "menu_not_found", "menu tidak ditemukan")
			return
		}
		if isBusinessValidationError(err.Error()) {
			httpx.Error(w, r, http.StatusUnprocessableEntity, "unprocessable_entity", err.Error())
			return
		}
		h.log.Error("update menu status error", "error", err, "menu_id", menuID)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mengubah status menu")
		return
	}

	httpx.JSON(w, http.StatusOK, detail)
}

// DeleteMenuItem handles DELETE /api/v1/menu/items/{id}.
func (h *MenuHandler) DeleteMenuItem(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	menuID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID menu tidak valid")
		return
	}

	if err := h.menuUsecase.DeleteMenuItem(r.Context(), tenantID, menuID); err != nil {
		if errors.Is(err, usecase.ErrMenuNotFound) {
			httpx.Error(w, r, http.StatusNotFound, "menu_not_found", "menu tidak ditemukan")
			return
		}
		h.log.Error("delete menu item error", "error", err, "menu_id", menuID)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mengarsipkan menu")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"status": "archived", "id": menuID})
}

// SaveMenuRecipe handles PUT /api/v1/menu/items/{id}/recipe.
func (h *MenuHandler) SaveMenuRecipe(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	menuID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID menu tidak valid")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 128*1024)
	var req domain.SaveRecipeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_request", "payload JSON resep tidak valid")
		return
	}

	detail, err := h.menuUsecase.SaveMenuRecipe(r.Context(), tenantID, menuID, req)
	if err != nil {
		if isBusinessValidationError(err.Error()) {
			httpx.Error(w, r, http.StatusUnprocessableEntity, "unprocessable_entity", err.Error())
			return
		}
		h.log.Error("save menu recipe error", "error", err, "menu_id", menuID)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal menyimpan resep menu: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, detail)
}

// GetBOMOptions handles GET /api/v1/menu/bom-options.
func (h *MenuHandler) GetBOMOptions(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	options, err := h.menuUsecase.GetBOMOptions(r.Context(), tenantID)
	if err != nil {
		h.log.Error("get bom options error", "error", err)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mengambil opsi bahan baku BOM")
		return
	}

	if options.InventoryItems == nil {
		options.InventoryItems = make([]domain.InventoryItemBOMOption, 0)
	}
	if options.SubRecipes == nil {
		options.SubRecipes = make([]domain.RecipeSummary, 0)
	}

	httpx.JSON(w, http.StatusOK, options)
}

// -----------------------------------------------------------------------------
// 2. Sub-Recipes CRUD (Tier 2 Kitchen Prep)
// -----------------------------------------------------------------------------

// ListRecipes handles GET /api/v1/recipes.
func (h *MenuHandler) ListRecipes(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	recipes, err := h.menuUsecase.ListRecipes(r.Context(), tenantID)
	if err != nil {
		h.log.Error("list recipes error", "error", err)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mengambil data resep")
		return
	}

	typeFilter := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("type")))
	if typeFilter != "" {
		filtered := make([]domain.RecipeSummary, 0)
		for _, rec := range recipes {
			if rec.RecipeType == typeFilter {
				filtered = append(filtered, rec)
			}
		}
		recipes = filtered
	}

	if recipes == nil {
		recipes = make([]domain.RecipeSummary, 0)
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(recipes))
}

// GetSubRecipeDetail handles GET /api/v1/recipes/{id}.
func (h *MenuHandler) GetSubRecipeDetail(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	recipeID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID sub-recipe tidak valid")
		return
	}

	detail, err := h.menuUsecase.GetSubRecipeDetail(r.Context(), tenantID, recipeID)
	if err != nil {
		if errors.Is(err, usecase.ErrSubRecipeNotFound) {
			httpx.Error(w, r, http.StatusNotFound, "sub_recipe_not_found", "sub-recipe tidak ditemukan")
			return
		}
		h.log.Error("get sub-recipe detail error", "error", err, "recipe_id", recipeID)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mengambil rincian sub-recipe")
		return
	}

	httpx.JSON(w, http.StatusOK, detail)
}

// CreateSubRecipe handles POST /api/v1/recipes.
func (h *MenuHandler) CreateSubRecipe(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 128*1024)
	var req domain.SaveRecipeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_request", "payload JSON sub-recipe tidak valid")
		return
	}

	detail, err := h.menuUsecase.CreateSubRecipe(r.Context(), tenantID, req)
	if err != nil {
		if isBusinessValidationError(err.Error()) {
			httpx.Error(w, r, http.StatusUnprocessableEntity, "unprocessable_entity", err.Error())
			return
		}
		h.log.Error("create sub-recipe error", "error", err)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal membuat sub-recipe: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusCreated, detail)
}

// UpdateSubRecipe handles PUT /api/v1/recipes/{id}.
func (h *MenuHandler) UpdateSubRecipe(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	recipeID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID sub-recipe tidak valid")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 128*1024)
	var req domain.SaveRecipeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_request", "payload JSON sub-recipe tidak valid")
		return
	}

	detail, err := h.menuUsecase.UpdateSubRecipe(r.Context(), tenantID, recipeID, req)
	if err != nil {
		if errors.Is(err, usecase.ErrSubRecipeNotFound) {
			httpx.Error(w, r, http.StatusNotFound, "sub_recipe_not_found", "sub-recipe tidak ditemukan")
			return
		}
		if isBusinessValidationError(err.Error()) {
			httpx.Error(w, r, http.StatusUnprocessableEntity, "unprocessable_entity", err.Error())
			return
		}
		h.log.Error("update sub-recipe error", "error", err, "recipe_id", recipeID)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal memperbarui sub-recipe: "+err.Error())
		return
	}

	httpx.JSON(w, http.StatusOK, detail)
}

// DeleteSubRecipe handles DELETE /api/v1/recipes/{id}.
func (h *MenuHandler) DeleteSubRecipe(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	recipeID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID sub-recipe tidak valid")
		return
	}

	if err := h.menuUsecase.DeleteSubRecipe(r.Context(), tenantID, recipeID); err != nil {
		if errors.Is(err, usecase.ErrSubRecipeNotFound) {
			httpx.Error(w, r, http.StatusNotFound, "sub_recipe_not_found", "sub-recipe tidak ditemukan")
			return
		}
		if isBusinessValidationError(err.Error()) {
			httpx.Error(w, r, http.StatusUnprocessableEntity, "resource_in_use", err.Error())
			return
		}
		h.log.Error("delete sub-recipe error", "error", err, "recipe_id", recipeID)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal menghapus sub-recipe")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"status": "deleted", "id": recipeID})
}

// -----------------------------------------------------------------------------
// 3. Master Raw Ingredients & Categories CRUD (Tier 1)
// -----------------------------------------------------------------------------

// ListInventoryCategories handles GET /api/v1/menu/ingredient-categories.
func (h *MenuHandler) ListInventoryCategories(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	cats, err := h.menuUsecase.ListInventoryCategories(r.Context(), tenantID)
	if err != nil {
		h.log.Error("list inventory categories error", "error", err)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mengambil kategori bahan baku")
		return
	}
	if cats == nil {
		cats = make([]domain.InventoryCategory, 0)
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(cats))
}

// CreateInventoryCategory handles POST /api/v1/menu/ingredient-categories.
func (h *MenuHandler) CreateInventoryCategory(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 32*1024)
	var req domain.CreateInventoryCategoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_request", "payload JSON kategori bahan baku tidak valid")
		return
	}

	cat, err := h.menuUsecase.CreateInventoryCategory(r.Context(), tenantID, req)
	if err != nil {
		if isBusinessValidationError(err.Error()) {
			httpx.Error(w, r, http.StatusUnprocessableEntity, "unprocessable_entity", err.Error())
			return
		}
		h.log.Error("create inventory category error", "error", err)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal membuat kategori bahan baku")
		return
	}
	httpx.JSON(w, http.StatusCreated, cat)
}

// ListMasterIngredients handles GET /api/v1/menu/ingredients.
func (h *MenuHandler) ListMasterIngredients(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	items, err := h.menuUsecase.ListMasterIngredients(r.Context(), tenantID)
	if err != nil {
		h.log.Error("list master ingredients error", "error", err)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mengambil katalog bahan baku")
		return
	}
	if items == nil {
		items = make([]domain.MasterIngredient, 0)
	}
	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(items))
}

// CreateMasterIngredient handles POST /api/v1/menu/ingredients.
func (h *MenuHandler) CreateMasterIngredient(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	var req domain.SaveMasterIngredientRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_request", "payload JSON bahan baku tidak valid")
		return
	}

	item, err := h.menuUsecase.CreateMasterIngredient(r.Context(), tenantID, req)
	if err != nil {
		if isBusinessValidationError(err.Error()) {
			httpx.Error(w, r, http.StatusUnprocessableEntity, "unprocessable_entity", err.Error())
			return
		}
		h.log.Error("create master ingredient error", "error", err)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal membuat bahan baku baru: "+err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, item)
}

// UpdateMasterIngredient handles PUT /api/v1/menu/ingredients/{id}.
func (h *MenuHandler) UpdateMasterIngredient(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	itemID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID bahan baku tidak valid")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	var req domain.SaveMasterIngredientRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_request", "payload JSON bahan baku tidak valid")
		return
	}

	item, err := h.menuUsecase.UpdateMasterIngredient(r.Context(), tenantID, itemID, req)
	if err != nil {
		if errors.Is(err, usecase.ErrIngredientNotFound) {
			httpx.Error(w, r, http.StatusNotFound, "ingredient_not_found", "bahan baku tidak ditemukan")
			return
		}
		if isBusinessValidationError(err.Error()) {
			httpx.Error(w, r, http.StatusUnprocessableEntity, "unprocessable_entity", err.Error())
			return
		}
		h.log.Error("update master ingredient error", "error", err, "item_id", itemID)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal memperbarui bahan baku: "+err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, item)
}

// DeleteMasterIngredient handles DELETE /api/v1/menu/ingredients/{id}.
func (h *MenuHandler) DeleteMasterIngredient(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	itemID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_id", "ID bahan baku tidak valid")
		return
	}

	if err := h.menuUsecase.DeleteMasterIngredient(r.Context(), tenantID, itemID); err != nil {
		if errors.Is(err, usecase.ErrIngredientNotFound) {
			httpx.Error(w, r, http.StatusNotFound, "ingredient_not_found", "bahan baku tidak ditemukan")
			return
		}
		if isBusinessValidationError(err.Error()) {
			httpx.Error(w, r, http.StatusUnprocessableEntity, "resource_in_use", err.Error())
			return
		}
		h.log.Error("delete master ingredient error", "error", err, "item_id", itemID)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal menghapus bahan baku")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"status": "deleted", "id": itemID})
}

// -----------------------------------------------------------------------------
// 4. Universal Yield Tests
// -----------------------------------------------------------------------------

// ListYieldTests handles GET /api/v1/inventory/yield-tests.
func (h *MenuHandler) ListYieldTests(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	var outletID *uuid.UUID
	if q := r.URL.Query().Get("outlet_id"); q != "" && q != "ALL" {
		if parsed, err := uuid.Parse(q); err == nil {
			outletID = &parsed
		}
	} else if q != "ALL" {
		if oid, ok := iammw.ActiveOutletIDFromContext(r.Context()); ok {
			outletID = &oid
		}
	}

	tests, err := h.menuUsecase.ListYieldTests(r.Context(), tenantID, outletID)
	if err != nil {
		h.log.Error("list yield tests error", "error", err)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mengambil data uji yield")
		return
	}

	if tests == nil {
		tests = make([]domain.ButcheringYieldTest, 0)
	}

	httpx.JSON(w, http.StatusOK, httpx.NewListResponse(tests))
}

// RecordYieldTest handles POST /api/v1/inventory/yield-tests.
func (h *MenuHandler) RecordYieldTest(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := iammw.TenantIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, r, http.StatusUnauthorized, "unauthorized", "otentikasi diperlukan")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)

	var req usecase.CreateYieldTestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, r, http.StatusBadRequest, "invalid_request", "payload JSON tidak valid")
		return
	}

	result, err := h.menuUsecase.RecordYieldTest(r.Context(), tenantID, req)
	if err != nil {
		if errors.Is(err, usecase.ErrInvalidYieldInput) {
			httpx.Error(w, r, http.StatusBadRequest, "invalid_input", err.Error())
			return
		}
		h.log.Error("record yield test error", "error", err)
		httpx.Error(w, r, http.StatusInternalServerError, "internal_error", "gagal mencatat uji yield")
		return
	}

	httpx.JSON(w, http.StatusCreated, result)
}
