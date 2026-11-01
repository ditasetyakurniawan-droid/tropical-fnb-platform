-- +goose Up
-- +goose StatementBegin

-- 1. Kategori Bahan Baku & Inventaris
CREATE TABLE IF NOT EXISTS inventory_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_cat_code ON inventory_categories (tenant_id, code) WHERE deleted_at IS NULL;

-- 2. Master Bahan Baku (Inventory Items)
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES inventory_categories(id) ON DELETE RESTRICT,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(150) NOT NULL,
    unit VARCHAR(20) NOT NULL, -- kg, g, l, ml, pcs
    storage_type VARCHAR(30) NOT NULL DEFAULT 'DRY', -- DRY, CHILLER, FREEZER
    cost_price NUMERIC(15, 4) NOT NULL DEFAULT 0, -- Modal pembelian per unit
    current_stock NUMERIC(12, 4) NOT NULL DEFAULT 0,
    min_stock_alert NUMERIC(12, 4) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_items_code ON inventory_items (tenant_id, code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inv_items_cat ON inventory_items (tenant_id, category_id);

-- 3. Butchering Yield Test (Khusus Daging Steak House)
CREATE TABLE IF NOT EXISTS butchering_yield_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    batch_number VARCHAR(64) NOT NULL,
    test_date DATE NOT NULL DEFAULT CURRENT_DATE,
    initial_weight_kg NUMERIC(10, 4) NOT NULL, -- Berat primal cut utuh (cth: 5.000 kg)
    initial_cost_per_kg NUMERIC(15, 2) NOT NULL, -- Modal beli per kg (cth: 135.000)
    total_cost NUMERIC(15, 2) NOT NULL, -- Total modal beli batch
    usable_meat_kg NUMERIC(10, 4) NOT NULL, -- Daging bersih siap potong steak
    waste_fat_kg NUMERIC(10, 4) NOT NULL DEFAULT 0, -- Lemak & urat non-komersial
    usable_trim_kg NUMERIC(10, 4) NOT NULL DEFAULT 0, -- Daging trim untuk saus/mince
    yield_percent NUMERIC(6, 2) NOT NULL, -- (usable_meat_kg / initial_weight_kg) * 100
    effective_cost_per_kg NUMERIC(15, 2) NOT NULL, -- total_cost / usable_meat_kg (TRUE COST)
    portion_cut_grams NUMERIC(8, 2) NOT NULL DEFAULT 200, -- Standar porsi (cth: 200g)
    cost_per_portion NUMERIC(15, 2) NOT NULL, -- Modal murni daging per porsi
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_yield_outlet ON butchering_yield_tests (tenant_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_yield_item ON butchering_yield_tests (tenant_id, item_id);

-- 4. Kategori Menu
CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(100) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_cat_code ON menu_categories (tenant_id, code) WHERE deleted_at IS NULL;

-- 5. Menu Items (Produk Jual)
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    outlet_id UUID REFERENCES outlets(id) ON DELETE RESTRICT, -- NULL = Tersedia di semua resto group
    category_id UUID NOT NULL REFERENCES menu_categories(id) ON DELETE RESTRICT,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    selling_price NUMERIC(15, 2) NOT NULL,
    target_food_cost_pct NUMERIC(5, 2) NOT NULL DEFAULT 35.00, -- Target Food Cost %
    is_available BOOLEAN NOT NULL DEFAULT true,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_items_code ON menu_items (tenant_id, code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_menu_items_outlet ON menu_items (tenant_id, outlet_id);

-- 6. Resep (3-Tier BOM: Sub-Recipe / Finished Dish)
CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE, -- NULL jika ini Sub-Recipe (Tier 2)
    code VARCHAR(32) NOT NULL,
    name VARCHAR(150) NOT NULL,
    recipe_type VARCHAR(30) NOT NULL, -- 'SUB_RECIPE' (Saus/Bumbu) atau 'FINISHED_DISH' (Menu Jadi)
    yield_portions NUMERIC(10, 2) NOT NULL DEFAULT 1, -- Jumlah porsi hasil resep
    total_cost_hpa NUMERIC(15, 2) NOT NULL DEFAULT 0, -- Total HPA resep
    cost_per_portion NUMERIC(15, 2) NOT NULL DEFAULT 0, -- HPA per porsi
    instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recipes_code ON recipes (tenant_id, code) WHERE deleted_at IS NULL;

-- 7. Komponen Resep (Ingredients BOM)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE RESTRICT, -- Jika ambil dari Bahan Mentah (Tier 1)
    sub_recipe_id UUID REFERENCES recipes(id) ON DELETE RESTRICT, -- Jika ambil dari Sub-Recipe Saus (Tier 2)
    quantity NUMERIC(12, 4) NOT NULL, -- Jumlah yang dibutuhkan
    unit VARCHAR(20) NOT NULL, -- gram, ml, pcs
    unit_cost NUMERIC(15, 4) NOT NULL, -- Biaya per unit
    subtotal_cost NUMERIC(15, 2) NOT NULL, -- quantity * unit_cost
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT chk_ingredient_source CHECK (
        (inventory_item_id IS NOT NULL AND sub_recipe_id IS NULL) OR
        (inventory_item_id IS NULL AND sub_recipe_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_recipe_ing_recipe ON recipe_ingredients (tenant_id, recipe_id);

-- SEED DATA REAL UNTUK TROPICAL STEAK HOUSE & TROPICAL GARDEN RESTO
DO $$
DECLARE
    v_tenant_id UUID;
    v_steak_id UUID;
    v_garden_id UUID;

    -- Kategori Inventaris
    v_cat_meat UUID := gen_random_uuid();
    v_cat_poultry UUID := gen_random_uuid();
    v_cat_sauce UUID := gen_random_uuid();
    v_cat_side UUID := gen_random_uuid();
    v_cat_spice UUID := gen_random_uuid();

    -- Item Bahan Baku
    v_item_tenderloin UUID := gen_random_uuid();
    v_item_ribeye UUID := gen_random_uuid();
    v_item_ayam UUID := gen_random_uuid();
    v_item_gurame UUID := gen_random_uuid();
    v_item_fries UUID := gen_random_uuid();
    v_item_butter UUID := gen_random_uuid();
    v_item_cream UUID := gen_random_uuid();
    v_item_champignon UUID := gen_random_uuid();
    v_item_bbq_ready UUID := gen_random_uuid();
    v_item_madu UUID := gen_random_uuid();
    v_item_kecap_bumbu UUID := gen_random_uuid();
    v_item_sayur_lalap UUID := gen_random_uuid();

    -- Kategori Menu
    v_mcat_steak UUID := gen_random_uuid();
    v_mcat_garden UUID := gen_random_uuid();
    v_mcat_sauce UUID := gen_random_uuid();

    -- Menu Items
    v_menu_tenderloin UUID := gen_random_uuid();
    v_menu_ribeye UUID := gen_random_uuid();
    v_menu_ayam_madu UUID := gen_random_uuid();
    v_menu_gurame_terbang UUID := gen_random_uuid();

    -- Resep
    v_rec_mushroom_sauce UUID := gen_random_uuid();
    v_rec_marinasi_madu UUID := gen_random_uuid();
    v_rec_tenderloin_dish UUID := gen_random_uuid();
    v_rec_ribeye_dish UUID := gen_random_uuid();
    v_rec_ayam_madu_dish UUID := gen_random_uuid();

BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'tropical-temanggung' LIMIT 1;
    SELECT id INTO v_steak_id FROM outlets WHERE code = 'TSH-01' LIMIT 1;
    SELECT id INTO v_garden_id FROM outlets WHERE code = 'TGR-01' LIMIT 1;

    -- 1. Insert Inventory Categories
    INSERT INTO inventory_categories (id, tenant_id, code, name, description) VALUES
    (v_cat_meat, v_tenant_id, 'MEAT', 'Daging Sapi Segar & Primal Cut', 'Potongan daging impor/lokal untuk steak'),
    (v_cat_poultry, v_tenant_id, 'POULTRY', 'Unggas & Ikan Segar', 'Ayam kampung, ayam potong, dan gurame segar'),
    (v_cat_sauce, v_tenant_id, 'SAUCE_SEASONING', 'Bahan Saus & Bumbu', 'Bahan baku saus mentah dan bumbu kemasan'),
    (v_cat_side, v_tenant_id, 'SIDES', 'Pelengkap & Karbohidrat', 'Kentang, nasi, dan sayuran segar'),
    (v_cat_spice, v_tenant_id, 'SPICES', 'Rempah & Bahan Kering', 'Garam, merica hitam, kaldu, butter')
    ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING;

    -- 2. Insert Inventory Items (Bahan Baku Mentah & Saus Jadi)
    INSERT INTO inventory_items (id, tenant_id, category_id, code, name, unit, storage_type, cost_price, current_stock, min_stock_alert) VALUES
    -- Daging Primal Steak (Modal Pembelian Utuh per kg)
    (v_item_tenderloin, v_tenant_id, v_cat_meat, 'ING-BEEF-TEND', 'Australian Beef Tenderloin Whole', 'kg', 'CHILLER', 135000.0000, 25.5000, 10.0000),
    (v_item_ribeye, v_tenant_id, v_cat_meat, 'ING-BEEF-RIB', 'Beef Ribeye Primal Cut', 'kg', 'CHILLER', 140000.0000, 20.0000, 8.0000),
    -- Unggas & Ikan Garden Resto
    (v_item_ayam, v_tenant_id, v_cat_poultry, 'ING-CHICKEN', 'Ayam Segar Potong Utuh', 'kg', 'CHILLER', 35000.0000, 40.0000, 15.0000),
    (v_item_gurame, v_tenant_id, v_cat_poultry, 'ING-FISH-GUR', 'Ikan Gurame Hidup/Segar', 'kg', 'CHILLER', 44000.0000, 30.0000, 10.0000),
    -- Sides
    (v_item_fries, v_tenant_id, v_cat_side, 'ING-FRIES', 'Shoestring French Fries Frozen', 'kg', 'FREEZER', 28000.0000, 50.0000, 15.0000),
    (v_item_sayur_lalap, v_tenant_id, v_cat_side, 'ING-VEG-MIX', 'Sayuran Pelengkap & Lalapan Segar', 'porsi', 'CHILLER', 1500.0000, 200.0000, 50.0000),
    -- Bahan Saus Mentah (Olahan Dapur)
    (v_item_butter, v_tenant_id, v_cat_spice, 'ING-BUTTER', 'Unsalted Butter Premium', 'kg', 'CHILLER', 120000.0000, 10.0000, 3.0000),
    (v_item_cream, v_tenant_id, v_cat_sauce, 'ING-CREAM', 'Culinary Cooking Cream', 'liter', 'CHILLER', 65000.0000, 12.0000, 4.0000),
    (v_item_champignon, v_tenant_id, v_cat_sauce, 'ING-MUSH-CHAMP', 'Jamur Kancing Champignon', 'kg', 'CHILLER', 42000.0000, 15.0000, 5.0000),
    -- Saus Kemasan Jadi (Beli Sudah Jadi)
    (v_item_bbq_ready, v_tenant_id, v_cat_sauce, 'ING-SAUCE-BBQ-JADI', 'Saus BBQ Komersial Kemasan Jerigen', 'kg', 'DRY', 32000.0000, 35.0000, 10.0000),
    -- Bumbu Marinasi Garden Resto
    (v_item_madu, v_tenant_id, v_cat_sauce, 'ING-HONEY', 'Madu Alami Murni', 'kg', 'DRY', 70000.0000, 15.0000, 5.0000),
    (v_item_kecap_bumbu, v_tenant_id, v_cat_spice, 'ING-SOY-SPICE', 'Kecap & Rempah Racik Tradisional', 'liter', 'DRY', 30000.0000, 20.0000, 8.0000)
    ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING;

    -- 3. Insert Butchering Yield Test Nyata (Tenderloin Steak House)
    -- Primal cut 5.0 kg dibeli @ 135.000 = Modal Rp 675.000.
    -- Daging bersih siap potong = 4.1 kg (82% yield).
    -- Lemak/urat dibuang = 0.9 kg (18% waste).
    -- True Cost Daging Bersih = Rp 675.000 / 4.1 kg = Rp 164.634,15 / kg.
    -- Modal Daging Bersih per Cut 200g = Rp 32.926,83.
    INSERT INTO butchering_yield_tests (
        id, tenant_id, outlet_id, item_id, batch_number, test_date,
        initial_weight_kg, initial_cost_per_kg, total_cost,
        usable_meat_kg, waste_fat_kg, usable_trim_kg,
        yield_percent, effective_cost_per_kg, portion_cut_grams, cost_per_portion, notes
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_steak_id, v_item_tenderloin, 'BATCH-TEND-2026-001', CURRENT_DATE,
        5.0000, 135000.00, 675000.00,
        4.1000, 0.9000, 0.0000,
        82.00, 164634.15, 200.00, 32926.83,
        'Uji yield Tenderloin Aus: Trimming lemak luar dan urat perak (silverskin). HPA daging murni per 200g adalah Rp 32.927.'
    );

    -- 4. Insert Menu Categories
    INSERT INTO menu_categories (id, tenant_id, code, name, display_order) VALUES
    (v_mcat_steak, v_tenant_id, 'CAT-STEAK', 'Steak House Specialties', 1),
    (v_mcat_garden, v_tenant_id, 'CAT-GARDEN', 'Garden Resto Tradisional & Bakaran', 2),
    (v_mcat_sauce, v_tenant_id, 'CAT-SAUCE', 'Saus & Kondimen Tambahan', 3)
    ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING;

    -- 5. Insert Finished Menu Items
    -- Steak House: Australian Tenderloin 200g (Harga Jual Rp 88.000)
    INSERT INTO menu_items (id, tenant_id, outlet_id, category_id, code, name, description, selling_price, target_food_cost_pct) VALUES
    (v_menu_tenderloin, v_tenant_id, v_steak_id, v_mcat_steak, 'MENU-TSH-TEND-200', 'Australian Tenderloin Steak 200g', 'Daging sapi tenderloin empuk dengan saus jamur homemade, kentang goreng renyah, dan sayuran segar.', 88000.00, 48.00),
    (v_menu_ribeye, v_tenant_id, v_steak_id, v_mcat_steak, 'MENU-TSH-RIB-200', 'Ribeye Steak 200g with BBQ Sauce', 'Potongan ribeye berlemak gurih dengan saus BBQ spesial dan french fries.', 85000.00, 45.00),
    -- Garden Resto: Ayam Bakar Madu Spesial Gazebo (Harga Jual Rp 35.000)
    (v_menu_ayam_madu, v_tenant_id, v_garden_id, v_mcat_garden, 'MENU-TGR-AYAM-MADU', 'Ayam Bakar Madu Spesial Gazebo', 'Ayam bakar dengan bumbu marinasi madu alami khas Manding, disajikan dengan lalapan dan sambal.', 35000.00, 38.00),
    (v_menu_gurame_terbang, v_tenant_id, v_garden_id, v_mcat_garden, 'MENU-TGR-GURAME', 'Gurame Goreng Terbang Temanggung', 'Ikan gurame segar 500g digoreng garing berbentuk kipas terbang dengan sambal terasi terpisah.', 55000.00, 40.00)
    ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING;

    -- 6. Insert Sub-Recipes (Tier 2 BOM)
    -- Sub-Recipe A: Homemade Creamy Mushroom Sauce (Batch 10 Porsi @ 50ml, Total Biaya Rp 42.000 -> Rp 4.200 / porsi)
    INSERT INTO recipes (id, tenant_id, menu_item_id, code, name, recipe_type, yield_portions, total_cost_hpa, cost_per_portion, instructions) VALUES
    (v_rec_mushroom_sauce, v_tenant_id, NULL, 'SUB-REC-MUSHROOM', 'Homemade Creamy Mushroom Sauce (Batch 10 Porsi)', 'SUB_RECIPE', 10.00, 42000.00, 4200.00, 'Tumis champignon dengan butter, tuang cooking cream, bumbui garam merica hingga mengental.'),
    -- Sub-Recipe B: Bumbu Marinasi Madu Tropis (Batch 10 Porsi @ 30g, Total Biaya Rp 28.000 -> Rp 2.800 / porsi)
    (v_rec_marinasi_madu, v_tenant_id, NULL, 'SUB-REC-MADU-MARINADE', 'Bumbu Racik Marinasi Madu (Batch 10 Porsi)', 'SUB_RECIPE', 10.00, 28000.00, 2800.00, 'Campur madu murni dan rempah racik hingga homogen untuk olesan ayam bakar.')
    ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING;

    -- Komponen Sub-Recipe Mushroom: Butter (0.05 kg = Rp 6.000) + Cream (0.4 liter = Rp 26.000) + Champignon (0.24 kg = Rp 10.000) = Rp 42.000
    INSERT INTO recipe_ingredients (recipe_id, tenant_id, inventory_item_id, quantity, unit, unit_cost, subtotal_cost) VALUES
    (v_rec_mushroom_sauce, v_tenant_id, v_item_butter, 0.0500, 'kg', 120000.0000, 6000.00),
    (v_rec_mushroom_sauce, v_tenant_id, v_item_cream, 0.4000, 'liter', 65000.0000, 26000.00),
    (v_rec_mushroom_sauce, v_tenant_id, v_item_champignon, 0.2380, 'kg', 42000.0000, 10000.00);

    -- Komponen Sub-Recipe Marinasi Madu: Madu (0.25 kg = Rp 17.500) + Kecap Rempah (0.35 liter = Rp 10.500) = Rp 28.000
    INSERT INTO recipe_ingredients (recipe_id, tenant_id, inventory_item_id, quantity, unit, unit_cost, subtotal_cost) VALUES
    (v_rec_marinasi_madu, v_tenant_id, v_item_madu, 0.2500, 'kg', 70000.0000, 17500.00),
    (v_rec_marinasi_madu, v_tenant_id, v_item_kecap_bumbu, 0.3500, 'liter', 30000.0000, 10500.00);

    -- 7. Insert Finished Dish Recipes (Tier 3 BOM)
    -- Tenderloin Steak 200g:
    -- Daging True Cost (200g = Rp 32.927) + Mushroom Sub-Recipe (1 porsi = Rp 4.200) + French Fries (100g = Rp 2.800) + Sayur (Rp 1.500)
    -- Total HPA = Rp 41.427 (Jual Rp 88.000 -> Gross Margin Rp 46.573 = 52.9%)
    INSERT INTO recipes (id, tenant_id, menu_item_id, code, name, recipe_type, yield_portions, total_cost_hpa, cost_per_portion, instructions) VALUES
    (v_rec_tenderloin_dish, v_tenant_id, v_menu_tenderloin, 'REC-TENDERLOIN-200G', 'Resep Tenderloin Steak 200g Lengkap', 'FINISHED_DISH', 1.00, 41427.00, 41427.00, 'Panggang daging 200g tingkat kematangan medium, siram 50ml saus jamur, dampingi french fries & mix veggie.'),
    -- Ayam Bakar Madu:
    -- Daging Ayam 250g (Rp 8.750) + Sub-Recipe Marinasi Madu 1 porsi (Rp 2.800) + Lalapan Sambal (Rp 2.000) = HPA Rp 13.550
    -- Total HPA = Rp 13.550 (Jual Rp 35.000 -> Gross Margin Rp 21.450 = 61.3%)
    (v_rec_ayam_madu_dish, v_tenant_id, v_menu_ayam_madu, 'REC-AYAM-BAKAR-MADU', 'Resep Ayam Bakar Madu Gazebo', 'FINISHED_DISH', 1.00, 13550.00, 13550.00, 'Bakar 1/4 ayam dengan olesan bumbu madu hingga kecokelatan berkaramel, sajikan dengan lalap & sambal terasi.')
    ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING;

    -- Bahan Penyusun Tenderloin Steak Dish:
    -- 1) Daging Bersih (200g dari ING-BEEF-TEND @ effective rate Rp 164.634/kg = Rp 32.927)
    INSERT INTO recipe_ingredients (recipe_id, tenant_id, inventory_item_id, quantity, unit, unit_cost, subtotal_cost) VALUES
    (v_rec_tenderloin_dish, v_tenant_id, v_item_tenderloin, 0.2000, 'kg', 164634.1500, 32927.00),
    -- 2) French Fries (0.1 kg @ Rp 28.000/kg = Rp 2.800)
    (v_rec_tenderloin_dish, v_tenant_id, v_item_fries, 0.1000, 'kg', 28000.0000, 2800.00),
    -- 3) Sayuran (1 porsi = Rp 1.500)
    (v_rec_tenderloin_dish, v_tenant_id, v_item_sayur_lalap, 1.0000, 'porsi', 1500.0000, 1500.00);
    -- 4) Sub-Recipe Mushroom Sauce (1 porsi @ Rp 4.200)
    INSERT INTO recipe_ingredients (recipe_id, tenant_id, sub_recipe_id, quantity, unit, unit_cost, subtotal_cost) VALUES
    (v_rec_tenderloin_dish, v_tenant_id, v_rec_mushroom_sauce, 1.0000, 'porsi', 4200.0000, 4200.00);

    -- Bahan Penyusun Ayam Bakar Madu:
    -- 1) Daging Ayam 0.25 kg @ Rp 35.000/kg = Rp 8.750
    INSERT INTO recipe_ingredients (recipe_id, tenant_id, inventory_item_id, quantity, unit, unit_cost, subtotal_cost) VALUES
    (v_rec_ayam_madu_dish, v_tenant_id, v_item_ayam, 0.2500, 'kg', 35000.0000, 8750.00),
    -- 2) Lalapan Segar (1 porsi = Rp 2.000)
    (v_rec_ayam_madu_dish, v_tenant_id, v_item_sayur_lalap, 1.0000, 'porsi', 2000.0000, 2000.00);
    -- 3) Sub-Recipe Marinasi Madu (1 porsi @ Rp 2.800)
    INSERT INTO recipe_ingredients (recipe_id, tenant_id, sub_recipe_id, quantity, unit, unit_cost, subtotal_cost) VALUES
    (v_rec_ayam_madu_dish, v_tenant_id, v_rec_marinasi_madu, 1.0000, 'porsi', 2800.0000, 2800.00);

END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS recipe_ingredients CASCADE;
DROP TABLE IF EXISTS recipes CASCADE;
DROP TABLE IF EXISTS menu_items CASCADE;
DROP TABLE IF EXISTS menu_categories CASCADE;
DROP TABLE IF EXISTS butchering_yield_tests CASCADE;
DROP TABLE IF EXISTS inventory_items CASCADE;
DROP TABLE IF EXISTS inventory_categories CASCADE;
-- +goose StatementEnd
