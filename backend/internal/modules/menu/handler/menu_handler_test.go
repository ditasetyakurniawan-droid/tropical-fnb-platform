package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	iamdomain "tropical-fnb/backend/internal/modules/iam/domain"
	iammw "tropical-fnb/backend/internal/modules/iam/middleware"
	iamtoken "tropical-fnb/backend/internal/modules/iam/token"
	"tropical-fnb/backend/internal/modules/menu/domain"
	"tropical-fnb/backend/internal/modules/menu/engine"
	"tropical-fnb/backend/internal/modules/menu/handler"
	"tropical-fnb/backend/internal/modules/menu/usecase"
)

type mockMenuRepo struct {
	categories []domain.MenuCategory
	items      []domain.MenuItemWithHPA
	detail     *domain.MenuItemDetail
	yieldTests []domain.ButcheringYieldTest
	recipes    []domain.RecipeSummary
	subRecipes []domain.SubRecipeDetail
	invCats    []domain.InventoryCategory
	masterIngs []domain.MasterIngredient
	bomItems   []domain.InventoryItemBOMOption
}

func (m *mockMenuRepo) ListMenuCategories(ctx context.Context, tenantID uuid.UUID) ([]domain.MenuCategory, error) {
	return m.categories, nil
}

func (m *mockMenuRepo) CreateMenuCategory(ctx context.Context, tenantID uuid.UUID, req domain.CreateMenuCategoryRequest) (*domain.MenuCategory, error) {
	cat := domain.MenuCategory{ID: uuid.New(), Code: "CAT-NEW", Name: req.Name}
	m.categories = append(m.categories, cat)
	return &cat, nil
}

func (m *mockMenuRepo) ListMenuItems(ctx context.Context, tenantID uuid.UUID, filter domain.MenuListFilter) ([]domain.MenuItemWithHPA, error) {
	if !filter.POSOnly {
		return m.items, nil
	}
	filtered := make([]domain.MenuItemWithHPA, 0)
	for _, it := range m.items {
		if it.Status == "" || it.Status == "PUBLISHED" {
			filtered = append(filtered, it)
		}
	}
	return filtered, nil
}

func (m *mockMenuRepo) GetMenuItemDetail(ctx context.Context, tenantID, menuID uuid.UUID) (*domain.MenuItemDetail, error) {
	return m.detail, nil
}

func (m *mockMenuRepo) CreateMenuItem(ctx context.Context, tenantID uuid.UUID, req domain.SaveMenuItemRequest) (*domain.MenuItemDetail, error) {
	id := uuid.New()
	st := req.Status
	if st == "" {
		st = "DRAFT"
	}
	station := engine.SuggestKitchenStation("", req.MenuType)
	if req.KitchenStation != nil && *req.KitchenStation != "" {
		station = *req.KitchenStation
	}
	d := &domain.MenuItemDetail{
		MenuItem: domain.MenuItemWithHPA{
			ID:             id,
			TenantID:       tenantID,
			Name:           req.Name,
			Code:           "MENU-NEW-01",
			MenuType:       req.MenuType,
			Status:         st,
			KitchenStation: &station,
			SellingPrice:   req.SellingPrice,
			IsAvailable:    true,
		},
		Ingredients: []domain.RecipeIngredientDetail{},
	}
	m.detail = d
	m.items = append(m.items, d.MenuItem)
	return d, nil
}

func (m *mockMenuRepo) UpdateMenuItem(ctx context.Context, tenantID, menuID uuid.UUID, req domain.SaveMenuItemRequest) (*domain.MenuItemDetail, error) {
	return m.detail, nil
}

func (m *mockMenuRepo) UpdateMenuItemStatus(ctx context.Context, tenantID, menuID uuid.UUID, req domain.UpdateMenuItemStatusRequest) (*domain.MenuItemDetail, error) {
	if m.detail != nil && req.Status != nil {
		m.detail.MenuItem.Status = *req.Status
	}
	return m.detail, nil
}

