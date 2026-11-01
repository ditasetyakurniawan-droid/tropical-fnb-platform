// Package repository provides PostgreSQL persistence for menu items, categories, recipes, sub-recipes, master ingredients, and yield tests.
package repository

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"tropical-fnb/backend/internal/modules/menu/domain"
	"tropical-fnb/backend/internal/modules/menu/engine"
	"tropical-fnb/backend/internal/platform/database"
)

var nonAlnumRegex = regexp.MustCompile(`[^A-Z0-9]+`)

// generateBaseCode builds a clean uppercase code within maxLen (<= 32 chars).
func generateBaseCode(prefix, name string, maxLen int) string {
	cleaned := nonAlnumRegex.ReplaceAllString(strings.ToUpper(strings.TrimSpace(name)), "-")
	cleaned = strings.Trim(cleaned, "-")
	if cleaned == "" {
		cleaned = "ITEM"
	}
	full := prefix + "-" + cleaned
	if len(full) > maxLen {
		full = strings.TrimRight(full[:maxLen], "-")
	}
	return full
}

// PostgresMenuRepository implements domain.MenuRepository.
type PostgresMenuRepository struct {
	txMgr *database.TxManager
}

// NewPostgresMenuRepository creates a new menu repository.
func NewPostgresMenuRepository(txMgr *database.TxManager) *PostgresMenuRepository {
	return &PostgresMenuRepository{txMgr: txMgr}
}

func (r *PostgresMenuRepository) ensureUniqueCode(ctx context.Context, table string, tenantID uuid.UUID, desiredCode, prefix, fallbackName string, excludeID *uuid.UUID) (string, error) {
	base := strings.ToUpper(strings.TrimSpace(desiredCode))
	if base == "" {
		base = generateBaseCode(prefix, fallbackName, 26)
	}
	if len(base) > 32 {
		base = base[:32]
	}

	candidate := base
	for attempt := 0; attempt < 20; attempt++ {
		var exists bool
		var query string
		var args []any
		if excludeID != nil && *excludeID != uuid.Nil {
			query = fmt.Sprintf(`SELECT EXISTS (SELECT 1 FROM %s WHERE tenant_id = $1 AND UPPER(code) = UPPER($2) AND id != $3 AND deleted_at IS NULL)`, table)
			args = []any{tenantID, candidate, *excludeID}
		} else {
			query = fmt.Sprintf(`SELECT EXISTS (SELECT 1 FROM %s WHERE tenant_id = $1 AND UPPER(code) = UPPER($2) AND deleted_at IS NULL)`, table)
			args = []any{tenantID, candidate}
		}
		if err := r.txMgr.Conn(ctx).QueryRow(ctx, query, args...).Scan(&exists); err != nil {
			return "", fmt.Errorf("check code uniqueness on %s: %w", table, err)
		}
		if !exists {
			return candidate, nil
		}
		suffix := fmt.Sprintf("-%d", attempt+2)
		maxBase := 32 - len(suffix)
		trimmed := base
		if len(trimmed) > maxBase {
			trimmed = strings.TrimRight(trimmed[:maxBase], "-")
		}
		candidate = trimmed + suffix
	}
	short := strings.ToUpper(uuid.New().String()[:6])
	trimmed := base
	if len(trimmed) > 25 {
		trimmed = trimmed[:25]
	}
	return trimmed + "-" + short, nil
}

// -----------------------------------------------------------------------------
// 1. Menu Categories & Menu Items (Tier 3 + R&D Lifecycle + Explicit KDS)
// -----------------------------------------------------------------------------

// ListMenuCategories returns all active menu categories with item counts.
func (r *PostgresMenuRepository) ListMenuCategories(ctx context.Context, tenantID uuid.UUID) ([]domain.MenuCategory, error) {
	query := `
		SELECT
			mc.id, mc.code, mc.name, mc.display_order,
			COUNT(m.id) AS menu_count
		FROM menu_categories mc
		LEFT JOIN menu_items m ON m.category_id = mc.id AND m.deleted_at IS NULL AND m.status != 'ARCHIVED'
		WHERE mc.tenant_id = $1 AND mc.deleted_at IS NULL
		GROUP BY mc.id
		ORDER BY mc.display_order ASC, mc.name ASC
	`
	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list menu categories: %w", err)
	}
	defer rows.Close()

	cats := make([]domain.MenuCategory, 0)
	for rows.Next() {
		var c domain.MenuCategory
		if err := rows.Scan(&c.ID, &c.Code, &c.Name, &c.DisplayOrder, &c.MenuCount); err != nil {
			return nil, fmt.Errorf("scan menu category: %w", err)
		}
		cats = append(cats, c)
	}
	return cats, rows.Err()
}

// CreateMenuCategory creates or returns an existing menu category by name.
func (r *PostgresMenuRepository) CreateMenuCategory(ctx context.Context, tenantID uuid.UUID, req domain.CreateMenuCategoryRequest) (*domain.MenuCategory, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, fmt.Errorf("nama kategori menu wajib diisi")
	}

	// Check if same name already exists
	var existing domain.MenuCategory
	err := r.txMgr.Conn(ctx).QueryRow(ctx, `
		SELECT id, code, name, display_order
		FROM menu_categories
		WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) AND deleted_at IS NULL
		LIMIT 1
	`, tenantID, name).Scan(&existing.ID, &existing.Code, &existing.Name, &existing.DisplayOrder)
	if err == nil {
		return &existing, nil
	}

	desiredCode := ""
	if req.Code != nil {
		desiredCode = *req.Code
	}
	code, err := r.ensureUniqueCode(ctx, "menu_categories", tenantID, desiredCode, "CAT", name, nil)
	if err != nil {
		return nil, err
	}

	displayOrder := 10
	if req.DisplayOrder != nil {
		displayOrder = *req.DisplayOrder
	} else {
		_ = r.txMgr.Conn(ctx).QueryRow(ctx, `
			SELECT COALESCE(MAX(display_order), 0) + 1 FROM menu_categories WHERE tenant_id = $1 AND deleted_at IS NULL
		`, tenantID).Scan(&displayOrder)
	}

	var cat domain.MenuCategory
	err = r.txMgr.Conn(ctx).QueryRow(ctx, `
		INSERT INTO menu_categories (tenant_id, code, name, display_order)
		VALUES ($1, $2, $3, $4)
		RETURNING id, code, name, display_order
	`, tenantID, code, name, displayOrder).Scan(&cat.ID, &cat.Code, &cat.Name, &cat.DisplayOrder)
	if err != nil {
		return nil, fmt.Errorf("insert menu category: %w", err)
	}
	return &cat, nil
}

// ListMenuItems returns menu items with computed HPA, margins, recommended selling price, R&D status, and KDS station.
func (r *PostgresMenuRepository) ListMenuItems(ctx context.Context, tenantID uuid.UUID, filter domain.MenuListFilter) ([]domain.MenuItemWithHPA, error) {
	statusFilter := "AND m.status != 'ARCHIVED'"
	if filter.POSOnly {
		statusFilter = "AND m.status = 'PUBLISHED'"
	}

	query := fmt.Sprintf(`
		SELECT
			m.id, m.tenant_id, m.outlet_id, o.code AS outlet_code, o.name AS outlet_name,
			m.category_id, mc.code AS category_code, mc.name AS category_name,
			m.code, m.name, m.description,
			COALESCE(m.menu_type, 'FOOD') AS menu_type,
			COALESCE(m.status, 'PUBLISHED') AS status,
			m.kitchen_station,
			m.selling_price,
			CASE 
				WHEN m.hpa_calculation_mode = 'MANUAL_OVERRIDE' AND m.manual_hpa > 0 THEN m.manual_hpa
				ELSE COALESCE(r.cost_per_portion, m.last_calculated_hpa, 0)
			END AS hpa,
			(m.selling_price - CASE 
				WHEN m.hpa_calculation_mode = 'MANUAL_OVERRIDE' AND m.manual_hpa > 0 THEN m.manual_hpa
				ELSE COALESCE(r.cost_per_portion, m.last_calculated_hpa, 0)
			END) AS gross_margin,
			CASE WHEN m.selling_price > 0 THEN ROUND((CASE 
				WHEN m.hpa_calculation_mode = 'MANUAL_OVERRIDE' AND m.manual_hpa > 0 THEN m.manual_hpa
				ELSE COALESCE(r.cost_per_portion, m.last_calculated_hpa, 0)
			END / m.selling_price) * 100, 2) ELSE 0 END AS food_cost_pct,
			m.target_food_cost_pct,
			COALESCE(m.hpa_calculation_mode, 'DYNAMIC_BOM') AS hpa_calculation_mode,
			COALESCE(m.manual_hpa, 0) AS manual_hpa,
			(r.id IS NOT NULL) AS has_recipe,
			m.is_available, m.image_url
		FROM menu_items m
		JOIN menu_categories mc ON mc.id = m.category_id
		LEFT JOIN outlets o ON o.id = m.outlet_id
		LEFT JOIN recipes r ON r.menu_item_id = m.id AND r.deleted_at IS NULL
		WHERE m.tenant_id = $1 AND m.deleted_at IS NULL
		  %s
		  AND ($2::UUID IS NULL OR m.outlet_id = $2 OR m.outlet_id IS NULL)
		ORDER BY CASE WHEN m.status = 'DRAFT' THEN 0 ELSE 1 END, mc.display_order ASC, m.name ASC
	`, statusFilter)

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID, filter.OutletID)
	if err != nil {
		return nil, fmt.Errorf("list menu items: %w", err)
	}
	defer rows.Close()

	items := make([]domain.MenuItemWithHPA, 0)
	for rows.Next() {
		var item domain.MenuItemWithHPA
		if err := rows.Scan(
			&item.ID,
			&item.TenantID,
			&item.OutletID,
			&item.OutletCode,
			&item.OutletName,
			&item.CategoryID,
			&item.CategoryCode,
			&item.CategoryName,
			&item.Code,
			&item.Name,
			&item.Description,
			&item.MenuType,
			&item.Status,
			&item.KitchenStation,
			&item.SellingPrice,
			&item.HPA,
			&item.GrossMargin,
			&item.FoodCostPct,
			&item.TargetFoodCostPct,
			&item.HpaCalculationMode,
			&item.ManualHPA,
			&item.HasRecipe,
			&item.IsAvailable,
			&item.ImageURL,
		); err != nil {
			return nil, fmt.Errorf("scan menu item: %w", err)
		}
		_, item.RecommendedPrice = engine.CalculateRecommendedSellingPrice(item.HPA, item.TargetFoodCostPct)
		items = append(items, item)
	}

	return items, rows.Err()
}

