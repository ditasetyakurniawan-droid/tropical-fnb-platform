package usecase_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"tropical-fnb/backend/internal/modules/menu/domain"
	"tropical-fnb/backend/internal/modules/menu/engine"
	"tropical-fnb/backend/internal/modules/menu/usecase"
)

type mockBOMRepo struct {
	menuCategories  []domain.MenuCategory
	menuItems       map[uuid.UUID]domain.MenuItemDetail
	recipes         map[uuid.UUID]domain.RecipeSummary
	subRecipes      map[uuid.UUID]domain.SubRecipeDetail
	invCategories   []domain.InventoryCategory
	ingredients     map[uuid.UUID]domain.MasterIngredient
	yieldTests      []domain.ButcheringYieldTest
	circularSubTree map[uuid.UUID][]uuid.UUID // child -> downstream subrecipes
}

func newMockBOMRepo() *mockBOMRepo {
	return &mockBOMRepo{
		menuCategories:  make([]domain.MenuCategory, 0),
		menuItems:       make(map[uuid.UUID]domain.MenuItemDetail),
		recipes:         make(map[uuid.UUID]domain.RecipeSummary),
		subRecipes:      make(map[uuid.UUID]domain.SubRecipeDetail),
		invCategories:   make([]domain.InventoryCategory, 0),
		ingredients:     make(map[uuid.UUID]domain.MasterIngredient),
		yieldTests:      make([]domain.ButcheringYieldTest, 0),
		circularSubTree: make(map[uuid.UUID][]uuid.UUID),
	}
}

func (m *mockBOMRepo) ListMenuCategories(ctx context.Context, tenantID uuid.UUID) ([]domain.MenuCategory, error) {
	return m.menuCategories, nil
}

func (m *mockBOMRepo) CreateMenuCategory(ctx context.Context, tenantID uuid.UUID, req domain.CreateMenuCategoryRequest) (*domain.MenuCategory, error) {
	cat := domain.MenuCategory{
		ID:   uuid.New(),
		Code: "CAT-CUSTOM",
		Name: strings.TrimSpace(req.Name),
	}
	m.menuCategories = append(m.menuCategories, cat)
	return &cat, nil
}

func (m *mockBOMRepo) ListMenuItems(ctx context.Context, tenantID uuid.UUID, filter domain.MenuListFilter) ([]domain.MenuItemWithHPA, error) {
	res := make([]domain.MenuItemWithHPA, 0)
	for _, d := range m.menuItems {
		if filter.POSOnly && d.MenuItem.Status != "PUBLISHED" {
			continue
		}
		res = append(res, d.MenuItem)
	}
	return res, nil
}

func (m *mockBOMRepo) GetMenuItemDetail(ctx context.Context, tenantID, menuID uuid.UUID) (*domain.MenuItemDetail, error) {
	d, ok := m.menuItems[menuID]
	if !ok {
		return nil, nil
	}
	return &d, nil
}

func (m *mockBOMRepo) CreateMenuItem(ctx context.Context, tenantID uuid.UUID, req domain.SaveMenuItemRequest) (*domain.MenuItemDetail, error) {
	id := uuid.New()
	status := req.Status
	if status == "" {
		status = "DRAFT"
	}
	station := "GRILL_STEAK"
	if req.KitchenStation != nil && *req.KitchenStation != "" {
		station = *req.KitchenStation
	} else {
		station = engine.SuggestKitchenStation("", req.MenuType)
	}
	catName := "Kategori"
	if req.CustomCategoryName != nil && *req.CustomCategoryName != "" {
		catName = *req.CustomCategoryName
	}
	detail := domain.MenuItemDetail{
		MenuItem: domain.MenuItemWithHPA{
			ID:                id,
			TenantID:          tenantID,
			Name:              req.Name,
			Code:              "MENU-RND-001",
			CategoryName:      catName,
			MenuType:          req.MenuType,
			Status:            status,
			KitchenStation:    &station,
			SellingPrice:      req.SellingPrice,
			TargetFoodCostPct: req.TargetFoodCostPct,
			IsAvailable:       true,
		},
		Ingredients: make([]domain.RecipeIngredientDetail, 0),
	}
	m.menuItems[id] = detail
	return &detail, nil
}

func (m *mockBOMRepo) UpdateMenuItem(ctx context.Context, tenantID, menuID uuid.UUID, req domain.SaveMenuItemRequest) (*domain.MenuItemDetail, error) {
	d, ok := m.menuItems[menuID]
	if !ok {
		return nil, errors.New("menu tidak ditemukan")
	}
	d.MenuItem.Name = req.Name
	d.MenuItem.SellingPrice = req.SellingPrice
	if req.Status != "" {
		d.MenuItem.Status = req.Status
	}
	m.menuItems[menuID] = d
	return &d, nil
}

