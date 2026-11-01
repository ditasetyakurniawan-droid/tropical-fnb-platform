-- +goose Up
-- +goose StatementBegin

-- 1. Extend inventory_items with standard yield, output conversion ratio, and effective cost
ALTER TABLE inventory_items
    ADD COLUMN IF NOT EXISTS standard_yield_percent NUMERIC(6, 2) NOT NULL DEFAULT 100.00,
    ADD COLUMN IF NOT EXISTS yield_output_unit VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS yield_conversion_ratio NUMERIC(12, 4) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS effective_cost_per_unit NUMERIC(15, 4) NOT NULL DEFAULT 0.0000;

ALTER TABLE inventory_items
    ADD CONSTRAINT chk_inv_standard_yield CHECK (standard_yield_percent > 0),
    ADD CONSTRAINT chk_inv_yield_ratio CHECK (yield_conversion_ratio IS NULL OR yield_conversion_ratio > 0);

-- Populate effective_cost_per_unit for existing items
UPDATE inventory_items
SET effective_cost_per_unit = cost_price
WHERE effective_cost_per_unit = 0;

-- Calibrate Tenderloin & Ribeye standard yields
UPDATE inventory_items
SET standard_yield_percent = 82.00,
    effective_cost_per_unit = ROUND(cost_price / 0.82, 4)
WHERE code = 'ING-BEEF-TEND';

UPDATE inventory_items
SET standard_yield_percent = 80.00,
    effective_cost_per_unit = ROUND(cost_price / 0.80, 4)
WHERE code = 'ING-BEEF-RIB';

-- 2. Extend recipes with yield_unit and positive portions constraint
ALTER TABLE recipes
    ADD COLUMN IF NOT EXISTS yield_unit VARCHAR(20) NOT NULL DEFAULT 'porsi';

ALTER TABLE recipes
    ADD CONSTRAINT chk_recipe_yield_positive CHECK (yield_portions > 0);

-- 3. Extend recipe_ingredients with cost_basis, gross/net quantity, and applied yield percent
ALTER TABLE recipe_ingredients
    ADD COLUMN IF NOT EXISTS cost_basis VARCHAR(20) NOT NULL DEFAULT 'EP_YIELDED',
    ADD COLUMN IF NOT EXISTS gross_quantity NUMERIC(12, 4),
    ADD COLUMN IF NOT EXISTS net_quantity NUMERIC(12, 4),
    ADD COLUMN IF NOT EXISTS yield_percent_applied NUMERIC(6, 2) NOT NULL DEFAULT 100.00;

ALTER TABLE recipe_ingredients
    ADD CONSTRAINT chk_recipe_ing_cost_basis CHECK (cost_basis IN ('AP_RAW', 'EP_YIELDED')),
    ADD CONSTRAINT chk_recipe_ing_yield_percent CHECK (yield_percent_applied > 0);

-- Populate gross_quantity and net_quantity for existing recipe ingredients
UPDATE recipe_ingredients
SET net_quantity = quantity,
    gross_quantity = quantity,
    yield_percent_applied = 100.00,
    cost_basis = 'EP_YIELDED'
WHERE net_quantity IS NULL;

-- Calibrate Tenderloin in recipe: 200g net edible portion @ 82% yield
UPDATE recipe_ingredients ri
SET cost_basis = 'EP_YIELDED',
    net_quantity = 0.2000,
    yield_percent_applied = 82.00,
    gross_quantity = ROUND(0.2000 / 0.82, 4),
    unit_cost = 164634.1500,
    subtotal_cost = 32927.00
FROM inventory_items ii
WHERE ri.inventory_item_id = ii.id AND ii.code = 'ING-BEEF-TEND';

-- Calibrate Ribeye in recipe: 200g net edible portion @ 80% yield
UPDATE recipe_ingredients ri
SET cost_basis = 'EP_YIELDED',
    net_quantity = 0.2000,
    yield_percent_applied = 80.00,
    gross_quantity = ROUND(0.2000 / 0.80, 4),
    unit_cost = 175000.0000,
    subtotal_cost = 35000.00
FROM inventory_items ii
WHERE ri.inventory_item_id = ii.id AND ii.code = 'ING-BEEF-RIB';

-- Calibrate Gurame in recipe: AP_RAW 500g gross whole fish
UPDATE recipe_ingredients ri
SET cost_basis = 'AP_RAW',
    net_quantity = 0.5000,
    gross_quantity = 0.5000,
    yield_percent_applied = 100.00,
    unit_cost = 44000.0000,
    subtotal_cost = 22000.00
FROM inventory_items ii
WHERE ri.inventory_item_id = ii.id AND ii.code = 'ING-FISH-GUR';

-- 4. Extend butchering_yield_tests to Universal F&B Yield Tests
ALTER TABLE butchering_yield_tests
    ADD COLUMN IF NOT EXISTS test_type VARCHAR(30) NOT NULL DEFAULT 'MEAT_BUTCHERING',
    ADD COLUMN IF NOT EXISTS output_unit VARCHAR(20) NOT NULL DEFAULT 'kg',
    ADD COLUMN IF NOT EXISTS output_quantity NUMERIC(10, 4);

ALTER TABLE butchering_yield_tests
    ADD CONSTRAINT chk_yield_test_type CHECK (test_type IN ('MEAT_BUTCHERING', 'POULTRY_FISH', 'PRODUCE_JUICE', 'GENERAL_YIELD'));

UPDATE butchering_yield_tests
SET output_quantity = usable_meat_kg,
    output_unit = 'kg',
    test_type = 'MEAT_BUTCHERING'
WHERE output_quantity IS NULL;

-- 5. Link menu_items last_calculated_hpa to recipe cost_per_portion
UPDATE menu_items mi
SET last_calculated_hpa = r.cost_per_portion
FROM recipes r
WHERE r.menu_item_id = mi.id
  AND mi.hpa_calculation_mode = 'DYNAMIC_BOM'
  AND (mi.last_calculated_hpa IS NULL OR mi.last_calculated_hpa = 0);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE butchering_yield_tests DROP CONSTRAINT IF EXISTS chk_yield_test_type;
ALTER TABLE butchering_yield_tests
    DROP COLUMN IF EXISTS output_quantity,
    DROP COLUMN IF EXISTS output_unit,
    DROP COLUMN IF EXISTS test_type;

ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS chk_recipe_ing_yield_percent;
ALTER TABLE recipe_ingredients DROP CONSTRAINT IF EXISTS chk_recipe_ing_cost_basis;
ALTER TABLE recipe_ingredients
    DROP COLUMN IF EXISTS yield_percent_applied,
    DROP COLUMN IF EXISTS net_quantity,
    DROP COLUMN IF EXISTS gross_quantity,
    DROP COLUMN IF EXISTS cost_basis;

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS chk_recipe_yield_positive;
ALTER TABLE recipes DROP COLUMN IF EXISTS yield_unit;

ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS chk_inv_yield_ratio;
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS chk_inv_standard_yield;
ALTER TABLE inventory_items
    DROP COLUMN IF EXISTS effective_cost_per_unit,
    DROP COLUMN IF EXISTS yield_conversion_ratio,
    DROP COLUMN IF EXISTS yield_output_unit,
    DROP COLUMN IF EXISTS standard_yield_percent;

-- +goose StatementEnd