// GetMenuItemDetail returns a single menu item with its full 3-tier recipe ingredients BOM.
func (r *PostgresMenuRepository) GetMenuItemDetail(ctx context.Context, tenantID, menuID uuid.UUID) (*domain.MenuItemDetail, error) {
	menuQuery := `
		SELECT
			m.id, m.tenant_id, m.outlet_id, o.code AS outlet_code, o.name AS outlet_name,
			m.category_id, mc.code AS category_code, mc.name AS category_name,
			m.code, m.name, m.description,
			COALESCE(m.menu_type, 'FOOD') AS menu_type,
			COALESCE(m.status, 'PUBLISHED') AS status,
			m.kitchen_station,
			m.selling_price,
			CASE 
				WHEN m.hpa_calculation_mode = 'MANUAL_OVERRIDE' AND m.manual_hpa > 0 THEN m.manual_hpa
				ELSE COALESCE(r.cost_per_portion, m.last_calculated_hpa, 0)
			END AS hpa,
			(m.selling_price - CASE 
				WHEN m.hpa_calculation_mode = 'MANUAL_OVERRIDE' AND m.manual_hpa > 0 THEN m.manual_hpa
				ELSE COALESCE(r.cost_per_portion, m.last_calculated_hpa, 0)
			END) AS gross_margin,
			CASE WHEN m.selling_price > 0 THEN ROUND((CASE 
				WHEN m.hpa_calculation_mode = 'MANUAL_OVERRIDE' AND m.manual_hpa > 0 THEN m.manual_hpa
				ELSE COALESCE(r.cost_per_portion, m.last_calculated_hpa, 0)
			END / m.selling_price) * 100, 2) ELSE 0 END AS food_cost_pct,
			m.target_food_cost_pct,
			COALESCE(m.hpa_calculation_mode, 'DYNAMIC_BOM') AS hpa_calculation_mode,
			COALESCE(m.manual_hpa, 0) AS manual_hpa,
			(r.id IS NOT NULL) AS has_recipe,
			m.is_available, m.image_url,
			COALESCE(r.id, '00000000-0000-0000-0000-000000000000'::uuid) AS recipe_id,
			COALESCE(r.code, '') AS recipe_code,
			COALESCE(r.name, '') AS recipe_name,
			COALESCE(r.yield_portions, 1) AS yield_portions,
			COALESCE(r.yield_unit, 'porsi') AS yield_unit,
			r.instructions
		FROM menu_items m
		JOIN menu_categories mc ON mc.id = m.category_id
		LEFT JOIN outlets o ON o.id = m.outlet_id
		LEFT JOIN recipes r ON r.menu_item_id = m.id AND r.deleted_at IS NULL
		WHERE m.tenant_id = $1 AND m.id = $2 AND m.deleted_at IS NULL
	`

	var detail domain.MenuItemDetail
	detail.Ingredients = make([]domain.RecipeIngredientDetail, 0)
	var recipeID uuid.UUID
	err := r.txMgr.Conn(ctx).QueryRow(ctx, menuQuery, tenantID, menuID).Scan(
		&detail.MenuItem.ID,
		&detail.MenuItem.TenantID,
		&detail.MenuItem.OutletID,
		&detail.MenuItem.OutletCode,
		&detail.MenuItem.OutletName,
		&detail.MenuItem.CategoryID,
		&detail.MenuItem.CategoryCode,
		&detail.MenuItem.CategoryName,
		&detail.MenuItem.Code,
		&detail.MenuItem.Name,
		&detail.MenuItem.Description,
		&detail.MenuItem.MenuType,
		&detail.MenuItem.Status,
		&detail.MenuItem.KitchenStation,
		&detail.MenuItem.SellingPrice,
		&detail.MenuItem.HPA,
		&detail.MenuItem.GrossMargin,
		&detail.MenuItem.FoodCostPct,
		&detail.MenuItem.TargetFoodCostPct,
		&detail.MenuItem.HpaCalculationMode,
		&detail.MenuItem.ManualHPA,
		&detail.MenuItem.HasRecipe,
		&detail.MenuItem.IsAvailable,
		&detail.MenuItem.ImageURL,
		&recipeID,
		&detail.RecipeCode,
		&detail.RecipeName,
		&detail.Yield,
		&detail.YieldUnit,
		&detail.Instructions,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("find menu item: %w", err)
	}

	_, detail.MenuItem.RecommendedPrice = engine.CalculateRecommendedSellingPrice(detail.MenuItem.HPA, detail.MenuItem.TargetFoodCostPct)
	detail.RecipeID = recipeID
	if recipeID == uuid.Nil {
		return &detail, nil
	}

	ingredients, err := r.loadRecipeIngredients(ctx, tenantID, recipeID)
	if err != nil {
		return nil, err
	}
	detail.Ingredients = ingredients
	return &detail, nil
}

func (r *PostgresMenuRepository) loadRecipeIngredients(ctx context.Context, tenantID, recipeID uuid.UUID) ([]domain.RecipeIngredientDetail, error) {
	ingQuery := `
		SELECT
			ri.id, ri.inventory_item_id, ri.sub_recipe_id,
			COALESCE(ii.code, sub.code, '') AS item_code,
			COALESCE(ii.name, sub.name, '') AS item_name,
			(ri.sub_recipe_id IS NOT NULL) AS is_sub_recipe,
			ri.cost_basis,
			ri.quantity, ri.unit,
			COALESCE(ri.gross_quantity, ri.quantity),
			COALESCE(ri.net_quantity, ri.quantity),
			COALESCE(ri.yield_percent_applied, 100.00),
			ri.unit_cost, ri.subtotal_cost
		FROM recipe_ingredients ri
		LEFT JOIN inventory_items ii ON ii.id = ri.inventory_item_id
		LEFT JOIN recipes sub ON sub.id = ri.sub_recipe_id
		WHERE ri.tenant_id = $1 AND ri.recipe_id = $2 AND ri.deleted_at IS NULL
		ORDER BY is_sub_recipe DESC, item_name ASC
	`

	rows, err := r.txMgr.Conn(ctx).Query(ctx, ingQuery, tenantID, recipeID)
	if err != nil {
		return nil, fmt.Errorf("list ingredients: %w", err)
	}
	defer rows.Close()

	list := make([]domain.RecipeIngredientDetail, 0)
	for rows.Next() {
		var ing domain.RecipeIngredientDetail
		if err := rows.Scan(
			&ing.ID,
			&ing.InventoryID,
			&ing.SubRecipeID,
			&ing.ItemCode,
			&ing.ItemName,
			&ing.IsSubRecipe,
			&ing.CostBasis,
			&ing.Quantity,
			&ing.Unit,
			&ing.GrossQuantity,
			&ing.NetQuantity,
			&ing.YieldPercentApplied,
			&ing.UnitCost,
			&ing.SubtotalCost,
		); err != nil {
			return nil, fmt.Errorf("scan ingredient: %w", err)
		}
		list = append(list, ing)
	}
	return list, rows.Err()
}

func (r *PostgresMenuRepository) resolveMenuCategoryTx(ctx context.Context, tenantID uuid.UUID, categoryID *uuid.UUID, customName *string) (uuid.UUID, error) {
	if customName != nil && strings.TrimSpace(*customName) != "" {
		cat, err := r.CreateMenuCategory(ctx, tenantID, domain.CreateMenuCategoryRequest{
			Name: strings.TrimSpace(*customName),
		})
		if err != nil {
			return uuid.Nil, err
		}
		return cat.ID, nil
	}
	if categoryID != nil && *categoryID != uuid.Nil {
		return *categoryID, nil
	}
	return uuid.Nil, fmt.Errorf("kategori menu wajib dipilih atau diketik")
}

func (r *PostgresMenuRepository) resolveOutletCode(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) string {
	if outletID == nil || *outletID == uuid.Nil {
		return ""
	}
	var code string
	_ = r.txMgr.Conn(ctx).QueryRow(ctx, `SELECT code FROM outlets WHERE tenant_id = $1 AND id = $2`, tenantID, *outletID).Scan(&code)
	return code
}

