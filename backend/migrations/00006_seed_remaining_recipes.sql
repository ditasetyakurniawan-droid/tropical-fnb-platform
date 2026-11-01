-- +goose Up
-- +goose StatementBegin
DO $$
DECLARE
    v_tenant_id UUID;
    v_menu_ribeye UUID;
    v_menu_gurame UUID;
    v_item_ribeye UUID;
    v_item_gurame UUID;
    v_item_sauce_bbq UUID;
    v_item_fries UUID;
    v_item_sayur_lalap UUID;

    v_rec_ribeye UUID := 'e1011111-2222-3333-4444-555555555501';
    v_rec_gurame UUID := 'e2022222-3333-4444-5555-666666666602';
BEGIN
    SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
    SELECT id INTO v_menu_ribeye FROM menu_items WHERE code = 'MENU-TSH-RIB-200' LIMIT 1;
    SELECT id INTO v_menu_gurame FROM menu_items WHERE code = 'MENU-TGR-GURAME' LIMIT 1;
    SELECT id INTO v_item_ribeye FROM inventory_items WHERE code = 'ING-BEEF-RIB' LIMIT 1;
    SELECT id INTO v_item_gurame FROM inventory_items WHERE code = 'ING-FISH-GUR' LIMIT 1;
    SELECT id INTO v_item_sauce_bbq FROM inventory_items WHERE code = 'ING-SAUCE-BBQ-JADI' LIMIT 1;
    SELECT id INTO v_item_fries FROM inventory_items WHERE code = 'ING-FRIES' LIMIT 1;
    SELECT id INTO v_item_sayur_lalap FROM inventory_items WHERE code = 'ING-VEG-MIX' LIMIT 1;

    -- 1. Recipe for Ribeye Steak 200g with BBQ Sauce
    IF v_menu_ribeye IS NOT NULL THEN
        INSERT INTO recipes (id, tenant_id, menu_item_id, code, name, recipe_type, yield_portions, total_cost_hpa, cost_per_portion, instructions)
        VALUES (
            v_rec_ribeye,
            v_tenant_id,
            v_menu_ribeye,
            'REC-RIBEYE-200G',
            'Resep Ribeye Steak 200g BBQ Spesial',
            'FINISHED_DISH',
            1.00,
            39720.00,
            39720.00,
            'Panggang Ribeye 200g medium-well, glazes dengan BBQ sauce spesial, sajikan dengan kentang goreng renyah.'
        )
        ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING;

        -- Bahan Ribeye: Daging Ribeye 200g (Rp 35.000) + BBQ Sauce 60g (Rp 1.920) + Fries 100g (Rp 2.800)
        INSERT INTO recipe_ingredients (recipe_id, tenant_id, inventory_item_id, quantity, unit, unit_cost, subtotal_cost)
        VALUES
        (v_rec_ribeye, v_tenant_id, v_item_ribeye, 0.2000, 'kg', 175000.0000, 35000.00),
        (v_rec_ribeye, v_tenant_id, v_item_sauce_bbq, 0.0600, 'kg', 32000.0000, 1920.00),
        (v_rec_ribeye, v_tenant_id, v_item_fries, 0.1000, 'kg', 28000.0000, 2800.00)
        ON CONFLICT DO NOTHING;
    END IF;

    -- 2. Recipe for Gurame Goreng Terbang Temanggung
    IF v_menu_gurame IS NOT NULL THEN
        INSERT INTO recipes (id, tenant_id, menu_item_id, code, name, recipe_type, yield_portions, total_cost_hpa, cost_per_portion, instructions)
        VALUES (
            v_rec_gurame,
            v_tenant_id,
            v_menu_gurame,
            'REC-GURAME-TERBANG',
            'Resep Gurame Goreng Terbang Khas Temanggung',
            'FINISHED_DISH',
            1.00,
            24000.00,
            24000.00,
            'Fillet badan ikan gurame 500g model kipas mekar, balur bumbu racik, goreng deep-fry hingga keemasan, sajikan dengan sambal terasi & lalapan.'
        )
        ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING;

        -- Bahan Gurame: Ikan Gurame 0.5kg (Rp 22.000) + Lalapan & Sambal (Rp 2.000)
        INSERT INTO recipe_ingredients (recipe_id, tenant_id, inventory_item_id, quantity, unit, unit_cost, subtotal_cost)
        VALUES
        (v_rec_gurame, v_tenant_id, v_item_gurame, 0.5000, 'kg', 44000.0000, 22000.00),
        (v_rec_gurame, v_tenant_id, v_item_sayur_lalap, 1.0000, 'porsi', 2000.0000, 2000.00)
        ON CONFLICT DO NOTHING;
    END IF;

END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM recipe_ingredients WHERE recipe_id IN ('e1011111-2222-3333-4444-555555555501', 'e2022222-3333-4444-5555-666666666602');
DELETE FROM recipes WHERE id IN ('e1011111-2222-3333-4444-555555555501', 'e2022222-3333-4444-5555-666666666602');
-- +goose StatementEnd