func (m *mockBOMRepo) UpdateMenuItemStatus(ctx context.Context, tenantID, menuID uuid.UUID, req domain.UpdateMenuItemStatusRequest) (*domain.MenuItemDetail, error) {
	d, ok := m.menuItems[menuID]
	if !ok {
		return nil, errors.New("menu tidak ditemukan")
	}
	if req.Status != nil {
		d.MenuItem.Status = *req.Status
	}
	if req.IsAvailable != nil {
		d.MenuItem.IsAvailable = *req.IsAvailable
	}
	m.menuItems[menuID] = d
	return &d, nil
}

func (m *mockBOMRepo) DeleteMenuItem(ctx context.Context, tenantID, menuID uuid.UUID) error {
	if _, ok := m.menuItems[menuID]; !ok {
		return errors.New("menu tidak ditemukan")
	}
	delete(m.menuItems, menuID)
	return nil
}

func (m *mockBOMRepo) GetRecipeByID(ctx context.Context, tenantID uuid.UUID, recipeID uuid.UUID) (*domain.RecipeSummary, error) {
	r, ok := m.recipes[recipeID]
	if !ok {
		return nil, nil
	}
	return &r, nil
}

func (m *mockBOMRepo) GetSubRecipeDetail(ctx context.Context, tenantID, recipeID uuid.UUID) (*domain.SubRecipeDetail, error) {
	sr, ok := m.subRecipes[recipeID]
	if !ok {
		return nil, nil
	}
	return &sr, nil
}

func (m *mockBOMRepo) CreateSubRecipe(ctx context.Context, tenantID uuid.UUID, req domain.SaveRecipeRequest) (*domain.SubRecipeDetail, error) {
	id := uuid.New()
	sr := domain.SubRecipeDetail{
		ID:             id,
		Code:           "SUB-TEST",
		Name:           req.RecipeName,
		RecipeType:     "SUB_RECIPE",
		YieldPortions:  req.YieldPortions,
		YieldUnit:      req.YieldUnit,
		TotalCostHPA:   50000,
		CostPerPortion: 50000 / req.YieldPortions,
		Ingredients:    make([]domain.RecipeIngredientDetail, 0),
	}
	m.subRecipes[id] = sr
	return &sr, nil
}

func (m *mockBOMRepo) UpdateSubRecipe(ctx context.Context, tenantID, recipeID uuid.UUID, req domain.SaveRecipeRequest) (*domain.SubRecipeDetail, error) {
	sr, ok := m.subRecipes[recipeID]
	if !ok {
		return nil, errors.New("sub-recipe tidak ditemukan")
	}
	sr.Name = req.RecipeName
	sr.YieldPortions = req.YieldPortions
	sr.YieldUnit = req.YieldUnit
	m.subRecipes[recipeID] = sr
	return &sr, nil
}

func (m *mockBOMRepo) DeleteSubRecipe(ctx context.Context, tenantID, recipeID uuid.UUID) error {
	if _, ok := m.subRecipes[recipeID]; !ok {
		return errors.New("sub-recipe tidak ditemukan")
	}
	delete(m.subRecipes, recipeID)
	return nil
}

func (m *mockBOMRepo) ListInventoryCategories(ctx context.Context, tenantID uuid.UUID) ([]domain.InventoryCategory, error) {
	return m.invCategories, nil
}

func (m *mockBOMRepo) CreateInventoryCategory(ctx context.Context, tenantID uuid.UUID, req domain.CreateInventoryCategoryRequest) (*domain.InventoryCategory, error) {
	cat := domain.InventoryCategory{
		ID:   uuid.New(),
		Code: "INGCAT-CUSTOM",
		Name: strings.TrimSpace(req.Name),
	}
	m.invCategories = append(m.invCategories, cat)
	return &cat, nil
}

func (m *mockBOMRepo) ListMasterIngredients(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterIngredient, error) {
	res := make([]domain.MasterIngredient, 0, len(m.ingredients))
	for _, ing := range m.ingredients {
		res = append(res, ing)
	}
	return res, nil
}