// CreateMenuItem creates a new Menu Item (DRAFT or PUBLISHED) with optional custom category and inline BOM recipe.
func (r *PostgresMenuRepository) CreateMenuItem(ctx context.Context, tenantID uuid.UUID, req domain.SaveMenuItemRequest) (*domain.MenuItemDetail, error) {
	var createdID uuid.UUID

	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		catID, err := r.resolveMenuCategoryTx(txCtx, tenantID, req.CategoryID, req.CustomCategoryName)
		if err != nil {
			return err
		}

		outletCode := r.resolveOutletCode(txCtx, tenantID, req.OutletID)
		prefix := "MENU"
		if outletCode == "TSH-01" {
			prefix = "MENU-TSH"
		} else if outletCode == "TGR-01" {
			prefix = "MENU-TGR"
		}

		desiredCode := ""
		if req.Code != nil {
			desiredCode = *req.Code
		}
		code, err := r.ensureUniqueCode(txCtx, "menu_items", tenantID, desiredCode, prefix, req.Name, nil)
		if err != nil {
			return err
		}

		menuType := strings.ToUpper(strings.TrimSpace(req.MenuType))
		if menuType != "FOOD" && menuType != "SNACK" && menuType != "BEVERAGE" {
			menuType = "FOOD"
		}

		status := strings.ToUpper(strings.TrimSpace(req.Status))
		if status != "DRAFT" && status != "PUBLISHED" {
			status = "DRAFT"
		}

		station := ""
		if req.KitchenStation != nil && strings.TrimSpace(*req.KitchenStation) != "" {
			station = strings.ToUpper(strings.TrimSpace(*req.KitchenStation))
		} else {
			station = engine.SuggestKitchenStation(outletCode, menuType)
		}

		targetFC := req.TargetFoodCostPct
		if targetFC <= 0 || targetFC >= 100 {
			targetFC = 35.0
		}

		isAvailable := true
		if req.IsAvailable != nil {
			isAvailable = *req.IsAvailable
		}

		hpaMode := "DYNAMIC_BOM"
		if req.HpaCalculationMode != nil && *req.HpaCalculationMode == "MANUAL_OVERRIDE" {
			hpaMode = "MANUAL_OVERRIDE"
		}
		manualHPA := 0.0
		if req.ManualHPA != nil && *req.ManualHPA >= 0 {
			manualHPA = *req.ManualHPA
		}

		err = r.txMgr.Conn(txCtx).QueryRow(txCtx, `
			INSERT INTO menu_items (
				tenant_id, outlet_id, category_id, code, name, description,
				menu_type, status, kitchen_station,
				selling_price, target_food_cost_pct, is_available, image_url,
				hpa_calculation_mode, manual_hpa, last_calculated_hpa
			) VALUES (
				$1, $2, $3, $4, $5, $6,
				$7, $8, $9,
				$10, $11, $12, $13,
				$14, $15, 0
			) RETURNING id
		`, tenantID, req.OutletID, catID, code, strings.TrimSpace(req.Name), req.Description,
			menuType, status, station,
			req.SellingPrice, targetFC, isAvailable, req.ImageURL,
			hpaMode, manualHPA,
		).Scan(&createdID)
		if err != nil {
			return fmt.Errorf("insert menu item: %w", err)
		}

		if req.Recipe != nil && len(req.Recipe.Ingredients) > 0 {
			if err := r.saveMenuRecipeInTx(txCtx, tenantID, createdID, *req.Recipe); err != nil {
				return err
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return r.GetMenuItemDetail(ctx, tenantID, createdID)
}

// UpdateMenuItem updates an existing menu item's metadata, pricing, KDS station, status, and optional inline BOM.
func (r *PostgresMenuRepository) UpdateMenuItem(ctx context.Context, tenantID, menuID uuid.UUID, req domain.SaveMenuItemRequest) (*domain.MenuItemDetail, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		var existingCode, existingStatus, existingMode string
		var existingAvail bool
		var existingManualHPA float64
		err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `
			SELECT code, COALESCE(status, 'PUBLISHED'), is_available, COALESCE(hpa_calculation_mode, 'DYNAMIC_BOM'), COALESCE(manual_hpa, 0)
			FROM menu_items
			WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
		`, tenantID, menuID).Scan(&existingCode, &existingStatus, &existingAvail, &existingMode, &existingManualHPA)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("menu tidak ditemukan")
			}
			return fmt.Errorf("lookup menu item: %w", err)
		}

		catID, err := r.resolveMenuCategoryTx(txCtx, tenantID, req.CategoryID, req.CustomCategoryName)
		if err != nil {
			return err
		}

		code := existingCode
		if req.Code != nil && strings.TrimSpace(*req.Code) != "" {
			code, err = r.ensureUniqueCode(txCtx, "menu_items", tenantID, *req.Code, "MENU", req.Name, &menuID)
			if err != nil {
				return err
			}
		}

		outletCode := r.resolveOutletCode(txCtx, tenantID, req.OutletID)
		menuType := strings.ToUpper(strings.TrimSpace(req.MenuType))
		if menuType != "FOOD" && menuType != "SNACK" && menuType != "BEVERAGE" {
			menuType = "FOOD"
		}

		status := strings.ToUpper(strings.TrimSpace(req.Status))
		if status != "DRAFT" && status != "PUBLISHED" && status != "ARCHIVED" {
			status = existingStatus
		}

		station := ""
		if req.KitchenStation != nil && strings.TrimSpace(*req.KitchenStation) != "" {
			station = strings.ToUpper(strings.TrimSpace(*req.KitchenStation))
		} else {
			station = engine.SuggestKitchenStation(outletCode, menuType)
		}

		targetFC := req.TargetFoodCostPct
		if targetFC <= 0 || targetFC >= 100 {
			targetFC = 35.0
		}

		isAvailable := existingAvail
		if req.IsAvailable != nil {
			isAvailable = *req.IsAvailable
		}

		hpaMode := existingMode
		if req.HpaCalculationMode != nil && (*req.HpaCalculationMode == "DYNAMIC_BOM" || *req.HpaCalculationMode == "MANUAL_OVERRIDE") {
			hpaMode = *req.HpaCalculationMode
		}

		manualHPA := existingManualHPA
		if req.ManualHPA != nil && *req.ManualHPA >= 0 {
			manualHPA = *req.ManualHPA
		}

		_, err = r.txMgr.Conn(txCtx).Exec(txCtx, `
			UPDATE menu_items
			SET outlet_id = $1,
			    category_id = $2,
			    code = $3,
			    name = $4,
			    description = $5,
			    menu_type = $6,
			    status = $7,
			    kitchen_station = $8,
			    selling_price = $9,
			    target_food_cost_pct = $10,
			    is_available = $11,
			    image_url = COALESCE($12, image_url),
			    hpa_calculation_mode = $13,
			    manual_hpa = $14,
			    updated_at = now()
			WHERE tenant_id = $15 AND id = $16 AND deleted_at IS NULL
		`, req.OutletID, catID, code, strings.TrimSpace(req.Name), req.Description,
			menuType, status, station,
			req.SellingPrice, targetFC, isAvailable, req.ImageURL,
			hpaMode, manualHPA, tenantID, menuID,
		)
		if err != nil {
			return fmt.Errorf("update menu item: %w", err)
		}

		if req.Recipe != nil && len(req.Recipe.Ingredients) > 0 {
			if err := r.saveMenuRecipeInTx(txCtx, tenantID, menuID, *req.Recipe); err != nil {
				return err
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return r.GetMenuItemDetail(ctx, tenantID, menuID)
}

// UpdateMenuItemStatus toggles DRAFT/PUBLISHED status and/or POS availability.
func (r *PostgresMenuRepository) UpdateMenuItemStatus(ctx context.Context, tenantID, menuID uuid.UUID, req domain.UpdateMenuItemStatusRequest) (*domain.MenuItemDetail, error) {
	tag, err := r.txMgr.Conn(ctx).Exec(ctx, `
		UPDATE menu_items
		SET status = COALESCE($1, status),
		    is_available = COALESCE($2, is_available),
		    updated_at = now()
		WHERE tenant_id = $3 AND id = $4 AND deleted_at IS NULL
	`, req.Status, req.IsAvailable, tenantID, menuID)
	if err != nil {
		return nil, fmt.Errorf("update menu status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, fmt.Errorf("menu tidak ditemukan")
	}
	return r.GetMenuItemDetail(ctx, tenantID, menuID)
}

// DeleteMenuItem safely soft-deletes (archives) a menu item and its linked finished dish recipe.
func (r *PostgresMenuRepository) DeleteMenuItem(ctx context.Context, tenantID, menuID uuid.UUID) error {
	return r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		tag, err := r.txMgr.Conn(txCtx).Exec(txCtx, `
			UPDATE menu_items
			SET deleted_at = now(),
			    status = 'ARCHIVED',
			    is_available = false,
			    updated_at = now()
			WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
		`, tenantID, menuID)
		if err != nil {
			return fmt.Errorf("archive menu item: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return fmt.Errorf("menu tidak ditemukan")
		}

		_, err = r.txMgr.Conn(txCtx).Exec(txCtx, `
			UPDATE recipes
			SET deleted_at = now(), updated_at = now()
			WHERE tenant_id = $1 AND menu_item_id = $2 AND deleted_at IS NULL
		`, tenantID, menuID)
		if err != nil {
			return fmt.Errorf("archive menu recipe: %w", err)
		}
		return nil
	})
}

// -----------------------------------------------------------------------------
// 2. Shared BOM Recipe Engine & Sub-Recipes CRUD (Tier 2 & Tier 3)
// -----------------------------------------------------------------------------

// GetRecipeByID returns a recipe summary by ID.
func (r *PostgresMenuRepository) GetRecipeByID(ctx context.Context, tenantID uuid.UUID, recipeID uuid.UUID) (*domain.RecipeSummary, error) {
	query := `
		SELECT
			r.id, r.code, r.name, r.recipe_type, r.yield_portions, r.yield_unit,
			r.total_cost_hpa, r.cost_per_portion, r.instructions,
			(SELECT COUNT(DISTINCT ri.recipe_id)
			   FROM recipe_ingredients ri
			   JOIN recipes parent ON parent.id = ri.recipe_id AND parent.deleted_at IS NULL
			  WHERE ri.tenant_id = r.tenant_id AND ri.sub_recipe_id = r.id AND ri.deleted_at IS NULL) AS used_in_count
		FROM recipes r
		WHERE r.tenant_id = $1 AND r.id = $2 AND r.deleted_at IS NULL
	`
	var s domain.RecipeSummary
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query, tenantID, recipeID).Scan(
		&s.ID, &s.Code, &s.Name, &s.RecipeType, &s.YieldPortions, &s.YieldUnit,
		&s.TotalCostHPA, &s.CostPerPortion, &s.Instructions, &s.UsedInCount,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("find recipe by id: %w", err)
	}
	return &s, nil
}

// GetSubRecipeDetail returns a standalone Tier-2 Sub-Recipe with its full ingredient BOM.
func (r *PostgresMenuRepository) GetSubRecipeDetail(ctx context.Context, tenantID, recipeID uuid.UUID) (*domain.SubRecipeDetail, error) {
	summary, err := r.GetRecipeByID(ctx, tenantID, recipeID)
	if err != nil {
		return nil, err
	}
	if summary == nil || summary.RecipeType != "SUB_RECIPE" {
		return nil, nil
	}

	ingredients, err := r.loadRecipeIngredients(ctx, tenantID, recipeID)
	if err != nil {
		return nil, err
	}

	return &domain.SubRecipeDetail{
		ID:             summary.ID,
		Code:           summary.Code,
		Name:           summary.Name,
		RecipeType:     summary.RecipeType,
		YieldPortions:  summary.YieldPortions,
		YieldUnit:      summary.YieldUnit,
		TotalCostHPA:   summary.TotalCostHPA,
		CostPerPortion: summary.CostPerPortion,
		Instructions:   summary.Instructions,
		UsedInCount:    summary.UsedInCount,
		Ingredients:    ingredients,
	}, nil
}

// CheckCircularDependency checks whether adding any subRecipeID into targetRecipeID would form a cycle.
func (r *PostgresMenuRepository) CheckCircularDependency(ctx context.Context, tenantID uuid.UUID, targetRecipeID uuid.UUID, subRecipeIDs []uuid.UUID) error {
	if targetRecipeID == uuid.Nil || len(subRecipeIDs) == 0 {
		return nil
	}

	for _, subID := range subRecipeIDs {
		if subID == targetRecipeID {
			return fmt.Errorf("sub-resep tidak boleh merujuk ke dirinya sendiri")
		}

		query := `
			WITH RECURSIVE sub_tree AS (
				SELECT ri.sub_recipe_id
				FROM recipe_ingredients ri
				WHERE ri.tenant_id = $1 AND ri.recipe_id = $2 AND ri.sub_recipe_id IS NOT NULL AND ri.deleted_at IS NULL
				UNION ALL
				SELECT ri.sub_recipe_id
				FROM recipe_ingredients ri
				JOIN sub_tree st ON ri.recipe_id = st.sub_recipe_id
				WHERE ri.tenant_id = $1 AND ri.sub_recipe_id IS NOT NULL AND ri.deleted_at IS NULL
			)
			SELECT EXISTS (
				SELECT 1 FROM sub_tree WHERE sub_recipe_id = $3
			);
		`
		var hasCycle bool
		err := r.txMgr.Conn(ctx).QueryRow(ctx, query, tenantID, subID, targetRecipeID).Scan(&hasCycle)
		if err != nil {
			return fmt.Errorf("check circular dependency: %w", err)
		}
		if hasCycle {
			return fmt.Errorf("terdeteksi ketergantungan sirkular (circular dependency) pada sub-resep")
		}
	}

	return nil
}

