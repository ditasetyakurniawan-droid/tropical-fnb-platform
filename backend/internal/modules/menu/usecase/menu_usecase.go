// Package usecase coordinates menu, category, sub-recipe, master ingredient, and yield test operations.
package usecase

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"tropical-fnb/backend/internal/modules/menu/domain"
)

var (
	ErrInvalidYieldInput   = errors.New("berat awal, modal pembelian, dan hasil bersih harus lebih besar dari 0")
	ErrMenuNotFound        = errors.New("menu tidak ditemukan")
	ErrSubRecipeNotFound   = errors.New("sub-recipe tidak ditemukan")
	ErrIngredientNotFound  = errors.New("bahan baku tidak ditemukan")
	ErrInvalidIngredient   = errors.New("setiap bahan harus memilih bahan mentah atau sub-resep")
	ErrInvalidYieldPortion = errors.New("yield_portions harus lebih besar dari 0")
)

var validKitchenStations = map[string]bool{
	"GRILL_STEAK":     true,
	"SIDES_PANTRY":    true,
	"BEVERAGE_BAR":    true,
	"BAKARAN_GORENG":  true,
	"DAPUR_NUSANTARA": true,
	"BAR_TRADISIONAL": true,
	"EXPEDITER":       true,
	"NONE":            true,
}

// CreateYieldTestRequest is the input payload for recording a butcher or universal yield test.
type CreateYieldTestRequest struct {
	OutletID         uuid.UUID `json:"outlet_id"`
	ItemID           uuid.UUID `json:"item_id"`
	TestType         string    `json:"test_type"` // 'MEAT_BUTCHERING', 'POULTRY_FISH', 'PRODUCE_JUICE', 'GENERAL_YIELD'
	BatchNumber      string    `json:"batch_number"`
	TestDate         time.Time `json:"test_date"`
	InitialWeightKg  float64   `json:"initial_weight_kg"`
	InitialCostPerKg float64   `json:"initial_cost_per_kg"`
	UsableMeatKg     float64   `json:"usable_meat_kg"`
	OutputQuantity   *float64  `json:"output_quantity,omitempty"`
	OutputUnit       *string   `json:"output_unit,omitempty"`
	WasteFatKg       float64   `json:"waste_fat_kg"`
	UsableTrimKg     float64   `json:"usable_trim_kg"`
	PortionCutGrams  float64   `json:"portion_cut_grams"`
	Notes            *string   `json:"notes,omitempty"`
	ApplyToMaster    bool      `json:"apply_to_master"`
}

// MenuUsecase handles business rules for menus, categories, sub-recipes, and master ingredients.
type MenuUsecase struct {
	repo domain.MenuRepository
}

// NewMenuUsecase creates a new MenuUsecase.
func NewMenuUsecase(repo domain.MenuRepository) *MenuUsecase {
	return &MenuUsecase{repo: repo}
}

// -----------------------------------------------------------------------------
// 1. Menu Categories & Menu Items (Tier 3 + R&D Lifecycle)
// -----------------------------------------------------------------------------

func (u *MenuUsecase) ListMenuCategories(ctx context.Context, tenantID uuid.UUID) ([]domain.MenuCategory, error) {
	return u.repo.ListMenuCategories(ctx, tenantID)
}

func (u *MenuUsecase) CreateMenuCategory(ctx context.Context, tenantID uuid.UUID, req domain.CreateMenuCategoryRequest) (*domain.MenuCategory, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, errors.New("nama kategori menu wajib diisi")
	}
	return u.repo.CreateMenuCategory(ctx, tenantID, req)
}

// ListMenuItems fetches menu items with computed HPA and margins.
func (u *MenuUsecase) ListMenuItems(ctx context.Context, tenantID uuid.UUID, filter domain.MenuListFilter) ([]domain.MenuItemWithHPA, error) {
	return u.repo.ListMenuItems(ctx, tenantID, filter)
}

