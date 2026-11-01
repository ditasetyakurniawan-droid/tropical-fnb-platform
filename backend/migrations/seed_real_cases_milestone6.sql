-- Seed Real Cases Data for Milestone 6: Procurement, Warehouse, Opname, Transfers, Waste, and HPA
DO $$
DECLARE
    v_tenant uuid := '01a16ca4-7709-7b43-8af9-cf41da3c78d6'::uuid;
    v_steak_outlet uuid := '01a16ca4-770a-7f46-9216-79dd3612a375'::uuid;
    v_garden_outlet uuid := '01a16ca4-770c-7143-80f4-2c8ece46d467'::uuid;

    -- Warehouses
    v_wh_ck uuid := '0192a000-0001-7000-8000-000000000001'::uuid;
    v_wh_tsh uuid := '0192a000-0001-7000-8000-000000000002'::uuid;
    v_wh_tgr uuid := '0192a000-0001-7000-8000-000000000003'::uuid;

    -- Suppliers
    v_sup_meat uuid := '0192a000-0002-7000-8000-000000000001'::uuid;
    v_sup_poultry uuid := '0192a000-0002-7000-8000-000000000002'::uuid;
    v_sup_veg uuid := '0192a000-0002-7000-8000-000000000003'::uuid;
    v_sup_dairy uuid := '0192a000-0002-7000-8000-000000000004'::uuid;
    v_sup_fish uuid := '0192a000-0002-7000-8000-000000000005'::uuid;

    -- Items
    v_item_tend uuid := 'a167ecb3-bd7c-4b41-a3d7-f8fdecea6dae'::uuid;
    v_item_rib uuid := '5de9bbdc-f09c-4185-b488-958c4bc49c11'::uuid;
    v_item_chicken uuid := '0308397b-9ce8-44f1-ad7f-c2694a8e3827'::uuid;
    v_item_fish uuid := '27bf32cc-2f34-461a-b8cb-b8691827ea3b'::uuid;
    v_item_fries uuid := '418338ad-7837-4372-a0cb-8b1808ebde78'::uuid;
    v_item_butter uuid := '0564dd15-978a-4712-912e-2d1e7928e08e'::uuid;
    v_item_cream uuid := '67cbd857-c6b4-4f1c-ae7d-c806dcd58cda'::uuid;
    v_item_mush uuid := 'cc865e3f-cf31-4c6a-b95b-fad64bd63dc0'::uuid;
    v_item_honey uuid := '0522c702-1408-4f60-925a-29aaf9dd6348'::uuid;

    -- IDs for new cases
    v_po2_id uuid := '0192a000-0003-7000-8000-000000000003'::uuid;
    v_po3_id uuid := '0192a000-0003-7000-8000-000000000004'::uuid;
    v_po4_id uuid := '0192a000-0003-7000-8000-000000000005'::uuid;

    v_trf1_id uuid := '0192a000-0007-7000-8000-000000000001'::uuid;
    v_trf2_id uuid := '0192a000-0007-7000-8000-000000000002'::uuid;

    v_sop2_id uuid := '0192a000-0005-7000-8000-000000000002'::uuid;

    v_wst2_id uuid := '0192a000-0006-7000-8000-000000000002'::uuid;
    v_wst3_id uuid := '0192a000-0006-7000-8000-000000000003'::uuid;