func (r *PostgresMenuRepository) calculateAndSaveRecipeBOMTx(txCtx context.Context, tenantID, recipeID uuid.UUID, req domain.SaveRecipeRequest) (float64, float64, error) {
	subRecipeIDs := make([]uuid.UUID, 0)
	for _, ing := range req.Ingredients {
		if ing.SubRecipeID != nil && *ing.SubRecipeID != uuid.Nil {
			subRecipeIDs = append(subRecipeIDs, *ing.SubRecipeID)
		}
	}
	if err := r.CheckCircularDependency(txCtx, tenantID, recipeID, subRecipeIDs); err != nil {
		return 0, 0, err
	}

	calculatedSubtotals := make([]float64, 0, len(req.Ingredients))
	type calculatedRow struct {
		InventoryItemID     *uuid.UUID
		SubRecipeID         *uuid.UUID
		CostBasis           string
		Quantity            float64
		Unit                string
		GrossQuantity       float64
		NetQuantity         float64
		YieldPercentApplied float64
		UnitCost            float64
		SubtotalCost        float64
	}
	rowsToInsert := make([]calculatedRow, 0, len(req.Ingredients))

	for idx, ing := range req.Ingredients {
		if (ing.InventoryItemID == nil || *ing.InventoryItemID == uuid.Nil) && (ing.SubRecipeID == nil || *ing.SubRecipeID == uuid.Nil) {
			return 0, 0, fmt.Errorf("bahan baris %d harus memilih bahan mentah atau sub-resep", idx+1)
		}
		if (ing.InventoryItemID != nil && *ing.InventoryItemID != uuid.Nil) && (ing.SubRecipeID != nil && *ing.SubRecipeID != uuid.Nil) {
			return 0, 0, fmt.Errorf("bahan baris %d tidak boleh memilih keduanya sekaligus", idx+1)
		}
		if ing.Quantity <= 0 {
			return 0, 0, fmt.Errorf("kuantitas bahan baris %d harus lebih besar dari 0", idx+1)
		}

		costBasis := engine.CostBasisEPYielded
		if ing.CostBasis == string(engine.CostBasisAPRaw) {
			costBasis = engine.CostBasisAPRaw
		}

		var calcInput engine.IngredientCalculationInput
		calcInput.CostBasis = costBasis
		calcInput.Quantity = ing.Quantity
		calcInput.IngredientUnit = ing.Unit

		if ing.InventoryItemID != nil && *ing.InventoryItemID != uuid.Nil {
			var costPrice float64
			var itemUnit string
			var stdYield float64
			var yieldOutputUnit *string
			var yieldRatio *float64

			err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `
				SELECT cost_price, unit, standard_yield_percent, yield_output_unit, yield_conversion_ratio
				FROM inventory_items
				WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
			`, tenantID, *ing.InventoryItemID).Scan(&costPrice, &itemUnit, &stdYield, &yieldOutputUnit, &yieldRatio)
			if err != nil {
				return 0, 0, fmt.Errorf("bahan mentah baris %d tidak ditemukan: %w", idx+1, err)
			}

			calcInput.CostPrice = costPrice
			calcInput.ItemUnit = itemUnit
			calcInput.StandardYieldPercent = stdYield
			calcInput.YieldOutputUnit = yieldOutputUnit
			calcInput.YieldConversionRatio = yieldRatio
			calcInput.IsSubRecipe = false

			if ing.YieldPercentApplied != nil && *ing.YieldPercentApplied > 0 {
				calcInput.YieldPercentApplied = *ing.YieldPercentApplied
			} else {
				calcInput.YieldPercentApplied = stdYield
			}
		} else {
			var subCostPerPortion float64
			var subYieldUnit string
			err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `
				SELECT cost_per_portion, yield_unit
				FROM recipes
				WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
			`, tenantID, *ing.SubRecipeID).Scan(&subCostPerPortion, &subYieldUnit)
			if err != nil {
				return 0, 0, fmt.Errorf("sub-resep baris %d tidak ditemukan: %w", idx+1, err)
			}

			calcInput.CostPrice = subCostPerPortion
			calcInput.ItemUnit = subYieldUnit
			calcInput.StandardYieldPercent = 100.0
			calcInput.YieldPercentApplied = 100.0
			calcInput.IsSubRecipe = true
		}

		calcRes, err := engine.CalculateIngredientCost(calcInput)
		if err != nil {
			return 0, 0, fmt.Errorf("baris %d: %w", idx+1, err)
		}

		calculatedSubtotals = append(calculatedSubtotals, calcRes.SubtotalCost)
		rowsToInsert = append(rowsToInsert, calculatedRow{
			InventoryItemID:     ing.InventoryItemID,
			SubRecipeID:         ing.SubRecipeID,
			CostBasis:           string(costBasis),
			Quantity:            ing.Quantity,
			Unit:                ing.Unit,
			GrossQuantity:       calcRes.GrossQuantity,
			NetQuantity:         calcRes.NetQuantity,
			YieldPercentApplied: calcRes.YieldPercentApplied,
			UnitCost:            calcRes.UnitCost,
			SubtotalCost:        calcRes.SubtotalCost,
		})
	}

	_, err := r.txMgr.Conn(txCtx).Exec(txCtx, `
		DELETE FROM recipe_ingredients WHERE tenant_id = $1 AND recipe_id = $2
	`, tenantID, recipeID)
	if err != nil {
		return 0, 0, fmt.Errorf("clear old ingredients: %w", err)
	}

	for _, row := range rowsToInsert {
		_, err = r.txMgr.Conn(txCtx).Exec(txCtx, `
			INSERT INTO recipe_ingredients (
				id, tenant_id, recipe_id, inventory_item_id, sub_recipe_id,
				cost_basis, quantity, unit, gross_quantity, net_quantity, yield_percent_applied,
				unit_cost, subtotal_cost
			) VALUES (
				$1, $2, $3, $4, $5,
				$6, $7, $8, $9, $10, $11,
				$12, $13
			)
		`, uuid.New(), tenantID, recipeID, row.InventoryItemID, row.SubRecipeID,
			row.CostBasis, row.Quantity, row.Unit, row.GrossQuantity, row.NetQuantity, row.YieldPercentApplied,
			row.UnitCost, row.SubtotalCost)
		if err != nil {
			return 0, 0, fmt.Errorf("insert ingredient: %w", err)
		}
	}

	totalHPA, costPerPortion, err := engine.CalculateRecipeTotals(calculatedSubtotals, req.YieldPortions)
	if err != nil {
		return 0, 0, err
	}

	_, err = r.txMgr.Conn(txCtx).Exec(txCtx, `
		UPDATE recipes
		SET name = $1,
		    yield_portions = $2,
		    yield_unit = $3,
		    instructions = $4,
		    total_cost_hpa = $5,
		    cost_per_portion = $6,
		    updated_at = now()
		WHERE tenant_id = $7 AND id = $8
	`, req.RecipeName, req.YieldPortions, req.YieldUnit, req.Instructions, totalHPA, costPerPortion, tenantID, recipeID)
	if err != nil {
		return 0, 0, fmt.Errorf("update recipe header totals: %w", err)
	}

	return totalHPA, costPerPortion, nil
}

func (r *PostgresMenuRepository) saveMenuRecipeInTx(txCtx context.Context, tenantID, menuID uuid.UUID, req domain.SaveRecipeRequest) error {
	var menuCode, menuName string
	err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `
		SELECT code, name FROM menu_items WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
	`, tenantID, menuID).Scan(&menuCode, &menuName)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("menu item tidak ditemukan")
		}
		return fmt.Errorf("verify menu item: %w", err)
	}

	if req.YieldPortions <= 0 {
		req.YieldPortions = 1.0
	}
	if strings.TrimSpace(req.YieldUnit) == "" {
		req.YieldUnit = "porsi"
	}
	if strings.TrimSpace(req.RecipeName) == "" {
		req.RecipeName = "Resep " + menuName
	}

	var recipeID uuid.UUID
	var existingCode string
	err = r.txMgr.Conn(txCtx).QueryRow(txCtx, `
		SELECT id, code FROM recipes WHERE tenant_id = $1 AND menu_item_id = $2 AND deleted_at IS NULL
	`, tenantID, menuID).Scan(&recipeID, &existingCode)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("check existing recipe: %w", err)
	}

	if recipeID == uuid.Nil {
		recipeID = uuid.New()
		desiredCode := "REC-" + menuCode
		if req.RecipeCode != nil && strings.TrimSpace(*req.RecipeCode) != "" {
			desiredCode = *req.RecipeCode
		}
		recipeCode, err := r.ensureUniqueCode(txCtx, "recipes", tenantID, desiredCode, "REC", menuName, nil)
		if err != nil {
			return err
		}

		_, err = r.txMgr.Conn(txCtx).Exec(txCtx, `
			INSERT INTO recipes (
				id, tenant_id, menu_item_id, code, name, recipe_type, yield_portions, yield_unit, instructions, total_cost_hpa, cost_per_portion
			) VALUES (
				$1, $2, $3, $4, $5, 'FINISHED_DISH', $6, $7, $8, 0, 0
			)
		`, recipeID, tenantID, menuID, recipeCode, req.RecipeName, req.YieldPortions, req.YieldUnit, req.Instructions)
		if err != nil {
			return fmt.Errorf("insert recipe header: %w", err)
		}
	}

	_, costPerPortion, err := r.calculateAndSaveRecipeBOMTx(txCtx, tenantID, recipeID, req)
	if err != nil {
		return err
	}

	_, err = r.txMgr.Conn(txCtx).Exec(txCtx, `
		UPDATE menu_items
		SET last_calculated_hpa = $1,
		    updated_at = now()
		WHERE tenant_id = $2 AND id = $3
	`, costPerPortion, tenantID, menuID)
	if err != nil {
		return fmt.Errorf("update menu item last_calculated_hpa: %w", err)
	}
	return nil
}

// SaveMenuRecipe creates or updates the BOM recipe for a finished dish within a DB transaction.
func (r *PostgresMenuRepository) SaveMenuRecipe(ctx context.Context, tenantID uuid.UUID, menuID uuid.UUID, req domain.SaveRecipeRequest) (*domain.MenuItemDetail, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		return r.saveMenuRecipeInTx(txCtx, tenantID, menuID, req)
	})
	if err != nil {
		return nil, err
	}
	return r.GetMenuItemDetail(ctx, tenantID, menuID)
}