// GetMenuItemDetail fetches the complete 3-tier recipe BOM for a specific menu item.
func (u *MenuUsecase) GetMenuItemDetail(ctx context.Context, tenantID, menuID uuid.UUID) (*domain.MenuItemDetail, error) {
	detail, err := u.repo.GetMenuItemDetail(ctx, tenantID, menuID)
	if err != nil {
		return nil, fmt.Errorf("lookup menu detail: %w", err)
	}
	if detail == nil {
		return nil, ErrMenuNotFound
	}
	return detail, nil
}

func validateMenuItemRequest(req *domain.SaveMenuItemRequest) error {
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return errors.New("nama menu wajib diisi")
	}
	if (req.CategoryID == nil || *req.CategoryID == uuid.Nil) && (req.CustomCategoryName == nil || strings.TrimSpace(*req.CustomCategoryName) == "") {
		return errors.New("kategori menu wajib dipilih atau diketik")
	}
	if req.SellingPrice < 0 {
		return errors.New("harga jual menu tidak boleh negatif")
	}
	// PUBLISHED menus must have selling price > 0 so Cashier POS never bills Rp 0 unintentionally
	if strings.EqualFold(req.Status, "PUBLISHED") && req.SellingPrice <= 0 {
		return errors.New("menu yang tayang di Kasir POS (PUBLISHED) wajib memiliki harga jual lebih dari Rp 0")
	}
	if req.KitchenStation != nil && strings.TrimSpace(*req.KitchenStation) != "" {
		st := strings.ToUpper(strings.TrimSpace(*req.KitchenStation))
		if !validKitchenStations[st] {
			return fmt.Errorf("stasiun dapur KDS '%s' tidak valid", st)
		}
		req.KitchenStation = &st
	}
	return nil
}

func (u *MenuUsecase) CreateMenuItem(ctx context.Context, tenantID uuid.UUID, req domain.SaveMenuItemRequest) (*domain.MenuItemDetail, error) {
	if err := validateMenuItemRequest(&req); err != nil {
		return nil, err
	}
	return u.repo.CreateMenuItem(ctx, tenantID, req)
}

func (u *MenuUsecase) UpdateMenuItem(ctx context.Context, tenantID, menuID uuid.UUID, req domain.SaveMenuItemRequest) (*domain.MenuItemDetail, error) {
	if err := validateMenuItemRequest(&req); err != nil {
		return nil, err
	}
	detail, err := u.repo.UpdateMenuItem(ctx, tenantID, menuID, req)
	if err != nil {
		if strings.Contains(err.Error(), "tidak ditemukan") {
			return nil, ErrMenuNotFound
		}
		return nil, err
	}
	return detail, nil
}

func (u *MenuUsecase) UpdateMenuItemStatus(ctx context.Context, tenantID, menuID uuid.UUID, req domain.UpdateMenuItemStatusRequest) (*domain.MenuItemDetail, error) {
	if req.Status != nil {
		st := strings.ToUpper(strings.TrimSpace(*req.Status))
		if st != "DRAFT" && st != "PUBLISHED" && st != "ARCHIVED" {
			return nil, errors.New("status menu harus DRAFT, PUBLISHED, atau ARCHIVED")
		}
		// If publishing to POS, ensure menu has selling_price > 0
		if st == "PUBLISHED" {
			existing, err := u.repo.GetMenuItemDetail(ctx, tenantID, menuID)
			if err != nil {
				return nil, err
			}
			if existing == nil {
				return nil, ErrMenuNotFound
			}
			if existing.MenuItem.SellingPrice <= 0 {
				return nil, errors.New("tentukan Harga Jual (> Rp 0) terlebih dahulu sebelum mem-publish menu ke Kasir POS")
			}
		}
		req.Status = &st
	}
	detail, err := u.repo.UpdateMenuItemStatus(ctx, tenantID, menuID, req)
	if err != nil {
		if strings.Contains(err.Error(), "tidak ditemukan") {
			return nil, ErrMenuNotFound
		}
		return nil, err
	}
	return detail, nil
}

