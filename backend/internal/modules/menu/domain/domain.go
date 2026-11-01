// Package domain declares entities and interfaces for Menu, Recipe BOM, Sub-Recipes, Master Ingredients, and Yield Tests.
package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// MenuListFilter filters menu items returned by ListMenuItems.
type MenuListFilter struct {
	OutletID *uuid.UUID
	POSOnly  bool // When true, only PUBLISHED menu items are returned for Cashier POS
}

// MenuCategory represents a product category in the menu catalog.
type MenuCategory struct {
	ID           uuid.UUID `json:"id"`
	Code         string    `json:"code"`
	Name         string    `json:"name"`
	DisplayOrder int       `json:"display_order"`
	MenuCount    int       `json:"menu_count"`
}

// CreateMenuCategoryRequest is the input for creating a custom menu category.
type CreateMenuCategoryRequest struct {
	Code         *string `json:"code,omitempty"`
	Name         string  `json:"name"`
	DisplayOrder *int    `json:"display_order,omitempty"`
}

// MenuItemWithHPA represents a menu item with its calculated cost, margin, food cost %, R&D status, and KDS station.
type MenuItemWithHPA struct {
	ID                 uuid.UUID  `json:"id"`
	TenantID           uuid.UUID  `json:"tenant_id"`
	OutletID           *uuid.UUID `json:"outlet_id,omitempty"`
	OutletCode         *string    `json:"outlet_code,omitempty"`
	OutletName         *string    `json:"outlet_name,omitempty"`
	CategoryID         uuid.UUID  `json:"category_id"`
	CategoryCode       string     `json:"category_code"`
	CategoryName       string     `json:"category_name"`
	Code               string     `json:"code"`
	Name               string     `json:"name"`
	Description        *string    `json:"description,omitempty"`
	MenuType           string     `json:"menu_type"`                 // 'FOOD', 'SNACK', 'BEVERAGE'
	Status             string     `json:"status"`                    // 'DRAFT', 'PUBLISHED', 'ARCHIVED'
	KitchenStation     *string    `json:"kitchen_station,omitempty"` // 'GRILL_STEAK', 'SIDES_PANTRY', 'BEVERAGE_BAR', 'BAKARAN_GORENG', 'DAPUR_NUSANTARA', 'BAR_TRADISIONAL', 'EXPEDITER', 'NONE'
	SellingPrice       float64    `json:"selling_price"`
	HPA                float64    `json:"hpa"`           // Cost of Goods Sold (modal resep)
	GrossMargin        float64    `json:"gross_margin"`  // SellingPrice - HPA
	FoodCostPct        float64    `json:"food_cost_pct"` // (HPA / SellingPrice) * 100
	TargetFoodCostPct  float64    `json:"target_food_cost_pct"`
	RecommendedPrice   float64    `json:"recommended_price"` // Ideal selling price rounded to nearest thousand
	HpaCalculationMode string     `json:"hpa_calculation_mode"`
	ManualHPA          float64    `json:"manual_hpa"`
	HasRecipe          bool       `json:"has_recipe"`
	IsAvailable        bool       `json:"is_available"`
	ImageURL           *string    `json:"image_url,omitempty"`
}

// SaveMenuItemRequest is the payload for creating or updating a menu item (with optional custom category & inline BOM).
type SaveMenuItemRequest struct {
	OutletID           *uuid.UUID         `json:"outlet_id,omitempty"`
	CategoryID         *uuid.UUID         `json:"category_id,omitempty"`
	CustomCategoryName *string            `json:"custom_category_name,omitempty"`
	Code               *string            `json:"code,omitempty"`
	Name               string             `json:"name"`
	Description        *string            `json:"description,omitempty"`
	MenuType           string             `json:"menu_type"`                 // 'FOOD', 'SNACK', 'BEVERAGE'
	KitchenStation     *string            `json:"kitchen_station,omitempty"` // Explicit KDS target or auto-suggested
	Status             string             `json:"status"`                    // 'DRAFT' or 'PUBLISHED'
	SellingPrice       float64            `json:"selling_price"`
	TargetFoodCostPct  float64            `json:"target_food_cost_pct"`
	IsAvailable        *bool              `json:"is_available,omitempty"`
	HpaCalculationMode *string            `json:"hpa_calculation_mode,omitempty"`
	ManualHPA          *float64           `json:"manual_hpa,omitempty"`
	ImageURL           *string            `json:"image_url,omitempty"`
	Recipe             *SaveRecipeRequest `json:"recipe,omitempty"`
}

// UpdateMenuItemStatusRequest toggles R&D DRAFT/PUBLISHED status and/or POS availability.
type UpdateMenuItemStatusRequest struct {
	Status      *string `json:"status,omitempty"`
	IsAvailable *bool   `json:"is_available,omitempty"`
}