func (m *mockBOMRepo) CreateMasterIngredient(ctx context.Context, tenantID uuid.UUID, req domain.SaveMasterIngredientRequest) (*domain.MasterIngredient, error) {
	id := uuid.New()
	costPrice := req.CostPrice
	if req.PurchasePackQty != nil && req.PurchasePackPrice != nil && *req.PurchasePackQty > 0 {
		var err error
		costPrice, err = engine.CalculatePackBaseCost(*req.PurchasePackPrice, *req.PurchasePackQty)
		if err != nil {
			return nil, err
		}
	}
	yieldPct := 100.0
	if req.StandardYieldPercent != nil {
		yieldPct = *req.StandardYieldPercent
	}
	ing := domain.MasterIngredient{
		ID:                   id,
		Code:                 "ING-CUSTOM",
		Name:                 req.Name,
		Unit:                 req.Unit,
		StorageType:          req.StorageType,
		CostPrice:            costPrice,
		PurchaseUnit:         req.PurchaseUnit,
		PurchasePackQty:      req.PurchasePackQty,
		PurchasePackPrice:    req.PurchasePackPrice,
		StandardYieldPercent: yieldPct,
		EffectiveCostPerUnit: engine.CalculateEffectiveUnitCost(costPrice, yieldPct),
		IsActive:             true,
	}
	m.ingredients[id] = ing
	return &ing, nil
}

func (m *mockBOMRepo) UpdateMasterIngredient(ctx context.Context, tenantID, itemID uuid.UUID, req domain.SaveMasterIngredientRequest) (*domain.MasterIngredient, error) {
	ing, ok := m.ingredients[itemID]
	if !ok {
		return nil, errors.New("bahan baku tidak ditemukan")
	}
	ing.Name = req.Name
	ing.CostPrice = req.CostPrice
	m.ingredients[itemID] = ing
	return &ing, nil
}

func (m *mockBOMRepo) DeleteMasterIngredient(ctx context.Context, tenantID, itemID uuid.UUID) error {
	if _, ok := m.ingredients[itemID]; !ok {
		return errors.New("bahan baku tidak ditemukan")
	}
	delete(m.ingredients, itemID)
	return nil
}

func (m *mockBOMRepo) SaveMenuRecipe(ctx context.Context, tenantID uuid.UUID, menuID uuid.UUID, req domain.SaveRecipeRequest) (*domain.MenuItemDetail, error) {
	// Check circular dependency if any sub_recipe is used
	subIDs := make([]uuid.UUID, 0)
	for _, ing := range req.Ingredients {
		if ing.SubRecipeID != nil {
			subIDs = append(subIDs, *ing.SubRecipeID)
		}
	}
	if err := m.CheckCircularDependency(ctx, tenantID, menuID, subIDs); err != nil {
		return nil, err
	}

	detail := domain.MenuItemDetail{
		MenuItem: domain.MenuItemWithHPA{
			ID:   menuID,
			Name: req.RecipeName,
		},
		RecipeName:   req.RecipeName,
		Yield:        req.YieldPortions,
		YieldUnit:    req.YieldUnit,
		Instructions: req.Instructions,
	}
	m.menuItems[menuID] = detail
	return &detail, nil
}

func (m *mockBOMRepo) ListYieldTests(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) ([]domain.ButcheringYieldTest, error) {
	return m.yieldTests, nil
}

func (m *mockBOMRepo) CreateYieldTest(ctx context.Context, test domain.ButcheringYieldTest, applyToMaster bool) error {
	m.yieldTests = append(m.yieldTests, test)
	return nil
}

func (m *mockBOMRepo) ListRecipes(ctx context.Context, tenantID uuid.UUID) ([]domain.RecipeSummary, error) {
	res := make([]domain.RecipeSummary, 0)
	for _, r := range m.recipes {
		res = append(res, r)
	}
	return res, nil
}

func (m *mockBOMRepo) ListInventoryItemsForBOM(ctx context.Context, tenantID uuid.UUID) ([]domain.InventoryItemBOMOption, error) {
	return []domain.InventoryItemBOMOption{}, nil
}

func (m *mockBOMRepo) CheckCircularDependency(ctx context.Context, tenantID uuid.UUID, targetRecipeID uuid.UUID, subRecipeIDs []uuid.UUID) error {
	for _, subID := range subRecipeIDs {
		if subID == targetRecipeID {
			return errors.New("terdeteksi ketergantungan sirkular (circular dependency) pada sub-resep")
		}
		// check if subID has targetRecipeID downstream
		if downstream, ok := m.circularSubTree[subID]; ok {
			for _, d := range downstream {
				if d == targetRecipeID {
					return errors.New("terdeteksi ketergantungan sirkular (circular dependency) pada sub-resep")
				}
			}
		}
	}
	return nil
}