func (m *mockMenuRepo) DeleteMenuItem(ctx context.Context, tenantID, menuID uuid.UUID) error {
	return nil
}

func (m *mockMenuRepo) GetRecipeByID(ctx context.Context, tenantID uuid.UUID, recipeID uuid.UUID) (*domain.RecipeSummary, error) {
	return nil, nil
}

func (m *mockMenuRepo) GetSubRecipeDetail(ctx context.Context, tenantID, recipeID uuid.UUID) (*domain.SubRecipeDetail, error) {
	if len(m.subRecipes) > 0 {
		return &m.subRecipes[0], nil
	}
	return nil, nil
}

func (m *mockMenuRepo) CreateSubRecipe(ctx context.Context, tenantID uuid.UUID, req domain.SaveRecipeRequest) (*domain.SubRecipeDetail, error) {
	sr := domain.SubRecipeDetail{
		ID:             uuid.New(),
		Code:           "SUB-NEW-01",
		Name:           req.RecipeName,
		RecipeType:     "SUB_RECIPE",
		YieldPortions:  req.YieldPortions,
		YieldUnit:      req.YieldUnit,
		TotalCostHPA:   40000,
		CostPerPortion: 20,
		Ingredients:    []domain.RecipeIngredientDetail{},
	}
	m.subRecipes = append(m.subRecipes, sr)
	return &sr, nil
}

func (m *mockMenuRepo) UpdateSubRecipe(ctx context.Context, tenantID, recipeID uuid.UUID, req domain.SaveRecipeRequest) (*domain.SubRecipeDetail, error) {
	if len(m.subRecipes) > 0 {
		return &m.subRecipes[0], nil
	}
	return nil, nil
}

func (m *mockMenuRepo) DeleteSubRecipe(ctx context.Context, tenantID, recipeID uuid.UUID) error {
	return nil
}

func (m *mockMenuRepo) ListInventoryCategories(ctx context.Context, tenantID uuid.UUID) ([]domain.InventoryCategory, error) {
	return m.invCats, nil
}

func (m *mockMenuRepo) CreateInventoryCategory(ctx context.Context, tenantID uuid.UUID, req domain.CreateInventoryCategoryRequest) (*domain.InventoryCategory, error) {
	cat := domain.InventoryCategory{ID: uuid.New(), Code: "INGCAT-01", Name: req.Name}
	m.invCats = append(m.invCats, cat)
	return &cat, nil
}

func (m *mockMenuRepo) ListMasterIngredients(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterIngredient, error) {
	return m.masterIngs, nil
}

func (m *mockMenuRepo) CreateMasterIngredient(ctx context.Context, tenantID uuid.UUID, req domain.SaveMasterIngredientRequest) (*domain.MasterIngredient, error) {
	cost := req.CostPrice
	if req.PurchasePackQty != nil && req.PurchasePackPrice != nil && *req.PurchasePackQty > 0 {
		cost, _ = engine.CalculatePackBaseCost(*req.PurchasePackPrice, *req.PurchasePackQty)
	}
	ing := domain.MasterIngredient{
		ID:                   uuid.New(),
		Code:                 "ING-NEW-01",
		Name:                 req.Name,
		Unit:                 req.Unit,
		StorageType:          req.StorageType,
		CostPrice:            cost,
		StandardYieldPercent: 100,
		EffectiveCostPerUnit: cost,
		IsActive:             true,
	}
	m.masterIngs = append(m.masterIngs, ing)
	return &ing, nil
}

func (m *mockMenuRepo) UpdateMasterIngredient(ctx context.Context, tenantID, itemID uuid.UUID, req domain.SaveMasterIngredientRequest) (*domain.MasterIngredient, error) {
	if len(m.masterIngs) > 0 {
		return &m.masterIngs[0], nil
	}
	return nil, nil
}

func (m *mockMenuRepo) DeleteMasterIngredient(ctx context.Context, tenantID, itemID uuid.UUID) error {
	return nil
}

func (m *mockMenuRepo) SaveMenuRecipe(ctx context.Context, tenantID uuid.UUID, menuID uuid.UUID, req domain.SaveRecipeRequest) (*domain.MenuItemDetail, error) {
	return m.detail, nil
}