// CreateSubRecipe creates a new Tier-2 WIP Sub-Recipe (e.g. Saus, Bumbu Marinasi, Biang Sirup) with custom batch output unit.
func (r *PostgresMenuRepository) CreateSubRecipe(ctx context.Context, tenantID uuid.UUID, req domain.SaveRecipeRequest) (*domain.SubRecipeDetail, error) {
	var createdID uuid.UUID

	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		createdID = uuid.New()
		desiredCode := ""
		if req.RecipeCode != nil {
			desiredCode = *req.RecipeCode
		}
		code, err := r.ensureUniqueCode(txCtx, "recipes", tenantID, desiredCode, "SUB", req.RecipeName, nil)
		if err != nil {
			return err
		}

		if req.YieldPortions <= 0 {
			return fmt.Errorf("jumlah hasil batch (yield) sub-recipe harus lebih besar dari 0")
		}
		if strings.TrimSpace(req.YieldUnit) == "" {
			req.YieldUnit = "ml"
		}

		_, err = r.txMgr.Conn(txCtx).Exec(txCtx, `
			INSERT INTO recipes (
				id, tenant_id, menu_item_id, code, name, recipe_type,
				yield_portions, yield_unit, instructions, total_cost_hpa, cost_per_portion
			) VALUES (
				$1, $2, NULL, $3, $4, 'SUB_RECIPE',
				$5, $6, $7, 0, 0
			)
		`, createdID, tenantID, code, strings.TrimSpace(req.RecipeName), req.YieldPortions, strings.TrimSpace(req.YieldUnit), req.Instructions)
		if err != nil {
			return fmt.Errorf("insert sub-recipe header: %w", err)
		}

		_, _, err = r.calculateAndSaveRecipeBOMTx(txCtx, tenantID, createdID, req)
		return err
	})
	if err != nil {
		return nil, err
	}

	return r.GetSubRecipeDetail(ctx, tenantID, createdID)
}

// UpdateSubRecipe updates a Tier-2 Sub-Recipe BOM and triggers real-time Cascading HPA Recalculation to all dependent menus.
func (r *PostgresMenuRepository) UpdateSubRecipe(ctx context.Context, tenantID, recipeID uuid.UUID, req domain.SaveRecipeRequest) (*domain.SubRecipeDetail, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		var rType string
		err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `
			SELECT recipe_type FROM recipes WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
		`, tenantID, recipeID).Scan(&rType)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("sub-recipe tidak ditemukan")
			}
			return fmt.Errorf("lookup sub-recipe: %w", err)
		}
		if rType != "SUB_RECIPE" {
			return fmt.Errorf("resep ini bukan bertipe SUB_RECIPE")
		}

		if req.RecipeCode != nil && strings.TrimSpace(*req.RecipeCode) != "" {
			code, err := r.ensureUniqueCode(txCtx, "recipes", tenantID, *req.RecipeCode, "SUB", req.RecipeName, &recipeID)
			if err != nil {
				return err
			}
			_, _ = r.txMgr.Conn(txCtx).Exec(txCtx, `UPDATE recipes SET code = $1 WHERE tenant_id = $2 AND id = $3`, code, tenantID, recipeID)
		}

		if _, _, err := r.calculateAndSaveRecipeBOMTx(txCtx, tenantID, recipeID, req); err != nil {
			return err
		}

		// Cascade recalculation to any nested sub-recipes and all Tier-3 finished menus
		return r.RecalculateCascadingHPA(txCtx, tenantID, nil, &recipeID)
	})
	if err != nil {
		return nil, err
	}

	return r.GetSubRecipeDetail(ctx, tenantID, recipeID)
}

// DeleteSubRecipe soft-deletes a Sub-Recipe only if no active recipe currently depends on it.
func (r *PostgresMenuRepository) DeleteSubRecipe(ctx context.Context, tenantID, recipeID uuid.UUID) error {
	rows, err := r.txMgr.Conn(ctx).Query(ctx, `
		SELECT DISTINCT parent.name
		FROM recipe_ingredients ri
		JOIN recipes parent ON parent.id = ri.recipe_id AND parent.deleted_at IS NULL
		WHERE ri.tenant_id = $1 AND ri.sub_recipe_id = $2 AND ri.deleted_at IS NULL
		ORDER BY parent.name ASC
	`, tenantID, recipeID)
	if err != nil {
		return fmt.Errorf("check sub-recipe usage: %w", err)
	}
	defer rows.Close()

	usedBy := make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			usedBy = append(usedBy, name)
		}
	}
	if len(usedBy) > 0 {
		return fmt.Errorf("sub-recipe tidak dapat dihapus karena masih digunakan aktif pada %d resep (%s). Lepaskan terlebih dahulu dari BOM resep tersebut", len(usedBy), strings.Join(usedBy, ", "))
	}

	tag, err := r.txMgr.Conn(ctx).Exec(ctx, `
		UPDATE recipes
		SET deleted_at = now(), updated_at = now()
		WHERE tenant_id = $1 AND id = $2 AND recipe_type = 'SUB_RECIPE' AND deleted_at IS NULL
	`, tenantID, recipeID)
	if err != nil {
		return fmt.Errorf("delete sub-recipe: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("sub-recipe tidak ditemukan")
	}
	return nil
}

// ListRecipes returns all active recipes with usage counts.
func (r *PostgresMenuRepository) ListRecipes(ctx context.Context, tenantID uuid.UUID) ([]domain.RecipeSummary, error) {
	query := `
		SELECT
			r.id, r.code, r.name, r.recipe_type, r.yield_portions, r.yield_unit,
			r.total_cost_hpa, r.cost_per_portion, r.instructions,
			(SELECT COUNT(DISTINCT ri.recipe_id)
			   FROM recipe_ingredients ri
			   JOIN recipes parent ON parent.id = ri.recipe_id AND parent.deleted_at IS NULL
			  WHERE ri.tenant_id = r.tenant_id AND ri.sub_recipe_id = r.id AND ri.deleted_at IS NULL) AS used_in_count
		FROM recipes r
		WHERE r.tenant_id = $1 AND r.deleted_at IS NULL
		ORDER BY r.recipe_type DESC, r.name ASC
	`

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list recipes: %w", err)
	}
	defer rows.Close()

	recs := make([]domain.RecipeSummary, 0)
	for rows.Next() {
		var s domain.RecipeSummary
		if err := rows.Scan(
			&s.ID,
			&s.Code,
			&s.Name,
			&s.RecipeType,
			&s.YieldPortions,
			&s.YieldUnit,
			&s.TotalCostHPA,
			&s.CostPerPortion,
			&s.Instructions,
			&s.UsedInCount,
		); err != nil {
			return nil, fmt.Errorf("scan recipe: %w", err)
		}
		recs = append(recs, s)
	}

	return recs, rows.Err()
}

// -----------------------------------------------------------------------------
// 3. Master Raw Ingredients & Categories CRUD (Tier 1 + Warehouse Sync + Cascade)
// -----------------------------------------------------------------------------

// ListInventoryCategories returns all active raw ingredient categories.
func (r *PostgresMenuRepository) ListInventoryCategories(ctx context.Context, tenantID uuid.UUID) ([]domain.InventoryCategory, error) {
	query := `
		SELECT
			ic.id, ic.code, ic.name, ic.description,
			COUNT(ii.id) AS item_count
		FROM inventory_categories ic
		LEFT JOIN inventory_items ii ON ii.category_id = ic.id AND ii.deleted_at IS NULL
		WHERE ic.tenant_id = $1 AND ic.deleted_at IS NULL
		GROUP BY ic.id
		ORDER BY ic.name ASC
	`
	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list inventory categories: %w", err)
	}
	defer rows.Close()

	cats := make([]domain.InventoryCategory, 0)
	for rows.Next() {
		var c domain.InventoryCategory
		if err := rows.Scan(&c.ID, &c.Code, &c.Name, &c.Description, &c.ItemCount); err != nil {
			return nil, fmt.Errorf("scan inventory category: %w", err)
		}
		cats = append(cats, c)
	}
	return cats, rows.Err()
}

// CreateInventoryCategory creates or reuses an inventory category by name.
func (r *PostgresMenuRepository) CreateInventoryCategory(ctx context.Context, tenantID uuid.UUID, req domain.CreateInventoryCategoryRequest) (*domain.InventoryCategory, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, fmt.Errorf("nama kategori bahan baku wajib diisi")
	}

	var existing domain.InventoryCategory
	err := r.txMgr.Conn(ctx).QueryRow(ctx, `
		SELECT id, code, name, description
		FROM inventory_categories
		WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) AND deleted_at IS NULL
		LIMIT 1
	`, tenantID, name).Scan(&existing.ID, &existing.Code, &existing.Name, &existing.Description)
	if err == nil {
		return &existing, nil
	}

	desiredCode := ""
	if req.Code != nil {
		desiredCode = *req.Code
	}
	code, err := r.ensureUniqueCode(ctx, "inventory_categories", tenantID, desiredCode, "ICAT", name, nil)
	if err != nil {
		return nil, err
	}

	var cat domain.InventoryCategory
	err = r.txMgr.Conn(ctx).QueryRow(ctx, `
		INSERT INTO inventory_categories (tenant_id, code, name, description)
		VALUES ($1, $2, $3, $4)
		RETURNING id, code, name, description
	`, tenantID, code, name, req.Description).Scan(&cat.ID, &cat.Code, &cat.Name, &cat.Description)
	if err != nil {
		return nil, fmt.Errorf("insert inventory category: %w", err)
	}
	return &cat, nil
}

func (r *PostgresMenuRepository) resolveInventoryCategoryTx(ctx context.Context, tenantID uuid.UUID, categoryID *uuid.UUID, customName *string) (uuid.UUID, error) {
	if customName != nil && strings.TrimSpace(*customName) != "" {
		cat, err := r.CreateInventoryCategory(ctx, tenantID, domain.CreateInventoryCategoryRequest{
			Name: strings.TrimSpace(*customName),
		})
		if err != nil {
			return uuid.Nil, err
		}
		return cat.ID, nil
	}
	if categoryID != nil && *categoryID != uuid.Nil {
		return *categoryID, nil
	}
	return uuid.Nil, fmt.Errorf("kategori bahan baku wajib dipilih atau diketik")
}

