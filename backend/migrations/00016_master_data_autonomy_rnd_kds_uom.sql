-- +goose Up
-- +goose StatementBegin

-- 1. Extend menu_items for R&D Lifecycle (DRAFT vs PUBLISHED), Menu Type (FOOD/SNACK/BEVERAGE), and explicit KDS Station Routing
ALTER TABLE menu_items
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN IF NOT EXISTS menu_type VARCHAR(20) NOT NULL DEFAULT 'FOOD',
    ADD COLUMN IF NOT EXISTS kitchen_station VARCHAR(30) DEFAULT NULL;

ALTER TABLE menu_items
    ADD CONSTRAINT chk_menu_items_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    ADD CONSTRAINT chk_menu_items_menu_type CHECK (menu_type IN ('FOOD', 'SNACK', 'BEVERAGE')),
    ADD CONSTRAINT chk_menu_items_kitchen_station CHECK (
        kitchen_station IS NULL OR kitchen_station IN (
            'GRILL_STEAK',
            'SIDES_PANTRY',
            'BEVERAGE_BAR',
            'BAKARAN_GORENG',
            'DAPUR_NUSANTARA',
            'BAR_TRADISIONAL',
            'EXPEDITER',
            'NONE'
        )
    );

-- Backfill existing seeded menu_items with explicit menu_type and kitchen_station
UPDATE menu_items m
SET menu_type = CASE
        WHEN mc.code IN ('CAT-TSH-BAR', 'CAT-TGR-BAR') THEN 'BEVERAGE'
        WHEN mc.code IN ('CAT-SAUCE') THEN 'SNACK'
        ELSE 'FOOD'
    END,
    kitchen_station = CASE
        WHEN mc.code = 'CAT-STEAK' THEN 'GRILL_STEAK'
        WHEN mc.code = 'CAT-SAUCE' THEN 'SIDES_PANTRY'
        WHEN mc.code = 'CAT-TSH-BAR' THEN 'BEVERAGE_BAR'
        WHEN mc.code = 'CAT-GARDEN' THEN 'BAKARAN_GORENG'
        WHEN mc.code = 'CAT-TGR-BAR' THEN 'BAR_TRADISIONAL'
        WHEN EXISTS (SELECT 1 FROM outlets o WHERE o.id = m.outlet_id AND o.code = 'TSH-01') THEN 'GRILL_STEAK'
        ELSE 'DAPUR_NUSANTARA'
    END
FROM menu_categories mc
WHERE m.category_id = mc.id
  AND m.kitchen_station IS NULL;

-- 2. Extend inventory_items with human-friendly Purchase Pack -> Base UoM metadata
ALTER TABLE inventory_items
    ADD COLUMN IF NOT EXISTS purchase_unit VARCHAR(30) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS purchase_pack_qty NUMERIC(12, 4) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS purchase_pack_price NUMERIC(15, 2) DEFAULT NULL;

ALTER TABLE inventory_items
    ADD CONSTRAINT chk_inv_purchase_pack_qty CHECK (purchase_pack_qty IS NULL OR purchase_pack_qty > 0),
    ADD CONSTRAINT chk_inv_purchase_pack_price CHECK (purchase_pack_price IS NULL OR purchase_pack_price >= 0);

-- 3. Register recipe.costing.manage permission & seed global Master Chef R&D account (master_chef)
INSERT INTO permissions (code, module, description)
VALUES ('recipe.costing.manage', 'recipe_hpp', 'Mengelola master menu, riset R&D BOM, sub-recipe, dan bahan baku')
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
    v_tenant_id   uuid;
    v_role_owner  uuid;
    v_role_mgr    uuid;
    v_role_chef   uuid;
    v_user_chef   uuid;
    v_pass_hash   text := '$2b$10$2DB6wqO1NnBGR2RLi8JeouoaP4Eeeh7kEdXqFNbqZRFG/dUb6/JUO'; -- Password123!
BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'tropical-temanggung' AND deleted_at IS NULL LIMIT 1;

    IF v_tenant_id IS NOT NULL THEN
        SELECT id INTO v_role_owner FROM roles WHERE tenant_id = v_tenant_id AND code = 'OWNER' LIMIT 1;
        SELECT id INTO v_role_mgr   FROM roles WHERE tenant_id = v_tenant_id AND code = 'OUTLET_MANAGER' LIMIT 1;
        SELECT id INTO v_role_chef  FROM roles WHERE tenant_id = v_tenant_id AND code = 'KITCHEN_CHEF' LIMIT 1;

        IF v_role_owner IS NOT NULL THEN
            INSERT INTO role_permissions (role_id, permission_code)
            VALUES (v_role_owner, 'recipe.costing.manage')
            ON CONFLICT DO NOTHING;
        END IF;

        IF v_role_mgr IS NOT NULL THEN
            INSERT INTO role_permissions (role_id, permission_code)
            VALUES
                (v_role_mgr, 'recipe.costing.view'),
                (v_role_mgr, 'recipe.costing.manage')
            ON CONFLICT DO NOTHING;
        END IF;

        IF v_role_chef IS NOT NULL THEN
            INSERT INTO role_permissions (role_id, permission_code)
            VALUES
                (v_role_chef, 'recipe.costing.view'),
                (v_role_chef, 'recipe.costing.manage'),
                (v_role_chef, 'inventory.stock.view'),
                (v_role_chef, 'inventory.warehouse.view'),
                (v_role_chef, 'inventory.waste.manage')
            ON CONFLICT DO NOTHING;

            -- Seed Master Chef R&D User (Global access across TSH-01 & TGR-01 for Menu R&D & Kitchen KDS)
            INSERT INTO users (tenant_id, username, full_name, email, password_hash, is_active)
            VALUES (
                v_tenant_id,
                'master_chef',
                'Chef Hendro Wijaya (Master Chef R&D)',
                'chef@tropicalfnb.local',
                v_pass_hash,
                true
            )
            ON CONFLICT (tenant_id, username) WHERE deleted_at IS NULL DO UPDATE SET full_name = EXCLUDED.full_name
            RETURNING id INTO v_user_chef;

            IF v_user_chef IS NOT NULL THEN
                INSERT INTO user_role_assignments (tenant_id, user_id, role_id, outlet_id)
                VALUES (v_tenant_id, v_user_chef, v_role_chef, NULL)
                ON CONFLICT DO NOTHING;
            END IF;
        END IF;
    END IF;
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DELETE FROM user_role_assignments WHERE user_id IN (SELECT id FROM users WHERE username = 'master_chef');
DELETE FROM users WHERE username = 'master_chef';
DELETE FROM role_permissions WHERE permission_code = 'recipe.costing.manage';
DELETE FROM permissions WHERE code = 'recipe.costing.manage';

ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS chk_inv_purchase_pack_price;
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS chk_inv_purchase_pack_qty;
ALTER TABLE inventory_items
    DROP COLUMN IF EXISTS purchase_pack_price,
    DROP COLUMN IF EXISTS purchase_pack_qty,
    DROP COLUMN IF EXISTS purchase_unit;

ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS chk_menu_items_kitchen_station;
ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS chk_menu_items_menu_type;
ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS chk_menu_items_status;
ALTER TABLE menu_items
    DROP COLUMN IF EXISTS kitchen_station,
    DROP COLUMN IF EXISTS menu_type,
    DROP COLUMN IF EXISTS status;

-- +goose StatementEnd