func (m *mockBOMRepo) RecalculateCascadingHPA(ctx context.Context, tenantID uuid.UUID, itemID *uuid.UUID, subRecipeID *uuid.UUID) error {
	return nil
}

// Test Circular Dependency Detection
func TestMenuUsecase_CircularDependencyRejection(t *testing.T) {
	repo := newMockBOMRepo()
	uc := usecase.NewMenuUsecase(repo)

	tenantID := uuid.New()
	recipeA := uuid.New()
	recipeB := uuid.New()

	// Recipe B already depends on Recipe A downstream
	repo.circularSubTree[recipeB] = []uuid.UUID{recipeA}

	// Now try to save Recipe A with ingredient pointing to Recipe B -> Circular!
	req := domain.SaveRecipeRequest{
		RecipeName:    "Sub Recipe A",
		YieldPortions: 1,
		YieldUnit:     "porsi",
		Ingredients: []domain.SaveRecipeIngredientInput{
			{
				SubRecipeID: &recipeB,
				Quantity:    1,
				Unit:        "porsi",
			},
		},
	}

	_, err := uc.SaveMenuRecipe(context.Background(), tenantID, recipeA, req)
	if err == nil {
		t.Fatal("expected circular dependency error, got nil")
	}

	if err.Error() != "terdeteksi ketergantungan sirkular (circular dependency) pada sub-resep" {
		t.Errorf("expected circular error, got: %v", err)
	}
}

// Test R&D DRAFT Lifecycle & Publish Selling Price Guard
func TestMenuUsecase_RnDDraftAndPublishLifecycle(t *testing.T) {
	repo := newMockBOMRepo()
	uc := usecase.NewMenuUsecase(repo)
	tenantID := uuid.New()
	customCat := "Signature Mocktails"

	// 1. Creating a PUBLISHED menu with SellingPrice == 0 must be rejected
	_, err := uc.CreateMenuItem(context.Background(), tenantID, domain.SaveMenuItemRequest{
		Name:               "Tropical Lychee Fizz",
		CustomCategoryName: &customCat,
		MenuType:           "BEVERAGE",
		Status:             "PUBLISHED",
		SellingPrice:       0,
	})
	if err == nil {
		t.Fatal("expected error when creating PUBLISHED menu with Rp 0 selling price")
	}

	// 2. Creating a DRAFT R&D menu with SellingPrice == 0 is allowed during kitchen R&D!
	created, err := uc.CreateMenuItem(context.Background(), tenantID, domain.SaveMenuItemRequest{
		Name:               "Tropical Lychee Fizz",
		CustomCategoryName: &customCat,
		MenuType:           "BEVERAGE",
		Status:             "DRAFT",
		SellingPrice:       0,
		TargetFoodCostPct:  28,
	})
	if err != nil {
		t.Fatalf("unexpected error creating DRAFT menu: %v", err)
	}
	if created.MenuItem.Status != "DRAFT" {
		t.Errorf("expected DRAFT status, got %s", created.MenuItem.Status)
	}

	// 3. Attempting to publish while SellingPrice is still 0 must fail
	pubStatus := "PUBLISHED"
	_, err = uc.UpdateMenuItemStatus(context.Background(), tenantID, created.MenuItem.ID, domain.UpdateMenuItemStatusRequest{
		Status: &pubStatus,
	})
	if err == nil {
		t.Fatal("expected publish rejection when selling price is Rp 0")
	}

	// 4. POS-only listing must hide DRAFT menus
	posList, err := uc.ListMenuItems(context.Background(), tenantID, domain.MenuListFilter{POSOnly: true})
	if err != nil {
		t.Fatalf("unexpected error listing POS items: %v", err)
	}
	if len(posList) != 0 {
		t.Errorf("expected 0 POS items while menu is DRAFT, got %d", len(posList))
	}

	// 5. Set selling price to Rp 32.000 and publish
	_, err = uc.UpdateMenuItem(context.Background(), tenantID, created.MenuItem.ID, domain.SaveMenuItemRequest{
		Name:               "Tropical Lychee Fizz",
		CustomCategoryName: &customCat,
		MenuType:           "BEVERAGE",
		Status:             "DRAFT",
		SellingPrice:       32000,
	})
	if err != nil {
		t.Fatalf("unexpected error updating selling price: %v", err)
	}

	published, err := uc.UpdateMenuItemStatus(context.Background(), tenantID, created.MenuItem.ID, domain.UpdateMenuItemStatusRequest{
		Status: &pubStatus,
	})
	if err != nil {
		t.Fatalf("unexpected error publishing menu: %v", err)
	}
	if published.MenuItem.Status != "PUBLISHED" {
		t.Errorf("expected PUBLISHED status, got %s", published.MenuItem.Status)
	}

	posList, _ = uc.ListMenuItems(context.Background(), tenantID, domain.MenuListFilter{POSOnly: true})
	if len(posList) != 1 {
		t.Errorf("expected 1 POS item after publish, got %d", len(posList))
	}
}