func (u *MenuUsecase) DeleteMenuItem(ctx context.Context, tenantID, menuID uuid.UUID) error {
	err := u.repo.DeleteMenuItem(ctx, tenantID, menuID)
	if err != nil && strings.Contains(err.Error(), "tidak ditemukan") {
		return ErrMenuNotFound
	}
	return err
}

// SaveMenuRecipe creates or updates the BOM recipe for a menu item.
func (u *MenuUsecase) SaveMenuRecipe(ctx context.Context, tenantID, menuID uuid.UUID, req domain.SaveRecipeRequest) (*domain.MenuItemDetail, error) {
	if req.YieldPortions <= 0 {
		return nil, ErrInvalidYieldPortion
	}
	if len(req.Ingredients) == 0 {
		return nil, errors.New("resep harus memiliki setidaknya satu bahan")
	}

	return u.repo.SaveMenuRecipe(ctx, tenantID, menuID, req)
}

// -----------------------------------------------------------------------------
// 2. Sub-Recipes CRUD (Tier 2 Kitchen Prep / Sauces / Syrups)
// -----------------------------------------------------------------------------

func (u *MenuUsecase) ListRecipes(ctx context.Context, tenantID uuid.UUID) ([]domain.RecipeSummary, error) {
	return u.repo.ListRecipes(ctx, tenantID)
}

func (u *MenuUsecase) GetSubRecipeDetail(ctx context.Context, tenantID, recipeID uuid.UUID) (*domain.SubRecipeDetail, error) {
	detail, err := u.repo.GetSubRecipeDetail(ctx, tenantID, recipeID)
	if err != nil {
		return nil, err
	}
	if detail == nil {
		return nil, ErrSubRecipeNotFound
	}
	return detail, nil
}

func (u *MenuUsecase) CreateSubRecipe(ctx context.Context, tenantID uuid.UUID, req domain.SaveRecipeRequest) (*domain.SubRecipeDetail, error) {
	if strings.TrimSpace(req.RecipeName) == "" {
		return nil, errors.New("nama sub-recipe wajib diisi")
	}
	if req.YieldPortions <= 0 {
		return nil, ErrInvalidYieldPortion
	}
	if strings.TrimSpace(req.YieldUnit) == "" {
		return nil, errors.New("satuan hasil batch (cth: ml, liter, kg, g, porsi, pcs) wajib diisi")
	}
	if len(req.Ingredients) == 0 {
		return nil, errors.New("sub-recipe harus memiliki setidaknya satu bahan baku")
	}
	return u.repo.CreateSubRecipe(ctx, tenantID, req)
}

func (u *MenuUsecase) UpdateSubRecipe(ctx context.Context, tenantID, recipeID uuid.UUID, req domain.SaveRecipeRequest) (*domain.SubRecipeDetail, error) {
	if strings.TrimSpace(req.RecipeName) == "" {
		return nil, errors.New("nama sub-recipe wajib diisi")
	}
	if req.YieldPortions <= 0 {
		return nil, ErrInvalidYieldPortion
	}
	if strings.TrimSpace(req.YieldUnit) == "" {
		return nil, errors.New("satuan hasil batch wajib diisi")
	}
	if len(req.Ingredients) == 0 {
		return nil, errors.New("sub-recipe harus memiliki setidaknya satu bahan baku")
	}
	detail, err := u.repo.UpdateSubRecipe(ctx, tenantID, recipeID, req)
	if err != nil {
		if strings.Contains(err.Error(), "tidak ditemukan") {
			return nil, ErrSubRecipeNotFound
		}
		return nil, err
	}
	return detail, nil
}

func (u *MenuUsecase) DeleteSubRecipe(ctx context.Context, tenantID, recipeID uuid.UUID) error {
	err := u.repo.DeleteSubRecipe(ctx, tenantID, recipeID)
	if err != nil && strings.Contains(err.Error(), "tidak ditemukan") {
		return ErrSubRecipeNotFound
	}
	return err
}