func (m *mockMenuRepo) ListYieldTests(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) ([]domain.ButcheringYieldTest, error) {
	return m.yieldTests, nil
}

func (m *mockMenuRepo) CreateYieldTest(ctx context.Context, test domain.ButcheringYieldTest, applyToMaster bool) error {
	m.yieldTests = append(m.yieldTests, test)
	return nil
}

func (m *mockMenuRepo) ListRecipes(ctx context.Context, tenantID uuid.UUID) ([]domain.RecipeSummary, error) {
	return m.recipes, nil
}

func (m *mockMenuRepo) ListInventoryItemsForBOM(ctx context.Context, tenantID uuid.UUID) ([]domain.InventoryItemBOMOption, error) {
	return m.bomItems, nil
}

func (m *mockMenuRepo) CheckCircularDependency(ctx context.Context, tenantID uuid.UUID, targetRecipeID uuid.UUID, subRecipeIDs []uuid.UUID) error {
	return nil
}

func (m *mockMenuRepo) RecalculateCascadingHPA(ctx context.Context, tenantID uuid.UUID, itemID *uuid.UUID, subRecipeID *uuid.UUID) error {
	return nil
}

func setupMenuRouter(repo domain.MenuRepository, jwtSecret string) (http.Handler, *iamtoken.JWTManager) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	jwtMgr, _ := iamtoken.NewJWTManager(jwtSecret)
	uc := usecase.NewMenuUsecase(repo)
	h := handler.NewMenuHandler(uc, log)

	r := chi.NewRouter()
	r.Route("/api/v1", func(api chi.Router) {
		api.Group(func(protected chi.Router) {
			protected.Use(iammw.Authenticate(jwtMgr))
			protected.Get("/menu/categories", h.ListMenuCategories)
			protected.Get("/menu/items", h.ListMenuItems)
			protected.Get("/menu/items/{id}", h.GetMenuItemDetail)
			protected.Get("/menu/bom-options", h.GetBOMOptions)
			protected.Get("/menu/ingredient-categories", h.ListInventoryCategories)
			protected.Get("/menu/ingredients", h.ListMasterIngredients)
			protected.Get("/recipes", h.ListRecipes)
			protected.Get("/recipes/{id}", h.GetSubRecipeDetail)
			protected.Get("/inventory/yield-tests", h.ListYieldTests)

			protected.Group(func(write chi.Router) {
				write.Use(handler.RequireMenuWriteRole)
				write.Post("/menu/categories", h.CreateMenuCategory)
				write.Post("/menu/items", h.CreateMenuItem)
				write.Put("/menu/items/{id}", h.UpdateMenuItem)
				write.Patch("/menu/items/{id}/status", h.UpdateMenuItemStatus)
				write.Delete("/menu/items/{id}", h.DeleteMenuItem)
				write.Put("/menu/items/{id}/recipe", h.SaveMenuRecipe)

				write.Post("/recipes", h.CreateSubRecipe)
				write.Put("/recipes/{id}", h.UpdateSubRecipe)
				write.Delete("/recipes/{id}", h.DeleteSubRecipe)

				write.Post("/menu/ingredient-categories", h.CreateInventoryCategory)
				write.Post("/menu/ingredients", h.CreateMasterIngredient)
				write.Put("/menu/ingredients/{id}", h.UpdateMasterIngredient)
				write.Delete("/menu/ingredients/{id}", h.DeleteMasterIngredient)

				write.Post("/inventory/yield-tests", h.RecordYieldTest)
			})
		})
	})

	return r, jwtMgr
}