// RecipeIngredientDetail represents a single line in a 3-tier Recipe BOM.
type RecipeIngredientDetail struct {
	ID                  uuid.UUID  `json:"id"`
	InventoryID         *uuid.UUID `json:"inventory_id,omitempty"`
	SubRecipeID         *uuid.UUID `json:"sub_recipe_id,omitempty"`
	ItemCode            string     `json:"item_code,omitempty"`
	ItemName            string     `json:"item_name"`
	IsSubRecipe         bool       `json:"is_sub_recipe"` // true if Tier 2 (e.g. Saus Mushroom Olahan Dapur)
	CostBasis           string     `json:"cost_basis"`    // 'EP_YIELDED' or 'AP_RAW'
	Quantity            float64    `json:"quantity"`
	Unit                string     `json:"unit"`
	GrossQuantity       float64    `json:"gross_quantity"`
	NetQuantity         float64    `json:"net_quantity"`
	YieldPercentApplied float64    `json:"yield_percent_applied"`
	UnitCost            float64    `json:"unit_cost"`
	SubtotalCost        float64    `json:"subtotal_cost"`
}

// MenuItemDetail represents full recipe BOM breakdown of a menu item.
type MenuItemDetail struct {
	MenuItem     MenuItemWithHPA          `json:"menu_item"`
	RecipeID     uuid.UUID                `json:"recipe_id"`
	RecipeCode   string                   `json:"recipe_code"`
	RecipeName   string                   `json:"recipe_name"`
	Yield        float64                  `json:"yield_portions"`
	YieldUnit    string                   `json:"yield_unit"`
	Instructions *string                  `json:"instructions,omitempty"`
	Ingredients  []RecipeIngredientDetail `json:"ingredients"`
}

// SaveRecipeIngredientInput holds input for one ingredient line when creating/updating a recipe.
type SaveRecipeIngredientInput struct {
	InventoryItemID     *uuid.UUID `json:"inventory_item_id,omitempty"`
	SubRecipeID         *uuid.UUID `json:"sub_recipe_id,omitempty"`
	CostBasis           string     `json:"cost_basis"` // "EP_YIELDED" or "AP_RAW"
	Quantity            float64    `json:"quantity"`   // Net quantity for EP, Gross quantity for AP
	Unit                string     `json:"unit"`
	YieldPercentApplied *float64   `json:"yield_percent_applied,omitempty"`
}

// SaveRecipeRequest is the payload for creating/updating a recipe BOM (Finished Dish or Sub-Recipe).
type SaveRecipeRequest struct {
	RecipeCode    *string                     `json:"recipe_code,omitempty"`
	RecipeName    string                      `json:"recipe_name"`
	YieldPortions float64                     `json:"yield_portions"`
	YieldUnit     string                      `json:"yield_unit"`
	Instructions  *string                     `json:"instructions,omitempty"`
	Ingredients   []SaveRecipeIngredientInput `json:"ingredients"`
}

// SubRecipeDetail represents a standalone Tier-2 WIP / kitchen prep batch recipe with full BOM breakdown.
type SubRecipeDetail struct {
	ID             uuid.UUID                `json:"id"`
	Code           string                   `json:"code"`
	Name           string                   `json:"name"`
	RecipeType     string                   `json:"recipe_type"` // 'SUB_RECIPE'
	YieldPortions  float64                  `json:"yield_portions"`
	YieldUnit      string                   `json:"yield_unit"`
	TotalCostHPA   float64                  `json:"total_cost_hpa"`
	CostPerPortion float64                  `json:"cost_per_portion"`
	Instructions   *string                  `json:"instructions,omitempty"`
	UsedInCount    int                      `json:"used_in_count"`
	Ingredients    []RecipeIngredientDetail `json:"ingredients"`
}

// InventoryCategory represents a category of raw ingredients.
type InventoryCategory struct {
	ID          uuid.UUID `json:"id"`
	Code        string    `json:"code"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	ItemCount   int       `json:"item_count"`
}

// CreateInventoryCategoryRequest is the payload for creating an ingredient category.
type CreateInventoryCategoryRequest struct {
	Code        *string `json:"code,omitempty"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
}