// -----------------------------------------------------------------------------
// 3. Master Raw Ingredients & Categories CRUD (Tier 1)
// -----------------------------------------------------------------------------

func (u *MenuUsecase) ListInventoryCategories(ctx context.Context, tenantID uuid.UUID) ([]domain.InventoryCategory, error) {
	return u.repo.ListInventoryCategories(ctx, tenantID)
}

func (u *MenuUsecase) CreateInventoryCategory(ctx context.Context, tenantID uuid.UUID, req domain.CreateInventoryCategoryRequest) (*domain.InventoryCategory, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, errors.New("nama kategori bahan baku wajib diisi")
	}
	return u.repo.CreateInventoryCategory(ctx, tenantID, req)
}

func (u *MenuUsecase) ListMasterIngredients(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterIngredient, error) {
	return u.repo.ListMasterIngredients(ctx, tenantID)
}

func validateIngredientRequest(req *domain.SaveMasterIngredientRequest) error {
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return errors.New("nama bahan baku wajib diisi")
	}
	if (req.CategoryID == nil || *req.CategoryID == uuid.Nil) && (req.CustomCategoryName == nil || strings.TrimSpace(*req.CustomCategoryName) == "") {
		return errors.New("kategori bahan baku wajib dipilih atau diketik")
	}
	if strings.TrimSpace(req.Unit) == "" {
		return errors.New("satuan dasar bahan baku (cth: kg, g, liter, ml, pcs, porsi) wajib diisi")
	}
	if req.CostPrice < 0 {
		return errors.New("harga modal bahan baku tidak boleh negatif")
	}
	if req.PurchasePackQty != nil && *req.PurchasePackQty <= 0 {
		return errors.New("isi per kemasan beli harus lebih besar dari 0")
	}
	if req.StandardYieldPercent != nil && (*req.StandardYieldPercent <= 0 || *req.StandardYieldPercent > 200) {
		return errors.New("persentase yield standar harus antara 0.01% hingga 200%")
	}
	return nil
}

func (u *MenuUsecase) CreateMasterIngredient(ctx context.Context, tenantID uuid.UUID, req domain.SaveMasterIngredientRequest) (*domain.MasterIngredient, error) {
	if err := validateIngredientRequest(&req); err != nil {
		return nil, err
	}
	return u.repo.CreateMasterIngredient(ctx, tenantID, req)
}

func (u *MenuUsecase) UpdateMasterIngredient(ctx context.Context, tenantID, itemID uuid.UUID, req domain.SaveMasterIngredientRequest) (*domain.MasterIngredient, error) {
	if err := validateIngredientRequest(&req); err != nil {
		return nil, err
	}
	item, err := u.repo.UpdateMasterIngredient(ctx, tenantID, itemID, req)
	if err != nil {
		if strings.Contains(err.Error(), "tidak ditemukan") {
			return nil, ErrIngredientNotFound
		}
		return nil, err
	}
	return item, nil
}

func (u *MenuUsecase) DeleteMasterIngredient(ctx context.Context, tenantID, itemID uuid.UUID) error {
	err := u.repo.DeleteMasterIngredient(ctx, tenantID, itemID)
	if err != nil && strings.Contains(err.Error(), "tidak ditemukan") {
		return ErrIngredientNotFound
	}
	return err
}

// GetBOMOptions fetches inventory items and sub-recipes available for BOM creation.
func (u *MenuUsecase) GetBOMOptions(ctx context.Context, tenantID uuid.UUID) (*domain.BOMOptionsResponse, error) {
	items, err := u.repo.ListInventoryItemsForBOM(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list inventory items for bom: %w", err)
	}

	recipes, err := u.repo.ListRecipes(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list recipes for bom: %w", err)
	}

	subRecipes := make([]domain.RecipeSummary, 0)
	for _, r := range recipes {
		if r.RecipeType == "SUB_RECIPE" {
			subRecipes = append(subRecipes, r)
		}
	}

	return &domain.BOMOptionsResponse{
		InventoryItems: items,
		SubRecipes:     subRecipes,
	}, nil
}