func TestMenuHandler_ListMenuItems_AndPOSOnlyFilter(t *testing.T) {
	secret := "a-very-long-32-byte-secret-key-for-test-purposes!"
	tenantID := uuid.New()

	repo := &mockMenuRepo{
		items: []domain.MenuItemWithHPA{
			{
				ID:           uuid.New(),
				TenantID:     tenantID,
				Name:         "Australian Tenderloin Steak 200g",
				Code:         "MENU-TSH-TEND-200",
				Status:       "PUBLISHED",
				SellingPrice: 88000,
				HPA:          41427,
				GrossMargin:  46573,
				FoodCostPct:  47.1,
			},
			{
				ID:           uuid.New(),
				TenantID:     tenantID,
				Name:         "R&D Truffle Fries",
				Code:         "MENU-RND-FRIES",
				Status:       "DRAFT",
				SellingPrice: 0,
				HPA:          12000,
			},
		},
	}

	router, jwtMgr := setupMenuRouter(repo, secret)
	tokenStr, _, _ := jwtMgr.Generate(iamdomain.AuthClaims{
		TenantID: tenantID.String(),
		Username: "owner",
		Roles:    []string{"OWNER"},
	}, 1*time.Hour)

	// 1. Backoffice sees both PUBLISHED and DRAFT
	req := httptest.NewRequest(http.MethodGet, "/api/v1/menu/items", nil)
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var allItems []domain.MenuItemWithHPA
	if err := json.Unmarshal(rec.Body.Bytes(), &allItems); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(allItems) != 2 {
		t.Fatalf("expected 2 items in backoffice, got %d", len(allItems))
	}

	// 2. Cashier POS (?pos_only=true) sees ONLY PUBLISHED
	reqPos := httptest.NewRequest(http.MethodGet, "/api/v1/menu/items?pos_only=true", nil)
	reqPos.Header.Set("Authorization", "Bearer "+tokenStr)
	recPos := httptest.NewRecorder()
	router.ServeHTTP(recPos, reqPos)
	var posItems []domain.MenuItemWithHPA
	if err := json.Unmarshal(recPos.Body.Bytes(), &posItems); err != nil {
		t.Fatalf("decode pos: %v", err)
	}
	if len(posItems) != 1 || posItems[0].Status != "PUBLISHED" {
		t.Fatalf("expected only 1 PUBLISHED item for POS, got %+v", posItems)
	}
}