// ListMasterIngredients returns all non-deleted raw ingredients with pack metadata and recipe usage counts.
func (r *PostgresMenuRepository) ListMasterIngredients(ctx context.Context, tenantID uuid.UUID) ([]domain.MasterIngredient, error) {
	query := `
		SELECT
			ii.id, ii.category_id, ic.code AS category_code, ic.name AS category_name,
			ii.code, ii.name, ii.unit, ii.storage_type,
			ii.cost_price, ii.purchase_unit, ii.purchase_pack_qty, ii.purchase_pack_price,
			ii.standard_yield_percent, ii.effective_cost_per_unit,
			ii.yield_output_unit, ii.yield_conversion_ratio,
			ii.current_stock, ii.min_stock_alert, ii.is_active,
			(SELECT COUNT(DISTINCT ri.recipe_id)
			   FROM recipe_ingredients ri
			   JOIN recipes rec ON rec.id = ri.recipe_id AND rec.deleted_at IS NULL
			  WHERE ri.tenant_id = ii.tenant_id AND ri.inventory_item_id = ii.id AND ri.deleted_at IS NULL) AS used_in_recipes_count
		FROM inventory_items ii
		JOIN inventory_categories ic ON ic.id = ii.category_id
		WHERE ii.tenant_id = $1 AND ii.deleted_at IS NULL
		ORDER BY ic.name ASC, ii.name ASC
	`
	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list master ingredients: %w", err)
	}
	defer rows.Close()

	list := make([]domain.MasterIngredient, 0)
	for rows.Next() {
		var it domain.MasterIngredient
		if err := rows.Scan(
			&it.ID, &it.CategoryID, &it.CategoryCode, &it.CategoryName,
			&it.Code, &it.Name, &it.Unit, &it.StorageType,
			&it.CostPrice, &it.PurchaseUnit, &it.PurchasePackQty, &it.PurchasePackPrice,
			&it.StandardYieldPercent, &it.EffectiveCostPerUnit,
			&it.YieldOutputUnit, &it.YieldConversionRatio,
			&it.CurrentStock, &it.MinStockAlert, &it.IsActive,
			&it.UsedInRecipesCount,
		); err != nil {
			return nil, fmt.Errorf("scan master ingredient: %w", err)
		}
		list = append(list, it)
	}
	return list, rows.Err()
}

func (r *PostgresMenuRepository) getMasterIngredientByID(ctx context.Context, tenantID, itemID uuid.UUID) (*domain.MasterIngredient, error) {
	query := `
		SELECT
			ii.id, ii.category_id, ic.code AS category_code, ic.name AS category_name,
			ii.code, ii.name, ii.unit, ii.storage_type,
			ii.cost_price, ii.purchase_unit, ii.purchase_pack_qty, ii.purchase_pack_price,
			ii.standard_yield_percent, ii.effective_cost_per_unit,
			ii.yield_output_unit, ii.yield_conversion_ratio,
			ii.current_stock, ii.min_stock_alert, ii.is_active,
			(SELECT COUNT(DISTINCT ri.recipe_id)
			   FROM recipe_ingredients ri
			   JOIN recipes rec ON rec.id = ri.recipe_id AND rec.deleted_at IS NULL
			  WHERE ri.tenant_id = ii.tenant_id AND ri.inventory_item_id = ii.id AND ri.deleted_at IS NULL) AS used_in_recipes_count
		FROM inventory_items ii
		JOIN inventory_categories ic ON ic.id = ii.category_id
		WHERE ii.tenant_id = $1 AND ii.id = $2 AND ii.deleted_at IS NULL
	`
	var it domain.MasterIngredient
	err := r.txMgr.Conn(ctx).QueryRow(ctx, query, tenantID, itemID).Scan(
		&it.ID, &it.CategoryID, &it.CategoryCode, &it.CategoryName,
		&it.Code, &it.Name, &it.Unit, &it.StorageType,
		&it.CostPrice, &it.PurchaseUnit, &it.PurchasePackQty, &it.PurchasePackPrice,
		&it.StandardYieldPercent, &it.EffectiveCostPerUnit,
		&it.YieldOutputUnit, &it.YieldConversionRatio,
		&it.CurrentStock, &it.MinStockAlert, &it.IsActive,
		&it.UsedInRecipesCount,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get master ingredient: %w", err)
	}
	return &it, nil
}

// CreateMasterIngredient creates a new Tier-1 raw material, computes pack-to-base UoM cost, and seeds stock_balances across active warehouses.
func (r *PostgresMenuRepository) CreateMasterIngredient(ctx context.Context, tenantID uuid.UUID, req domain.SaveMasterIngredientRequest) (*domain.MasterIngredient, error) {
	var createdID uuid.UUID

	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		catID, err := r.resolveInventoryCategoryTx(txCtx, tenantID, req.CategoryID, req.CustomCategoryName)
		if err != nil {
			return err
		}

		desiredCode := ""
		if req.Code != nil {
			desiredCode = *req.Code
		}
		code, err := r.ensureUniqueCode(txCtx, "inventory_items", tenantID, desiredCode, "ING", req.Name, nil)
		if err != nil {
			return err
		}

		unit := strings.ToLower(strings.TrimSpace(req.Unit))
		if unit == "" {
			unit = "kg"
		}

		storageType := strings.ToUpper(strings.TrimSpace(req.StorageType))
		if storageType != "DRY" && storageType != "CHILLER" && storageType != "FREEZER" {
			storageType = "DRY"
		}

		costPrice := req.CostPrice
		if req.PurchasePackQty != nil && *req.PurchasePackQty > 0 && req.PurchasePackPrice != nil && *req.PurchasePackPrice >= 0 {
			costPrice, err = engine.CalculatePackBaseCost(*req.PurchasePackPrice, *req.PurchasePackQty)
			if err != nil {
				return err
			}
		}
		if costPrice < 0 {
			return fmt.Errorf("harga modal bahan baku tidak boleh negatif")
		}

		stdYield := 100.0
		if req.StandardYieldPercent != nil && *req.StandardYieldPercent > 0 {
			stdYield = *req.StandardYieldPercent
		}
		effCost := engine.CalculateEffectiveUnitCost(costPrice, stdYield)

		minStock := 0.0
		if req.MinStockAlert != nil && *req.MinStockAlert >= 0 {
			minStock = *req.MinStockAlert
		}

		isActive := true
		if req.IsActive != nil {
			isActive = *req.IsActive
		}

		err = r.txMgr.Conn(txCtx).QueryRow(txCtx, `
			INSERT INTO inventory_items (
				tenant_id, category_id, code, name, unit, storage_type,
				cost_price, purchase_unit, purchase_pack_qty, purchase_pack_price,
				standard_yield_percent, effective_cost_per_unit, yield_output_unit, yield_conversion_ratio,
				current_stock, min_stock_alert, is_active
			) VALUES (
				$1, $2, $3, $4, $5, $6,
				$7, $8, $9, $10,
				$11, $12, $13, $14,
				0, $15, $16
			) RETURNING id
		`, tenantID, catID, code, strings.TrimSpace(req.Name), unit, storageType,
			costPrice, req.PurchaseUnit, req.PurchasePackQty, req.PurchasePackPrice,
			stdYield, effCost, req.YieldOutputUnit, req.YieldConversionRatio,
			minStock, isActive,
		).Scan(&createdID)
		if err != nil {
			return fmt.Errorf("insert master ingredient: %w", err)
		}

		// Auto-initialize zero stock_balances across all active warehouses of this tenant
		// so Procurement PO, Goods Receipt, Stock Transfer, Waste, and Blind Stock Opname immediately see it!
		_, err = r.txMgr.Conn(txCtx).Exec(txCtx, `
			INSERT INTO stock_balances (tenant_id, warehouse_id, item_id, quantity, min_stock_alert)
			SELECT $1, w.id, $2, 0, $3
			FROM warehouses w
			WHERE w.tenant_id = $1 AND w.is_active = true AND w.deleted_at IS NULL
			ON CONFLICT (tenant_id, warehouse_id, item_id) DO NOTHING
		`, tenantID, createdID, minStock)
		if err != nil {
			return fmt.Errorf("initialize stock balances for new ingredient: %w", err)
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return r.getMasterIngredientByID(ctx, tenantID, createdID)
}

// UpdateMasterIngredient updates a raw ingredient and triggers real-time Cascading HPA Recalculation across all Sub-Recipes and Menus.
func (r *PostgresMenuRepository) UpdateMasterIngredient(ctx context.Context, tenantID, itemID uuid.UUID, req domain.SaveMasterIngredientRequest) (*domain.MasterIngredient, error) {
	err := r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		var existingCode string
		var existingStdYield float64
		var existingActive bool
		var existingMinStock float64
		err := r.txMgr.Conn(txCtx).QueryRow(txCtx, `
			SELECT code, standard_yield_percent, is_active, min_stock_alert
			FROM inventory_items
			WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
		`, tenantID, itemID).Scan(&existingCode, &existingStdYield, &existingActive, &existingMinStock)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("bahan baku tidak ditemukan")
			}
			return fmt.Errorf("lookup ingredient: %w", err)
		}

		catID, err := r.resolveInventoryCategoryTx(txCtx, tenantID, req.CategoryID, req.CustomCategoryName)
		if err != nil {
			return err
		}

		code := existingCode
		if req.Code != nil && strings.TrimSpace(*req.Code) != "" {
			code, err = r.ensureUniqueCode(txCtx, "inventory_items", tenantID, *req.Code, "ING", req.Name, &itemID)
			if err != nil {
				return err
			}
		}

		unit := strings.ToLower(strings.TrimSpace(req.Unit))
		if unit == "" {
			unit = "kg"
		}

		storageType := strings.ToUpper(strings.TrimSpace(req.StorageType))
		if storageType != "DRY" && storageType != "CHILLER" && storageType != "FREEZER" {
			storageType = "DRY"
		}

		costPrice := req.CostPrice
		if req.PurchasePackQty != nil && *req.PurchasePackQty > 0 && req.PurchasePackPrice != nil && *req.PurchasePackPrice >= 0 {
			costPrice, err = engine.CalculatePackBaseCost(*req.PurchasePackPrice, *req.PurchasePackQty)
			if err != nil {
				return err
			}
		}
		if costPrice < 0 {
			return fmt.Errorf("harga modal bahan baku tidak boleh negatif")
		}

		stdYield := existingStdYield
		if req.StandardYieldPercent != nil && *req.StandardYieldPercent > 0 {
			stdYield = *req.StandardYieldPercent
		}
		effCost := engine.CalculateEffectiveUnitCost(costPrice, stdYield)

		minStock := existingMinStock
		if req.MinStockAlert != nil && *req.MinStockAlert >= 0 {
			minStock = *req.MinStockAlert
		}

		isActive := existingActive
		if req.IsActive != nil {
			isActive = *req.IsActive
		}

		_, err = r.txMgr.Conn(txCtx).Exec(txCtx, `
			UPDATE inventory_items
			SET category_id = $1,
			    code = $2,
			    name = $3,
			    unit = $4,
			    storage_type = $5,
			    cost_price = $6,
			    purchase_unit = $7,
			    purchase_pack_qty = $8,
			    purchase_pack_price = $9,
			    standard_yield_percent = $10,
			    effective_cost_per_unit = $11,
			    yield_output_unit = $12,
			    yield_conversion_ratio = $13,
			    min_stock_alert = $14,
			    is_active = $15,
			    updated_at = now()
			WHERE tenant_id = $16 AND id = $17 AND deleted_at IS NULL
		`, catID, code, strings.TrimSpace(req.Name), unit, storageType,
			costPrice, req.PurchaseUnit, req.PurchasePackQty, req.PurchasePackPrice,
			stdYield, effCost, req.YieldOutputUnit, req.YieldConversionRatio,
			minStock, isActive, tenantID, itemID,
		)
		if err != nil {
			return fmt.Errorf("update master ingredient: %w", err)
		}

		// Sync min_stock_alert to stock_balances
		_, _ = r.txMgr.Conn(txCtx).Exec(txCtx, `
			UPDATE stock_balances SET min_stock_alert = $1, updated_at = now()
			WHERE tenant_id = $2 AND item_id = $3
		`, minStock, tenantID, itemID)

		// Trigger real-time Cascading HPA Recalculation across Tier-2 Sub-Recipes & Tier-3 Menus
		return r.RecalculateCascadingHPA(txCtx, tenantID, &itemID, nil)
	})
	if err != nil {
		return nil, err
	}

	return r.getMasterIngredientByID(ctx, tenantID, itemID)
}