// Test Master Ingredient Pack-to-Base UoM Cost Calculation
func TestMenuUsecase_CreateMasterIngredient_PackToBase(t *testing.T) {
	repo := newMockBOMRepo()
	uc := usecase.NewMenuUsecase(repo)
	tenantID := uuid.New()

	customCat := "Sirup & Bar"
	packUnit := "Botol"
	packQty := 750.0
	packPrice := 115000.0

	ing, err := uc.CreateMasterIngredient(context.Background(), tenantID, domain.SaveMasterIngredientRequest{
		CustomCategoryName: &customCat,
		Name:               "Sirup Lychee Monin",
		Unit:               "ml",
		StorageType:        "DRY",
		PurchaseUnit:       &packUnit,
		PurchasePackQty:    &packQty,
		PurchasePackPrice:  &packPrice,
	})
	if err != nil {
		t.Fatalf("unexpected error creating master ingredient: %v", err)
	}
	if ing.CostPrice != 153.3333 {
		t.Errorf("expected pack-to-base cost 153.3333/ml, got %v", ing.CostPrice)
	}
}

// Test Universal Yield Test: Meat Butchering
func TestMenuUsecase_UniversalYieldTest_Meat(t *testing.T) {
	repo := newMockBOMRepo()
	uc := usecase.NewMenuUsecase(repo)

	tenantID := uuid.New()
	outletID := uuid.New()
	itemID := uuid.New()

	req := usecase.CreateYieldTestRequest{
		OutletID:         outletID,
		ItemID:           itemID,
		TestType:         "MEAT_BUTCHERING",
		BatchNumber:      "BATCH-AUS-001",
		TestDate:         time.Now(),
		InitialWeightKg:  10.0,
		InitialCostPerKg: 135000,
		UsableMeatKg:     8.2, // 82%
		WasteFatKg:       1.8,
		PortionCutGrams:  200,
		ApplyToMaster:    true,
	}

	res, err := uc.RecordYieldTest(context.Background(), tenantID, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res.YieldPercent != 82.0 {
		t.Errorf("expected 82.0%% yield, got %v", res.YieldPercent)
	}
	if res.EffectiveCostPerKg != 164634.15 {
		t.Errorf("expected effective cost 164634.15, got %v", res.EffectiveCostPerKg)
	}
	if res.CostPerPortion != 32926.83 {
		t.Errorf("expected cost per portion 32926.83, got %v", res.CostPerPortion)
	}
}

// Test Universal Yield Test: Produce / Juice (Jeruk)
func TestMenuUsecase_UniversalYieldTest_Juice(t *testing.T) {
	repo := newMockBOMRepo()
	uc := usecase.NewMenuUsecase(repo)

	tenantID := uuid.New()
	outletID := uuid.New()
	itemID := uuid.New()
	outUnit := "ml"
	outQty := 2200.0

	// 5.0 kg Jeruk @ Rp 20.000 = Rp 100.000
	// Usable juice: 2200 ml -> 440 ml/kg
	// Effective cost per ml = 100.000 / 2200 = Rp 45.4545
	req := usecase.CreateYieldTestRequest{
		OutletID:         outletID,
		ItemID:           itemID,
		TestType:         "PRODUCE_JUICE",
		BatchNumber:      "BATCH-JERUK-001",
		TestDate:         time.Now(),
		InitialWeightKg:  5.0,
		InitialCostPerKg: 20000,
		OutputQuantity:   &outQty,
		OutputUnit:       &outUnit,
		PortionCutGrams:  150, // 150 ml per glass
		ApplyToMaster:    true,
	}

	res, err := uc.RecordYieldTest(context.Background(), tenantID, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res.TotalCost != 100000.0 {
		t.Errorf("expected total cost 100000, got %v", res.TotalCost)
	}

	// Cost per glass (150 ml) = 45.45 * 150 = Rp 6817.50
	if res.CostPerPortion <= 0 {
		t.Errorf("expected valid cost per portion, got %v", res.CostPerPortion)
	}
}