func TestMenuHandler_RBACAndMasterChefAutonomy(t *testing.T) {
	secret := "a-very-long-32-byte-secret-key-for-test-purposes!"
	tenantID := uuid.New()
	outletID := uuid.New()
	repo := &mockMenuRepo{}
	router, jwtMgr := setupMenuRouter(repo, secret)

	cashierToken, _, _ := jwtMgr.Generate(iamdomain.AuthClaims{
		TenantID:  tenantID.String(),
		Username:  "kasir_steak",
		Roles:     []string{"CASHIER"},
		OutletIDs: []string{outletID.String()},
	}, 1*time.Hour)

	chefToken, _, _ := jwtMgr.Generate(iamdomain.AuthClaims{
		TenantID:  tenantID.String(),
		Username:  "master_chef",
		Roles:     []string{"KITCHEN_CHEF"},
		OutletIDs: []string{outletID.String()},
	}, 1*time.Hour)

	customCat := "Snack R&D"
	menuPayload, _ := json.Marshal(domain.SaveMenuItemRequest{
		Name:               "Crispy Calamari Tartar",
		CustomCategoryName: &customCat,
		MenuType:           "SNACK",
		Status:             "DRAFT",
		SellingPrice:       0,
	})

	// 1. Cashier MUST receive 403 Forbidden on write endpoint
	reqCashier := httptest.NewRequest(http.MethodPost, "/api/v1/menu/items", bytes.NewReader(menuPayload))
	reqCashier.Header.Set("Authorization", "Bearer "+cashierToken)
	recCashier := httptest.NewRecorder()
	router.ServeHTTP(recCashier, reqCashier)
	if recCashier.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for CASHIER, got %d: %s", recCashier.Code, recCashier.Body.String())
	}

	// 2. Master Chef (KITCHEN_CHEF) CAN create R&D Menu, Sub-Recipe, and Master Ingredient
	reqChef := httptest.NewRequest(http.MethodPost, "/api/v1/menu/items", bytes.NewReader(menuPayload))
	reqChef.Header.Set("Authorization", "Bearer "+chefToken)
	recChef := httptest.NewRecorder()
	router.ServeHTTP(recChef, reqChef)
	if recChef.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for KITCHEN_CHEF menu creation, got %d: %s", recChef.Code, recChef.Body.String())
	}

	// 3. Master Chef creates Master Ingredient with Pack-to-Base UoM
	ingCat := "Saus & Dressing"
	packQty := 1000.0
	packPrice := 85000.0
	ingPayload, _ := json.Marshal(domain.SaveMasterIngredientRequest{
		CustomCategoryName: &ingCat,
		Name:               "Mayonnaise Kewpie",
		Unit:               "g",
		StorageType:        "CHILLER",
		PurchasePackQty:    &packQty,
		PurchasePackPrice:  &packPrice,
	})
	reqIng := httptest.NewRequest(http.MethodPost, "/api/v1/menu/ingredients", bytes.NewReader(ingPayload))
	reqIng.Header.Set("Authorization", "Bearer "+chefToken)
	recIng := httptest.NewRecorder()
	router.ServeHTTP(recIng, reqIng)
	if recIng.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for master ingredient, got %d: %s", recIng.Code, recIng.Body.String())
	}
	var createdIng domain.MasterIngredient
	_ = json.Unmarshal(recIng.Body.Bytes(), &createdIng)
	if createdIng.CostPrice != 85 {
		t.Errorf("expected pack-to-base cost 85/g, got %v", createdIng.CostPrice)
	}

	// 4. Master Chef creates Sub-Recipe
	subPayload, _ := json.Marshal(domain.SaveRecipeRequest{
		RecipeName:    "Saus Tartar Homemade Batch 2000 ml",
		YieldPortions: 2000,
		YieldUnit:     "ml",
		Ingredients: []domain.SaveRecipeIngredientInput{
			{
				InventoryItemID: &createdIng.ID,
				CostBasis:       "EP_YIELDED",
				Quantity:        500,
				Unit:            "g",
			},
		},
	})
	reqSub := httptest.NewRequest(http.MethodPost, "/api/v1/recipes", bytes.NewReader(subPayload))
	reqSub.Header.Set("Authorization", "Bearer "+chefToken)
	recSub := httptest.NewRecorder()
	router.ServeHTTP(recSub, reqSub)
	if recSub.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for sub-recipe, got %d: %s", recSub.Code, recSub.Body.String())
	}
}

func TestMenuHandler_RecordYieldTest(t *testing.T) {
	secret := "a-very-long-32-byte-secret-key-for-test-purposes!"
	tenantID := uuid.New()
	outletID := uuid.New()
	itemID := uuid.New()

	repo := &mockMenuRepo{}
	router, jwtMgr := setupMenuRouter(repo, secret)
	tokenStr, _, _ := jwtMgr.Generate(iamdomain.AuthClaims{
		TenantID: tenantID.String(),
		Username: "owner",
		Roles:    []string{"OWNER"},
	}, 1*time.Hour)

	// Primal Cut 5.0 kg @ 135.000, usable meat 4.1 kg -> yield = 82%
	body, _ := json.Marshal(usecase.CreateYieldTestRequest{
		OutletID:         outletID,
		ItemID:           itemID,
		BatchNumber:      "BATCH-TEST-001",
		InitialWeightKg:  5.0,
		InitialCostPerKg: 135000,
		UsableMeatKg:     4.1,
		WasteFatKg:       0.9,
		PortionCutGrams:  200,
	})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/inventory/yield-tests", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var res domain.ButcheringYieldTest
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if res.YieldPercent != 82.0 {
		t.Errorf("expected 82%% yield, got %v", res.YieldPercent)
	}
	if res.EffectiveCostPerKg != 164634.15 {
		t.Errorf("expected true cost 164634.15, got %v", res.EffectiveCostPerKg)
	}
	if res.CostPerPortion != 32926.83 {
		t.Errorf("expected cost per portion 32926.83, got %v", res.CostPerPortion)
	}
}