BEGIN
    -- 1. Insert New Fish Supplier
    INSERT INTO suppliers (id, tenant_id, code, name, category, contact_person, phone, email, address, term_of_payment_days, bank_name, bank_account_number, bank_account_holder)
    VALUES
        (v_sup_fish, v_tenant, 'SUP-FISH-01', 'Kelompok Budidaya Perikanan Manding', 'SEAFOOD', 'Pak Sukro', '0812-3456-7890', 'sukro.gurame@manding.local', 'Sentra Budidaya Gurame Manding Barat, Temanggung', 3, 'BCA', '1220-456-789', 'Sukro Widodo')
    ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING;

    -- 2. Populate Stock Balances for Central Kitchen & Both Outlets
    -- Ensure butter, cream, mushroom, honey are in warehouse stock balances
    INSERT INTO stock_balances (tenant_id, warehouse_id, item_id, quantity, reserved_quantity, min_stock_alert, max_stock_capacity)
    VALUES
        (v_tenant, v_wh_ck, v_item_butter, 8.0000, 0, 2.0000, 30.0000),
        (v_tenant, v_wh_tsh, v_item_butter, 5.0000, 0, 2.0000, 15.0000),
        (v_tenant, v_wh_ck, v_item_cream, 12.0000, 0, 4.0000, 40.0000),
        (v_tenant, v_wh_tsh, v_item_cream, 15.0000, 0, 5.0000, 30.0000),
        (v_tenant, v_wh_ck, v_item_mush, 10.0000, 0, 3.0000, 30.0000),
        (v_tenant, v_wh_tsh, v_item_mush, 8.0000, 0, 2.0000, 20.0000),
        (v_tenant, v_wh_ck, v_item_honey, 10.0000, 0, 2.0000, 25.0000),
        (v_tenant, v_wh_tgr, v_item_honey, 5.0000, 0, 2.0000, 15.0000)
    ON CONFLICT (tenant_id, warehouse_id, item_id) DO UPDATE SET quantity = EXCLUDED.quantity;

    -- 3. Case A: PO-202610-002 for Central Kitchen Manding (Status: SUBMITTED - Ready for Receiving Test)
    INSERT INTO purchase_orders (id, tenant_id, outlet_id, warehouse_id, supplier_id, po_number, order_date, expected_delivery_date, status, subtotal_amount, tax_amount, total_amount, notes)
    VALUES
        (v_po2_id, v_tenant, v_steak_outlet, v_wh_ck, v_sup_meat, 'PO-202610-002', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 day', 'SUBMITTED', 7320000.00, 0, 7320000.00, 'Pengadaan stok daging impor & kentang Dieng Central Kitchen Manding untuk persiapan suplai 2 restoran')
    ON CONFLICT (tenant_id, po_number) DO NOTHING;

    INSERT INTO purchase_order_items (id, tenant_id, purchase_order_id, item_id, ordered_qty, unit, unit_price, subtotal, received_qty)
    VALUES
        (gen_random_uuid(), v_tenant, v_po2_id, v_item_tend, 20.0000, 'kg', 135000.00, 2700000.00, 0),
        (gen_random_uuid(), v_tenant, v_po2_id, v_item_rib, 25.0000, 'kg', 140000.00, 3500000.00, 0),
        (gen_random_uuid(), v_tenant, v_po2_id, v_item_fries, 40.0000, 'kg', 28000.00, 1120000.00, 0)
    ON CONFLICT DO NOTHING;

    -- 4. Case B: PO-202610-003 for Tropical Garden Resto (Status: SUBMITTED - Ikan Gurame & Ayam)
    INSERT INTO purchase_orders (id, tenant_id, outlet_id, warehouse_id, supplier_id, po_number, order_date, expected_delivery_date, status, subtotal_amount, tax_amount, total_amount, notes)
    VALUES
        (v_po3_id, v_tenant, v_garden_outlet, v_wh_tgr, v_sup_fish, 'PO-202610-003', CURRENT_DATE, CURRENT_DATE, 'SUBMITTED', 2590000.00, 0, 2590000.00, 'Restok ikan gurame hidup kolam gazebo & karkas ayam segar akhir pekan')
    ON CONFLICT (tenant_id, po_number) DO NOTHING;

    INSERT INTO purchase_order_items (id, tenant_id, purchase_order_id, item_id, ordered_qty, unit, unit_price, subtotal, received_qty)
    VALUES
        (gen_random_uuid(), v_tenant, v_po3_id, v_item_fish, 35.0000, 'kg', 44000.00, 1540000.00, 0),
        (gen_random_uuid(), v_tenant, v_po3_id, v_item_chicken, 30.0000, 'kg', 35000.00, 1050000.00, 0)
    ON CONFLICT DO NOTHING;

    -- 5. Case C: PO-202610-004 for Tropical Steak House (Status: PARTIALLY_RECEIVED)
    INSERT INTO purchase_orders (id, tenant_id, outlet_id, warehouse_id, supplier_id, po_number, order_date, expected_delivery_date, status, subtotal_amount, tax_amount, total_amount, notes)
    VALUES
        (v_po4_id, v_tenant, v_steak_outlet, v_wh_tsh, v_sup_dairy, 'PO-202610-004', CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE, 'PARTIALLY_RECEIVED', 2175000.00, 0, 2175000.00, 'Kebutuhan butter Anchor dan cooking cream untuk saus demiglace steak')
    ON CONFLICT (tenant_id, po_number) DO NOTHING;

    INSERT INTO purchase_order_items (id, tenant_id, purchase_order_id, item_id, ordered_qty, unit, unit_price, subtotal, received_qty)
    VALUES
        (gen_random_uuid(), v_tenant, v_po4_id, v_item_butter, 10.0000, 'kg', 120000.00, 1200000.00, 5.0000),
        (gen_random_uuid(), v_tenant, v_po4_id, v_item_cream, 15.0000, 'liter', 65000.00, 975000.00, 15.0000)
    ON CONFLICT DO NOTHING;

    -- 6. Goods Receipt for Cooking Cream from PO-202610-004
    INSERT INTO goods_receipts (id, tenant_id, receipt_number, purchase_order_id, supplier_id, warehouse_id, received_date, received_time, invoice_number, total_billed_amount, total_actual_amount, notes, received_by_name)
    VALUES
        (gen_random_uuid(), v_tenant, 'GR-202610-002', v_po4_id, v_sup_dairy, v_wh_tsh, CURRENT_DATE, now(), 'INV/DCS/2026/8901', 975000.00, 975000.00, 'Pengiriman tahap 1 Cooking Cream 15L diterima suhu 4°C, kemasan karton higienis utuh.', 'Agus Supriyanto')
    ON CONFLICT (tenant_id, receipt_number) DO NOTHING;

    -- 7. Inter-Warehouse Stock Transfers
    -- Transfer 1: In-Transit (Central Kitchen -> Tropical Steak House) -> User can test "Konfirmasi Terima"!
    INSERT INTO stock_transfers (id, tenant_id, transfer_number, origin_warehouse_id, destination_warehouse_id, transfer_date, status, dispatched_by_name, notes)
    VALUES
        (v_trf1_id, v_tenant, 'TRF-202610-001', v_wh_ck, v_wh_tsh, CURRENT_DATE, 'IN_TRANSIT', 'Pak Joko (Pickup Ekspedisi Internal)', 'Distribusi porsi steak harian siap grill dari Central Kitchen ke Steak House')
    ON CONFLICT (tenant_id, transfer_number) DO NOTHING;

    INSERT INTO stock_transfer_items (tenant_id, transfer_id, item_id, requested_qty, dispatched_qty, received_qty, unit)
    VALUES
        (v_tenant, v_trf1_id, v_item_tend, 15.0000, 15.0000, 0, 'kg'),
        (v_tenant, v_trf1_id, v_item_fries, 20.0000, 20.0000, 0, 'kg'),
        (v_tenant, v_trf1_id, v_item_mush, 5.0000, 5.0000, 0, 'kg')
    ON CONFLICT DO NOTHING;

    -- Transfer 2: Received (Central Kitchen -> Tropical Garden Resto)
    INSERT INTO stock_transfers (id, tenant_id, transfer_number, origin_warehouse_id, destination_warehouse_id, transfer_date, status, dispatched_by_name, received_by_name, notes)
    VALUES
        (v_trf2_id, v_tenant, 'TRF-202610-002', v_wh_ck, v_wh_tgr, CURRENT_DATE - INTERVAL '1 day', 'RECEIVED', 'Pak Joko', 'Siti Rahmawati (Kepala Dapur)', 'Stok bumbu marinasi madu dan ayam potong karkas untuk area gazebo')
    ON CONFLICT (tenant_id, transfer_number) DO NOTHING;

    INSERT INTO stock_transfer_items (tenant_id, transfer_id, item_id, requested_qty, dispatched_qty, received_qty, unit)
    VALUES
        (v_tenant, v_trf2_id, v_item_chicken, 10.0000, 10.0000, 10.0000, 'kg'),
        (v_tenant, v_trf2_id, v_item_honey, 5.0000, 5.0000, 5.0000, 'kg')
    ON CONFLICT DO NOTHING;

    -- 8. Active Stock Opname Session (Status: DRAFT in Chiller Steak House)
    INSERT INTO stock_opnames (id, tenant_id, opname_number, warehouse_id, opname_date, status, conducted_by_name, notes)
    VALUES
        (v_sop2_id, v_tenant, 'SOP-202610-002', v_wh_tsh, CURRENT_DATE, 'DRAFT', 'Rian Pratama & Tim Cook Dapur', 'Sesi Stock Opname Aktif Chiller Steak House (Siap Uji Blind vs Manager View)')
    ON CONFLICT (tenant_id, opname_number) DO NOTHING;

    INSERT INTO stock_opname_items (tenant_id, stock_opname_id, item_id, system_theoretical_qty, physical_counted_qty, variance_qty, unit_cost, variance_cost, variance_category, notes)
    VALUES
        (v_tenant, v_sop2_id, v_item_tend, 10.5000, 10.2000, -0.3000, 135000.00, -40500.00, 'PORTIONING_VARIANCE', 'Susut wajar trimming lemak tipis saat portioning steak'),
        (v_tenant, v_sop2_id, v_item_rib, 8.0000, 7.8000, -0.2000, 140000.00, -28000.00, 'PORTIONING_VARIANCE', 'Susut pemotongan porsi 200g ribeye'),
        (v_tenant, v_sop2_id, v_item_fries, 20.0000, 20.0000, 0.0000, 28000.00, 0.00, 'NORMAL', 'Fisik cocok 100% kemasan frozen pack'),
        (v_tenant, v_sop2_id, v_item_butter, 5.0000, 4.9000, -0.1000, 120000.00, -12000.00, 'NORMAL', 'Pemakaian olesan grill harian'),
        (v_tenant, v_sop2_id, v_item_mush, 8.0000, 7.5000, -0.5000, 42000.00, -21000.00, 'NORMAL', 'Susut pengeringan jamur champignon chiller')
    ON CONFLICT DO NOTHING;

    -- 9. Real Waste Records
    -- Steak House: Overcooked Ribeye Steak
    INSERT INTO waste_records (id, tenant_id, outlet_id, warehouse_id, waste_number, waste_date, category, total_cost, recorded_by_name, notes)
    VALUES
        (v_wst2_id, v_tenant, v_steak_outlet, v_wh_tsh, 'WST-202610-002', CURRENT_DATE, 'COOKING_MISTAKE', 70000.00, 'Chef Hendra Kusuma', '1 porsi Ribeye overcooked hangus saat jam makan malam sibuk akhir pekan')
    ON CONFLICT (tenant_id, waste_number) DO NOTHING;

    INSERT INTO waste_record_items (tenant_id, waste_record_id, item_id, quantity, unit, unit_cost, subtotal_cost, notes)
    VALUES
        (v_tenant, v_wst2_id, v_item_rib, 0.5000, 'kg', 140000.00, 70000.00, '1 cut porsi hangus')
    ON CONFLICT DO NOTHING;

    -- Garden Resto: 2 kg Gurame lemas/mati di kolam
    INSERT INTO waste_records (id, tenant_id, outlet_id, warehouse_id, waste_number, waste_date, category, total_cost, recorded_by_name, notes)
    VALUES
        (v_wst3_id, v_tenant, v_garden_outlet, v_wh_tgr, 'WST-202610-003', CURRENT_DATE, 'SPOILAGE_EXPIRED', 88000.00, 'Siti Rahmawati', '2 kg Ikan Gurame lemas dan mati di kolam penampungan air manding karena pompa oksigen drop')
    ON CONFLICT (tenant_id, waste_number) DO NOTHING;

    INSERT INTO waste_record_items (tenant_id, waste_record_id, item_id, quantity, unit, unit_cost, subtotal_cost, notes)
    VALUES
        (v_tenant, v_wst3_id, v_item_fish, 2.0000, 'kg', 44000.00, 88000.00, '4 ekor ikan gurame @ 500g')
    ON CONFLICT DO NOTHING;

    -- 10. Update Menu HPA & Early Warning Alert Demonstration
    -- Ribeye Steak: Manual Target = Rp 42.000, tapi Dynamic BOM Riil = Rp 44.800 (deviasi +6.67% > 5%) -> triggers alert badge!
    UPDATE menu_items
       SET hpa_calculation_mode = 'MANUAL_OVERRIDE',
           manual_hpa = 42000.00,
           last_calculated_hpa = 44800.00
     WHERE code = 'MENU-TSH-RIB-200';

    -- Australian Tenderloin Steak: Dynamic BOM Mode (HPA Rp 41.427, Harga Rp 88.000, Food Cost 47.1% - Sehat)
    UPDATE menu_items
       SET hpa_calculation_mode = 'DYNAMIC_BOM',
           manual_hpa = 52000.00,
           last_calculated_hpa = 41427.00
     WHERE code = 'MENU-TSH-TEND-200';

    -- Gurame Terbang: Dynamic BOM
    UPDATE menu_items
       SET hpa_calculation_mode = 'DYNAMIC_BOM',
           manual_hpa = 25000.00,
           last_calculated_hpa = 24000.00
     WHERE code = 'MENU-TGR-GURAME';

    -- Ayam Bakar Madu: Dynamic BOM
    UPDATE menu_items
       SET hpa_calculation_mode = 'DYNAMIC_BOM',
           manual_hpa = 15000.00,
           last_calculated_hpa = 13550.00
     WHERE code = 'MENU-TGR-AYAM-MADU';

END $$;