// MasterIngredient represents a Tier-1 raw material with pack-to-base UoM and yield costing metadata.
type MasterIngredient struct {
	ID                   uuid.UUID `json:"id"`
	CategoryID           uuid.UUID `json:"category_id"`
	CategoryCode         string    `json:"category_code"`
	CategoryName         string    `json:"category_name"`
	Code                 string    `json:"code"`
	Name                 string    `json:"name"`
	Unit                 string    `json:"unit"`
	StorageType          string    `json:"storage_type"`
	CostPrice            float64   `json:"cost_price"`
	PurchaseUnit         *string   `json:"purchase_unit,omitempty"`
	PurchasePackQty      *float64  `json:"purchase_pack_qty,omitempty"`
	PurchasePackPrice    *float64  `json:"purchase_pack_price,omitempty"`
	StandardYieldPercent float64   `json:"standard_yield_percent"`
	EffectiveCostPerUnit float64   `json:"effective_cost_per_unit"`
	YieldOutputUnit      *string   `json:"yield_output_unit,omitempty"`
	YieldConversionRatio *float64  `json:"yield_conversion_ratio,omitempty"`
	CurrentStock         float64   `json:"current_stock"`
	MinStockAlert        float64   `json:"min_stock_alert"`
	IsActive             bool      `json:"is_active"`
	UsedInRecipesCount   int       `json:"used_in_recipes_count"`
}

// SaveMasterIngredientRequest is the payload for creating or updating a master raw ingredient.
type SaveMasterIngredientRequest struct {
	CategoryID           *uuid.UUID `json:"category_id,omitempty"`
	CustomCategoryName   *string    `json:"custom_category_name,omitempty"`
	Code                 *string    `json:"code,omitempty"`
	Name                 string     `json:"name"`
	Unit                 string     `json:"unit"`
	StorageType          string     `json:"storage_type"` // 'DRY', 'CHILLER', 'FREEZER'
	CostPrice            float64    `json:"cost_price"`
	PurchaseUnit         *string    `json:"purchase_unit,omitempty"`
	PurchasePackQty      *float64   `json:"purchase_pack_qty,omitempty"`
	PurchasePackPrice    *float64   `json:"purchase_pack_price,omitempty"`
	StandardYieldPercent *float64   `json:"standard_yield_percent,omitempty"`
	YieldOutputUnit      *string    `json:"yield_output_unit,omitempty"`
	YieldConversionRatio *float64   `json:"yield_conversion_ratio,omitempty"`
	MinStockAlert        *float64   `json:"min_stock_alert,omitempty"`
	IsActive             *bool      `json:"is_active,omitempty"`
}

// InventoryItemBOMOption represents raw materials available for selection in BOM builder.
type InventoryItemBOMOption struct {
	ID                   uuid.UUID `json:"id"`
	Code                 string    `json:"code"`
	Name                 string    `json:"name"`
	Unit                 string    `json:"unit"`
	StorageType          string    `json:"storage_type"`
	CostPrice            float64   `json:"cost_price"`
	StandardYieldPercent float64   `json:"standard_yield_percent"`
	EffectiveCostPerUnit float64   `json:"effective_cost_per_unit"`
	YieldOutputUnit      *string   `json:"yield_output_unit,omitempty"`
	YieldConversionRatio *float64  `json:"yield_conversion_ratio,omitempty"`
	CategoryCode         string    `json:"category_code"`
	CategoryName         string    `json:"category_name"`
}

// BOMOptionsResponse provides options for building recipes.
type BOMOptionsResponse struct {
	InventoryItems []InventoryItemBOMOption `json:"inventory_items"`
	SubRecipes     []RecipeSummary          `json:"sub_recipes"`
}

// ButcheringYieldTest represents primal cut meat/fish/produce yield test data.
type ButcheringYieldTest struct {
	ID                 uuid.UUID `json:"id"`
	TenantID           uuid.UUID `json:"tenant_id"`
	OutletID           uuid.UUID `json:"outlet_id"`
	OutletCode         string    `json:"outlet_code"`
	OutletName         string    `json:"outlet_name"`
	ItemID             uuid.UUID `json:"item_id"`
	ItemCode           string    `json:"item_code"`
	ItemName           string    `json:"item_name"`
	TestType           string    `json:"test_type"` // 'MEAT_BUTCHERING', 'POULTRY_FISH', 'PRODUCE_JUICE', 'GENERAL_YIELD'
	BatchNumber        string    `json:"batch_number"`
	TestDate           time.Time `json:"test_date"`
	InitialWeightKg    float64   `json:"initial_weight_kg"`
	InitialCostPerKg   float64   `json:"initial_cost_per_kg"`
	TotalCost          float64   `json:"total_cost"`
	UsableMeatKg       float64   `json:"usable_meat_kg"`
	OutputQuantity     float64   `json:"output_quantity"`
	OutputUnit         string    `json:"output_unit"`
	WasteFatKg         float64   `json:"waste_fat_kg"`
	UsableTrimKg       float64   `json:"usable_trim_kg"`
	YieldPercent       float64   `json:"yield_percent"`
	EffectiveCostPerKg float64   `json:"effective_cost_per_kg"` // True Cost
	PortionCutGrams    float64   `json:"portion_cut_grams"`
	CostPerPortion     float64   `json:"cost_per_portion"`
	Notes              *string   `json:"notes,omitempty"`
}