// DeleteMasterIngredient safely soft-deletes a raw ingredient if it is not actively used in recipes and has zero physical stock.
func (r *PostgresMenuRepository) DeleteMasterIngredient(ctx context.Context, tenantID, itemID uuid.UUID) error {
	rows, err := r.txMgr.Conn(ctx).Query(ctx, `
		SELECT DISTINCT rec.name
		FROM recipe_ingredients ri
		JOIN recipes rec ON rec.id = ri.recipe_id AND rec.deleted_at IS NULL
		WHERE ri.tenant_id = $1 AND ri.inventory_item_id = $2 AND ri.deleted_at IS NULL
		ORDER BY rec.name ASC
	`, tenantID, itemID)
	if err != nil {
		return fmt.Errorf("check ingredient recipe usage: %w", err)
	}
	defer rows.Close()

	usedBy := make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			usedBy = append(usedBy, name)
		}
	}
	if len(usedBy) > 0 {
		return fmt.Errorf("bahan baku tidak dapat dihapus karena masih digunakan pada %d resep aktif (%s). Lepaskan dari BOM resep terlebih dahulu", len(usedBy), strings.Join(usedBy, ", "))
	}

	var totalStock float64
	_ = r.txMgr.Conn(ctx).QueryRow(ctx, `
		SELECT COALESCE(SUM(quantity), 0) FROM stock_balances WHERE tenant_id = $1 AND item_id = $2
	`, tenantID, itemID).Scan(&totalStock)
	if totalStock > 0.0001 {
		return fmt.Errorf("bahan baku tidak dapat dihapus karena masih memiliki saldo stok fisik di gudang (%.2f). Nonaktifkan status bahan baku atau kosongkan stok terlebih dahulu", totalStock)
	}

	tag, err := r.txMgr.Conn(ctx).Exec(ctx, `
		UPDATE inventory_items
		SET deleted_at = now(), is_active = false, updated_at = now()
		WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
	`, tenantID, itemID)
	if err != nil {
		return fmt.Errorf("delete master ingredient: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("bahan baku tidak ditemukan")
	}
	return nil
}

// ListInventoryItemsForBOM returns active inventory items for BOM selection.
func (r *PostgresMenuRepository) ListInventoryItemsForBOM(ctx context.Context, tenantID uuid.UUID) ([]domain.InventoryItemBOMOption, error) {
	query := `
		SELECT
			ii.id, ii.code, ii.name, ii.unit, ii.storage_type,
			ii.cost_price, ii.standard_yield_percent, ii.effective_cost_per_unit,
			ii.yield_output_unit, ii.yield_conversion_ratio,
			ic.code AS category_code, ic.name AS category_name
		FROM inventory_items ii
		JOIN inventory_categories ic ON ic.id = ii.category_id
		WHERE ii.tenant_id = $1 AND ii.is_active = true AND ii.deleted_at IS NULL
		ORDER BY ic.name ASC, ii.name ASC
	`

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list inventory items for bom: %w", err)
	}
	defer rows.Close()

	items := make([]domain.InventoryItemBOMOption, 0)
	for rows.Next() {
		var it domain.InventoryItemBOMOption
		if err := rows.Scan(
			&it.ID,
			&it.Code,
			&it.Name,
			&it.Unit,
			&it.StorageType,
			&it.CostPrice,
			&it.StandardYieldPercent,
			&it.EffectiveCostPerUnit,
			&it.YieldOutputUnit,
			&it.YieldConversionRatio,
			&it.CategoryCode,
			&it.CategoryName,
		); err != nil {
			return nil, fmt.Errorf("scan bom item: %w", err)
		}
		items = append(items, it)
	}

	return items, rows.Err()
}

// -----------------------------------------------------------------------------
// 4. Universal Yield Tests & Multi-Hop Cascading HPA Recalculation
// -----------------------------------------------------------------------------

// ListYieldTests returns yield test records.
func (r *PostgresMenuRepository) ListYieldTests(ctx context.Context, tenantID uuid.UUID, outletID *uuid.UUID) ([]domain.ButcheringYieldTest, error) {
	query := `
		SELECT
			b.id, b.tenant_id, b.outlet_id, o.code AS outlet_code, o.name AS outlet_name,
			b.item_id, ii.code AS item_code, ii.name AS item_name,
			COALESCE(b.test_type, 'MEAT_BUTCHERING') AS test_type,
			b.batch_number, b.test_date, b.initial_weight_kg, b.initial_cost_per_kg, b.total_cost,
			b.usable_meat_kg,
			COALESCE(b.output_quantity, b.usable_meat_kg) AS output_quantity,
			COALESCE(b.output_unit, 'kg') AS output_unit,
			b.waste_fat_kg, b.usable_trim_kg, b.yield_percent,
			b.effective_cost_per_kg, b.portion_cut_grams, b.cost_per_portion, b.notes
		FROM butchering_yield_tests b
		JOIN outlets o ON o.id = b.outlet_id
		JOIN inventory_items ii ON ii.id = b.item_id
		WHERE b.tenant_id = $1 AND b.deleted_at IS NULL
		  AND ($2::UUID IS NULL OR b.outlet_id = $2)
		ORDER BY b.test_date DESC, b.created_at DESC
	`

	rows, err := r.txMgr.Conn(ctx).Query(ctx, query, tenantID, outletID)
	if err != nil {
		return nil, fmt.Errorf("list yield tests: %w", err)
	}
	defer rows.Close()

	tests := make([]domain.ButcheringYieldTest, 0)
	for rows.Next() {
		var t domain.ButcheringYieldTest
		if err := rows.Scan(
			&t.ID,
			&t.TenantID,
			&t.OutletID,
			&t.OutletCode,
			&t.OutletName,
			&t.ItemID,
			&t.ItemCode,
			&t.ItemName,
			&t.TestType,
			&t.BatchNumber,
			&t.TestDate,
			&t.InitialWeightKg,
			&t.InitialCostPerKg,
			&t.TotalCost,
			&t.UsableMeatKg,
			&t.OutputQuantity,
			&t.OutputUnit,
			&t.WasteFatKg,
			&t.UsableTrimKg,
			&t.YieldPercent,
			&t.EffectiveCostPerKg,
			&t.PortionCutGrams,
			&t.CostPerPortion,
			&t.Notes,
		); err != nil {
			return nil, fmt.Errorf("scan yield test: %w", err)
		}
		tests = append(tests, t)
	}

	return tests, rows.Err()
}

// CreateYieldTest inserts a new yield test and optionally updates master item & triggers cascading recalc.
func (r *PostgresMenuRepository) CreateYieldTest(ctx context.Context, test domain.ButcheringYieldTest, applyToMaster bool) error {
	return r.txMgr.WithTx(ctx, func(txCtx context.Context) error {
		query := `
			INSERT INTO butchering_yield_tests (
				id, tenant_id, outlet_id, item_id, test_type, batch_number, test_date,
				initial_weight_kg, initial_cost_per_kg, total_cost,
				usable_meat_kg, output_quantity, output_unit, waste_fat_kg, usable_trim_kg,
				yield_percent, effective_cost_per_kg, portion_cut_grams, cost_per_portion, notes
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7,
				$8, $9, $10,
				$11, $12, $13, $14, $15,
				$16, $17, $18, $19, $20
			)
		`

		_, err := r.txMgr.Conn(txCtx).Exec(txCtx, query,
			test.ID,
			test.TenantID,
			test.OutletID,
			test.ItemID,
			test.TestType,
			test.BatchNumber,
			test.TestDate,
			test.InitialWeightKg,
			test.InitialCostPerKg,
			test.TotalCost,
			test.UsableMeatKg,
			test.OutputQuantity,
			test.OutputUnit,
			test.WasteFatKg,
			test.UsableTrimKg,
			test.YieldPercent,
			test.EffectiveCostPerKg,
			test.PortionCutGrams,
			test.CostPerPortion,
			test.Notes,
		)
		if err != nil {
			return fmt.Errorf("insert yield test: %w", err)
		}

		if applyToMaster {
			var conversionRatio *float64
			var outputUnit *string
			if test.OutputUnit != "" && test.OutputUnit != "kg" {
				outputUnit = &test.OutputUnit
				if test.InitialWeightKg > 0 && test.OutputQuantity > 0 {
					ratio := test.OutputQuantity / test.InitialWeightKg
					conversionRatio = &ratio
				}
			}

			_, err = r.txMgr.Conn(txCtx).Exec(txCtx, `
				UPDATE inventory_items
				SET standard_yield_percent = $1,
				    yield_output_unit = $2,
				    yield_conversion_ratio = $3,
				    effective_cost_per_unit = $4,
				    updated_at = now()
				WHERE tenant_id = $5 AND id = $6
			`, test.YieldPercent, outputUnit, conversionRatio, test.EffectiveCostPerKg, test.TenantID, test.ItemID)
			if err != nil {
				return fmt.Errorf("update master inventory item yield: %w", err)
			}

			if err := r.RecalculateCascadingHPA(txCtx, test.TenantID, &test.ItemID, nil); err != nil {
				return fmt.Errorf("cascading recalculation after yield test: %w", err)
			}
		}

		return nil
	})
}