// -----------------------------------------------------------------------------
// 4. Universal Yield Tests
// -----------------------------------------------------------------------------

func (u *MenuUsecase) ListYieldTests(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) ([]domain.ButcheringYieldTest, error) {
	return u.repo.ListYieldTests(ctx, tenantID, outletID)
}

// RecordYieldTest calculates true yield cost using shopspring/decimal and saves the test result.
func (u *MenuUsecase) RecordYieldTest(ctx context.Context, tenantID uuid.UUID, req CreateYieldTestRequest) (*domain.ButcheringYieldTest, error) {
	outputQty := req.UsableMeatKg
	if req.OutputQuantity != nil && *req.OutputQuantity > 0 {
		outputQty = *req.OutputQuantity
	}

	if req.InitialWeightKg <= 0 || req.InitialCostPerKg <= 0 || outputQty <= 0 {
		return nil, ErrInvalidYieldInput
	}

	outputUnit := "kg"
	if req.OutputUnit != nil && *req.OutputUnit != "" {
		outputUnit = *req.OutputUnit
	}

	testType := req.TestType
	if testType == "" {
		testType = "MEAT_BUTCHERING"
	}

	if req.TestDate.IsZero() {
		req.TestDate = time.Now().UTC()
	}

	initWeightDec := decimal.NewFromFloat(req.InitialWeightKg)
	initCostDec := decimal.NewFromFloat(req.InitialCostPerKg)
	outQtyDec := decimal.NewFromFloat(outputQty)

	totalCostDec := initWeightDec.Mul(initCostDec).Round(0)
	yieldPctDec := outQtyDec.Div(initWeightDec).Mul(decimal.NewFromInt(100)).Round(2)
	effCostDec := totalCostDec.Div(outQtyDec).Round(2)

	totalCost, _ := totalCostDec.Float64()
	yieldPct, _ := yieldPctDec.Float64()
	effectiveCostPerUnit, _ := effCostDec.Float64()

	var costPerPortion float64
	if outputUnit == "kg" {
		portionGrams := req.PortionCutGrams
		if portionGrams <= 0 {
			portionGrams = 200.0
		}
		cppDec := effCostDec.Div(decimal.NewFromInt(1000)).Mul(decimal.NewFromFloat(portionGrams)).Round(2)
		costPerPortion, _ = cppDec.Float64()
	} else {
		if req.PortionCutGrams > 0 {
			cppDec := effCostDec.Mul(decimal.NewFromFloat(req.PortionCutGrams)).Round(2)
			costPerPortion, _ = cppDec.Float64()
		} else {
			costPerPortion = effectiveCostPerUnit
		}
	}

	testRecord := domain.ButcheringYieldTest{
		ID:                 uuid.New(),
		TenantID:           tenantID,
		OutletID:           req.OutletID,
		ItemID:             req.ItemID,
		TestType:           testType,
		BatchNumber:        req.BatchNumber,
		TestDate:           req.TestDate,
		InitialWeightKg:    req.InitialWeightKg,
		InitialCostPerKg:   req.InitialCostPerKg,
		TotalCost:          totalCost,
		UsableMeatKg:       outputQty,
		OutputQuantity:     outputQty,
		OutputUnit:         outputUnit,
		WasteFatKg:         req.WasteFatKg,
		UsableTrimKg:       req.UsableTrimKg,
		YieldPercent:       yieldPct,
		EffectiveCostPerKg: effectiveCostPerUnit,
		PortionCutGrams:    req.PortionCutGrams,
		CostPerPortion:     costPerPortion,
		Notes:              req.Notes,
	}

	if err := u.repo.CreateYieldTest(ctx, testRecord, req.ApplyToMaster); err != nil {
		return nil, fmt.Errorf("save yield test: %w", err)
	}

	return &testRecord, nil
}