// RecipeSummary represents a recipe (Tier 2 Sub-Recipe or Tier 3 Finished Dish).
type RecipeSummary struct {
	ID             uuid.UUID `json:"id"`
	Code           string    `json:"code"`
	Name           string    `json:"name"`
	RecipeType     string    `json:"recipe_type"` // 'SUB_RECIPE' or 'FINISHED_DISH'
	YieldPortions  float64   `json:"yield_portions"`
	YieldUnit      string    `json:"yield_unit"`
	TotalCostHPA   float64   `json:"total_cost_hpa"`
	CostPerPortion float64   `json:"cost_per_portion"`
	Instructions   *string   `json:"instructions,omitempty"`
	UsedInCount    int       `json:"used_in_count"`
}

// MenuRepository defines database access for menu, categories, recipes, sub-recipes, master ingredients, and yield tests.
type MenuRepository interface {
	// Menu Items & Categories (Tier 3)
	ListMenuCategories(ctx context.Context, tenantID uuid.UUID) ([]MenuCategory, error)
	CreateMenuCategory(ctx context.Context, tenantID uuid.UUID, req CreateMenuCategoryRequest) (*MenuCategory, error)
	ListMenuItems(ctx context.Context, tenantID uuid.UUID, filter MenuListFilter) ([]MenuItemWithHPA, error)
	GetMenuItemDetail(ctx context.Context, tenantID uuid.UUID, menuID uuid.UUID) (*MenuItemDetail, error)
	CreateMenuItem(ctx context.Context, tenantID uuid.UUID, req SaveMenuItemRequest) (*MenuItemDetail, error)
	UpdateMenuItem(ctx context.Context, tenantID, menuID uuid.UUID, req SaveMenuItemRequest) (*MenuItemDetail, error)
	UpdateMenuItemStatus(ctx context.Context, tenantID, menuID uuid.UUID, req UpdateMenuItemStatusRequest) (*MenuItemDetail, error)
	DeleteMenuItem(ctx context.Context, tenantID, menuID uuid.UUID) error
	SaveMenuRecipe(ctx context.Context, tenantID uuid.UUID, menuID uuid.UUID, req SaveRecipeRequest) (*MenuItemDetail, error)

	// Sub-Recipes & Recipes (Tier 2)
	ListRecipes(ctx context.Context, tenantID uuid.UUID) ([]RecipeSummary, error)
	GetRecipeByID(ctx context.Context, tenantID uuid.UUID, recipeID uuid.UUID) (*RecipeSummary, error)
	GetSubRecipeDetail(ctx context.Context, tenantID, recipeID uuid.UUID) (*SubRecipeDetail, error)
	CreateSubRecipe(ctx context.Context, tenantID uuid.UUID, req SaveRecipeRequest) (*SubRecipeDetail, error)
	UpdateSubRecipe(ctx context.Context, tenantID, recipeID uuid.UUID, req SaveRecipeRequest) (*SubRecipeDetail, error)
	DeleteSubRecipe(ctx context.Context, tenantID, recipeID uuid.UUID) error

	// Master Ingredients & Categories (Tier 1)
	ListInventoryCategories(ctx context.Context, tenantID uuid.UUID) ([]InventoryCategory, error)
	CreateInventoryCategory(ctx context.Context, tenantID uuid.UUID, req CreateInventoryCategoryRequest) (*InventoryCategory, error)
	ListMasterIngredients(ctx context.Context, tenantID uuid.UUID) ([]MasterIngredient, error)
	CreateMasterIngredient(ctx context.Context, tenantID uuid.UUID, req SaveMasterIngredientRequest) (*MasterIngredient, error)
	UpdateMasterIngredient(ctx context.Context, tenantID, itemID uuid.UUID, req SaveMasterIngredientRequest) (*MasterIngredient, error)
	DeleteMasterIngredient(ctx context.Context, tenantID, itemID uuid.UUID) error
	ListInventoryItemsForBOM(ctx context.Context, tenantID uuid.UUID) ([]InventoryItemBOMOption, error)

	// Yield Tests & Cascading DAG Engine
	ListYieldTests(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) ([]ButcheringYieldTest, error)
	CreateYieldTest(ctx context.Context, test ButcheringYieldTest, applyToMaster bool) error
	CheckCircularDependency(ctx context.Context, tenantID uuid.UUID, targetRecipeID uuid.UUID, subRecipeIDs []uuid.UUID) error
	RecalculateCascadingHPA(ctx context.Context, tenantID uuid.UUID, itemID *uuid.UUID, subRecipeID *uuid.UUID) error
}