// RecalculateCascadingHPA recalculates HPA through Tier 1 -> Tier 2 (multi-hop DAG) -> Tier 3 -> menu_items.
func (r *PostgresMenuRepository) RecalculateCascadingHPA(ctx context.Context, tenantID uuid.UUID, itemID *uuid.UUID, subRecipeID *uuid.UUID) error {
	// Step 1: Discover and recalculate affected Sub-Recipes (Tier 2) in topological order
	allAffectedSubIDs := make(map[uuid.UUID]bool)
	frontierSubIDs := make([]uuid.UUID, 0)

	if subRecipeID != nil && *subRecipeID != uuid.Nil {
		allAffectedSubIDs[*subRecipeID] = true
		frontierSubIDs = append(frontierSubIDs, *subRecipeID)
	}

	if itemID != nil && *itemID != uuid.Nil {
		subRows, err := r.txMgr.Conn(ctx).Query(ctx, `
			SELECT DISTINCT r.id
			FROM recipes r
			JOIN recipe_ingredients ri ON ri.recipe_id = r.id
			WHERE r.tenant_id = $1 AND r.recipe_type = 'SUB_RECIPE' AND r.deleted_at IS NULL
			  AND ri.inventory_item_id = $2 AND ri.deleted_at IS NULL
		`, tenantID, *itemID)
		if err != nil {
			return fmt.Errorf("find affected sub-recipes: %w", err)
		}
		for subRows.Next() {
			var sID uuid.UUID
			if err := subRows.Scan(&sID); err == nil && !allAffectedSubIDs[sID] {
				allAffectedSubIDs[sID] = true
				frontierSubIDs = append(frontierSubIDs, sID)
			}
		}
		subRows.Close()
	}

	// Process Tier-2 sub-recipes wave by wave (handles nested sub-recipes cleanly up to max 6 hops)
	for hop := 0; hop < 6 && len(frontierSubIDs) > 0; hop++ {
		nextFrontier := make([]uuid.UUID, 0)
		for _, sID := range frontierSubIDs {
			if err := r.recalculateSingleRecipe(ctx, tenantID, sID); err != nil {
				return fmt.Errorf("recalculate sub-recipe %s: %w", sID, err)
			}
			// Find any downstream sub-recipes that depend on sID
			depRows, err := r.txMgr.Conn(ctx).Query(ctx, `
				SELECT DISTINCT r.id
				FROM recipes r
				JOIN recipe_ingredients ri ON ri.recipe_id = r.id
				WHERE r.tenant_id = $1 AND r.recipe_type = 'SUB_RECIPE' AND r.deleted_at IS NULL
				  AND ri.sub_recipe_id = $2 AND ri.deleted_at IS NULL
			`, tenantID, sID)
			if err != nil {
				return fmt.Errorf("find downstream sub-recipes: %w", err)
			}
			for depRows.Next() {
				var depID uuid.UUID
				if err := depRows.Scan(&depID); err == nil {
					allAffectedSubIDs[depID] = true
					nextFrontier = append(nextFrontier, depID)
				}
			}
			depRows.Close()
		}
		frontierSubIDs = nextFrontier
	}

	// Step 2: Find all affected Finished Dishes (Tier 3)
	affectedDishIDs := make(map[uuid.UUID]bool)

	if itemID != nil && *itemID != uuid.Nil {
		rows, err := r.txMgr.Conn(ctx).Query(ctx, `
			SELECT DISTINCT r.id
			FROM recipes r
			JOIN recipe_ingredients ri ON ri.recipe_id = r.id
			WHERE r.tenant_id = $1 AND r.recipe_type = 'FINISHED_DISH' AND r.deleted_at IS NULL
			  AND ri.inventory_item_id = $2 AND ri.deleted_at IS NULL
		`, tenantID, *itemID)
		if err != nil {
			return fmt.Errorf("find dishes by item: %w", err)
		}
		for rows.Next() {
			var dID uuid.UUID
			if err := rows.Scan(&dID); err == nil {
				affectedDishIDs[dID] = true
			}
		}
		rows.Close()
	}

	for sID := range allAffectedSubIDs {
		rows, err := r.txMgr.Conn(ctx).Query(ctx, `
			SELECT DISTINCT r.id
			FROM recipes r
			JOIN recipe_ingredients ri ON ri.recipe_id = r.id
			WHERE r.tenant_id = $1 AND r.recipe_type = 'FINISHED_DISH' AND r.deleted_at IS NULL
			  AND ri.sub_recipe_id = $2 AND ri.deleted_at IS NULL
		`, tenantID, sID)
		if err != nil {
			return fmt.Errorf("find dishes by sub-recipe %s: %w", sID, err)
		}
		for rows.Next() {
			var dID uuid.UUID
			if err := rows.Scan(&dID); err == nil {
				affectedDishIDs[dID] = true
			}
		}
		rows.Close()
	}

	// Recalculate each affected finished dish
	for dID := range affectedDishIDs {
		if err := r.recalculateSingleRecipe(ctx, tenantID, dID); err != nil {
			return fmt.Errorf("recalculate dish %s: %w", dID, err)
		}
	}

	return nil
}

// recalculateSingleRecipe recalculates ingredients and updates totals for one recipe.
func (r *PostgresMenuRepository) recalculateSingleRecipe(ctx context.Context, tenantID, recipeID uuid.UUID) error {
	var yieldPortions float64
	var recipeType string
	var menuItemId *uuid.UUID
	err := r.txMgr.Conn(ctx).QueryRow(ctx, `
		SELECT yield_portions, recipe_type, menu_item_id
		FROM recipes
		WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
	`, tenantID, recipeID).Scan(&yieldPortions, &recipeType, &menuItemId)
	if err != nil {
		return err
	}

	if yieldPortions <= 0 {
		yieldPortions = 1.0
	}

	type ingRow struct {
		id                  uuid.UUID
		inventoryItemId     *uuid.UUID
		subRecipeId         *uuid.UUID
		costBasis           string
		quantity            float64
		unit                string
		yieldPercentApplied float64
	}

	rows, err := r.txMgr.Conn(ctx).Query(ctx, `
		SELECT id, inventory_item_id, sub_recipe_id, cost_basis, quantity, unit, COALESCE(yield_percent_applied, 100.00)
		FROM recipe_ingredients
		WHERE tenant_id = $1 AND recipe_id = $2 AND deleted_at IS NULL
	`, tenantID, recipeID)
	if err != nil {
		return err
	}
	defer rows.Close()

	ingredients := make([]ingRow, 0)
	for rows.Next() {
		var row ingRow
		if err := rows.Scan(&row.id, &row.inventoryItemId, &row.subRecipeId, &row.costBasis, &row.quantity, &row.unit, &row.yieldPercentApplied); err != nil {
			return err
		}
		ingredients = append(ingredients, row)
	}

	calculatedSubtotals := make([]float64, 0, len(ingredients))

	for _, ing := range ingredients {
		var calcInput engine.IngredientCalculationInput
		calcInput.Quantity = ing.quantity
		calcInput.IngredientUnit = ing.unit
		calcInput.CostBasis = engine.CostBasis(ing.costBasis)
		if calcInput.CostBasis == "" {
			calcInput.CostBasis = engine.CostBasisEPYielded
		}

		if ing.inventoryItemId != nil && *ing.inventoryItemId != uuid.Nil {
			var costPrice float64
			var itemUnit string
			var stdYield float64
			var yieldOutputUnit *string
			var yieldRatio *float64

			err := r.txMgr.Conn(ctx).QueryRow(ctx, `
				SELECT cost_price, unit, standard_yield_percent, yield_output_unit, yield_conversion_ratio
				FROM inventory_items
				WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
			`, tenantID, *ing.inventoryItemId).Scan(&costPrice, &itemUnit, &stdYield, &yieldOutputUnit, &yieldRatio)
			if err != nil {
				continue
			}

			calcInput.CostPrice = costPrice
			calcInput.ItemUnit = itemUnit
			calcInput.StandardYieldPercent = stdYield
			calcInput.YieldOutputUnit = yieldOutputUnit
			calcInput.YieldConversionRatio = yieldRatio
			calcInput.IsSubRecipe = false
			if stdYield > 0 {
				calcInput.YieldPercentApplied = stdYield
			} else {
				calcInput.YieldPercentApplied = ing.yieldPercentApplied
			}
		} else if ing.subRecipeId != nil && *ing.subRecipeId != uuid.Nil {
			var subCostPerPortion float64
			var subYieldUnit string
			err := r.txMgr.Conn(ctx).QueryRow(ctx, `
				SELECT cost_per_portion, yield_unit
				FROM recipes
				WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
			`, tenantID, *ing.subRecipeId).Scan(&subCostPerPortion, &subYieldUnit)
			if err != nil {
				continue
			}

			calcInput.CostPrice = subCostPerPortion
			calcInput.ItemUnit = subYieldUnit
			calcInput.StandardYieldPercent = 100.0
			calcInput.YieldPercentApplied = 100.0
			calcInput.IsSubRecipe = true
		}

		calcRes, err := engine.CalculateIngredientCost(calcInput)
		if err != nil {
			continue
		}

		calculatedSubtotals = append(calculatedSubtotals, calcRes.SubtotalCost)

		_, _ = r.txMgr.Conn(ctx).Exec(ctx, `
			UPDATE recipe_ingredients
			SET gross_quantity = $1,
			    net_quantity = $2,
			    yield_percent_applied = $3,
			    unit_cost = $4,
			    subtotal_cost = $5,
			    updated_at = now()
			WHERE id = $6
		`, calcRes.GrossQuantity, calcRes.NetQuantity, calcRes.YieldPercentApplied, calcRes.UnitCost, calcRes.SubtotalCost, ing.id)
	}

	totalHPA, costPerPortion, err := engine.CalculateRecipeTotals(calculatedSubtotals, yieldPortions)
	if err != nil {
		return err
	}

	_, err = r.txMgr.Conn(ctx).Exec(ctx, `
		UPDATE recipes
		SET total_cost_hpa = $1,
		    cost_per_portion = $2,
		    updated_at = now()
		WHERE tenant_id = $3 AND id = $4
	`, totalHPA, costPerPortion, tenantID, recipeID)
	if err != nil {
		return err
	}

	if recipeType == "FINISHED_DISH" && menuItemId != nil {
		_, _ = r.txMgr.Conn(ctx).Exec(ctx, `
			UPDATE menu_items
			SET last_calculated_hpa = $1,
			    updated_at = now()
			WHERE tenant_id = $2 AND id = $3
		`, costPerPortion, tenantID, *menuItemId)
	}

	return nil
}
