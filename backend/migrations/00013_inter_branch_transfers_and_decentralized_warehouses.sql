-- +goose Up
-- ============================================================================
-- MILESTONE 10: Peer-to-Peer Inter-Branch Stock Transfers & Decentralized Warehouses
-- ============================================================================

-- 1. Ensure all existing warehouses have an owning outlet (Decentralized Model)
-- Reassign any legacy Central Kitchen warehouse to Tropical Steak House as secondary dry storage
-- +goose StatementBegin
DO $$
DECLARE
    v_steak_outlet UUID;
    v_garden_outlet UUID;
    v_tenant_id UUID;
    v_wh_ck UUID := '0192a000-0001-7000-8000-000000000001';
    v_wh_tgr2 UUID := '0192a000-0001-7000-8000-000000000004';
BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'tropical-temanggung';
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'Tenant tropical-temanggung not found, skipping';
        RETURN;
    END IF;

    SELECT id INTO v_steak_outlet FROM outlets WHERE tenant_id = v_tenant_id AND code = 'TSH-01';
    SELECT id INTO v_garden_outlet FROM outlets WHERE tenant_id = v_tenant_id AND code = 'TGR-01';

    -- Reassign WH-CK-01 to Tropical Steak House as WH-TSH-02 (Gudang Kering & Bumbu Steak)
    UPDATE warehouses
       SET outlet_id = v_steak_outlet,
           code = 'WH-TSH-02',
           name = 'Gudang Kering & Marinasi Steak House',
           warehouse_type = 'DRY_STORAGE',
           updated_at = now()
     WHERE id = v_wh_ck;

    -- Also update any warehouse with NULL outlet_id to v_steak_outlet
    UPDATE warehouses
       SET outlet_id = v_steak_outlet
     WHERE outlet_id IS NULL;

    -- Insert secondary dry storage for Tropical Garden Resto if not exists
    INSERT INTO warehouses (id, tenant_id, outlet_id, code, name, warehouse_type, address, pic_name)
    VALUES (
        v_wh_tgr2, v_tenant_id, v_garden_outlet, 'WH-TGR-02',
        'Gudang Kering & Bumbu Nusantara Garden Resto', 'DRY_STORAGE',
        'Area Logistik Kering Tropical Garden Resto', 'Ahmad Fadillah'
    )
    ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING;
END $$;
-- +goose StatementEnd

-- Enforce strict decentralized ownership: every warehouse MUST belong to a restaurant outlet
ALTER TABLE warehouses ALTER COLUMN outlet_id SET NOT NULL;

-- 2. Enhance stock_transfers with Inter-Branch & Intra-Branch routing
ALTER TABLE stock_transfers
    ADD COLUMN IF NOT EXISTS origin_outlet_id UUID REFERENCES outlets(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS destination_outlet_id UUID REFERENCES outlets(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS transfer_type VARCHAR(30) NOT NULL DEFAULT 'INTER_BRANCH', -- INTER_BRANCH, INTRA_BRANCH
    ADD COLUMN IF NOT EXISTS waybill_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Backfill outlet references from warehouses
UPDATE stock_transfers st
   SET origin_outlet_id = ow.outlet_id,
       destination_outlet_id = dw.outlet_id,
       transfer_type = CASE WHEN ow.outlet_id = dw.outlet_id THEN 'INTRA_BRANCH' ELSE 'INTER_BRANCH' END,
       waybill_number = COALESCE(st.waybill_number, 'SJ-' || st.transfer_number),
       dispatched_at = CASE WHEN st.status IN ('IN_TRANSIT', 'RECEIVED') THEN st.created_at ELSE NULL END,
       received_at = CASE WHEN st.status = 'RECEIVED' THEN st.updated_at ELSE NULL END
  FROM warehouses ow, warehouses dw
 WHERE st.origin_warehouse_id = ow.id
   AND st.destination_warehouse_id = dw.id;

-- Make outlet IDs NOT NULL now that existing rows have been backfilled
ALTER TABLE stock_transfers ALTER COLUMN origin_outlet_id SET NOT NULL;
ALTER TABLE stock_transfers ALTER COLUMN destination_outlet_id SET NOT NULL;

-- Indexes for lightning fast multi-outlet filtering
CREATE INDEX IF NOT EXISTS idx_st_origin_outlet ON stock_transfers (tenant_id, origin_outlet_id);
CREATE INDEX IF NOT EXISTS idx_st_dest_outlet ON stock_transfers (tenant_id, destination_outlet_id);
CREATE INDEX IF NOT EXISTS idx_st_transfer_type ON stock_transfers (tenant_id, transfer_type);
CREATE INDEX IF NOT EXISTS idx_st_waybill ON stock_transfers (tenant_id, waybill_number);

-- 3. Enhance stock_transfer_items with physical reconciliation (Variance in Transit)
ALTER TABLE stock_transfer_items
    ADD COLUMN IF NOT EXISTS variance_qty NUMERIC(12, 4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS variance_reason VARCHAR(255),
    ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- Update existing items so variance_qty = dispatched_qty - received_qty when received
UPDATE stock_transfer_items
   SET variance_qty = GREATEST(0, dispatched_qty - received_qty)
 WHERE received_qty > 0 AND dispatched_qty > received_qty;

-- 4. Seed Real Cases of Peer-to-Peer Inter-Branch & Intra-Branch Transfers
-- +goose StatementBegin
DO $$
DECLARE
    v_tenant_id UUID;
    v_steak_outlet UUID;
    v_garden_outlet UUID;
    v_wh_tsh1 UUID := '0192a000-0001-7000-8000-000000000002'; -- Chiller Steak
    v_wh_tsh2 UUID := '0192a000-0001-7000-8000-000000000001'; -- Gudang Kering Steak
    v_wh_tgr1 UUID := '0192a000-0001-7000-8000-000000000003'; -- Gudang & Kolam Garden
    v_wh_tgr2 UUID := '0192a000-0001-7000-8000-000000000004'; -- Gudang Kering Garden
    v_trf_id1 UUID := gen_random_uuid();
    v_trf_id2 UUID := gen_random_uuid();
    v_trf_id3 UUID := gen_random_uuid();
    v_item_mush UUID;
    v_item_fries UUID;
    v_item_tend UUID;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'tropical-temanggung';
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'Tenant tropical-temanggung not found, skipping seed';
        RETURN;
    END IF;

    SELECT id INTO v_steak_outlet FROM outlets WHERE tenant_id = v_tenant_id AND code = 'TSH-01';
    SELECT id INTO v_garden_outlet FROM outlets WHERE tenant_id = v_tenant_id AND code = 'TGR-01';

    SELECT id INTO v_item_mush FROM inventory_items WHERE code = 'ING-MUSH-CHAMP' LIMIT 1;
    SELECT id INTO v_item_fries FROM inventory_items WHERE code = 'ING-POTATO-FRIES' LIMIT 1;
    SELECT id INTO v_item_tend FROM inventory_items WHERE code = 'ING-BEEF-TEND' LIMIT 1;

    -- Case 1: Inter-Branch Transfer (TSH-01 -> TGR-01) - COMPLETED with minor variance loss
    INSERT INTO stock_transfers (
        id, tenant_id, transfer_number, waybill_number,
        origin_outlet_id, origin_warehouse_id,
        destination_outlet_id, destination_warehouse_id,
        transfer_date, transfer_type, status,
        dispatched_by_name, received_by_name,
        dispatched_at, received_at, notes
    ) VALUES (
        v_trf_id1, v_tenant_id, 'TRF-BR-202610-001', 'SJ-TSH-202610-001',
        v_steak_outlet, v_wh_tsh2,
        v_garden_outlet, v_wh_tgr1,
        CURRENT_DATE - INTERVAL '1 day', 'INTER_BRANCH', 'RECEIVED',
        'Agus Supriyanto (Head Kitchen Steak)', 'Siti Rahmawati (Supervisor Garden)',
        now() - INTERVAL '26 hours', now() - INTERVAL '24 hours',
        'Bantuan pasokan kentang beku impor untuk acara gathering komunitas di Gazebo Garden'
    ) ON CONFLICT (tenant_id, transfer_number) DO NOTHING;

    IF v_item_fries IS NOT NULL THEN
        INSERT INTO stock_transfer_items (
            tenant_id, transfer_id, item_id, requested_qty, dispatched_qty, received_qty,
            variance_qty, variance_reason, unit, unit_cost, notes
        ) VALUES (
            v_tenant_id, v_trf_id1, v_item_fries, 10.0000, 10.0000, 9.8000,
            0.2000, 'Susut timbangan kemasan es mencair saat transit antar resto', 'KG', 32000.00,
            'Satu pack ujungnya bocor mencair, 9.8kg kondisi prima masuk freezer resto garden'
        ) ON CONFLICT DO NOTHING;
    END IF;

    -- Case 2: Inter-Branch Transfer (TGR-01 -> TSH-01) - IN_TRANSIT (Sedang diantar antar-resto)
    INSERT INTO stock_transfers (
        id, tenant_id, transfer_number, waybill_number,
        origin_outlet_id, origin_warehouse_id,
        destination_outlet_id, destination_warehouse_id,
        transfer_date, transfer_type, status,
        dispatched_by_name,
        dispatched_at, notes
    ) VALUES (
        v_trf_id2, v_tenant_id, 'TRF-BR-202610-002', 'SJ-TGR-202610-002',
        v_garden_outlet, v_wh_tgr2,
        v_steak_outlet, v_wh_tsh1,
        CURRENT_DATE, 'INTER_BRANCH', 'IN_TRANSIT',
        'Ahmad Fadillah (Logistik Garden)',
        now() - INTERVAL '30 minutes',
        'Pinjam jamur kaleng champignon premium untuk persiapan saus mushroom steak malam ini'
    ) ON CONFLICT (tenant_id, transfer_number) DO NOTHING;

    IF v_item_mush IS NOT NULL THEN
        INSERT INTO stock_transfer_items (
            tenant_id, transfer_id, item_id, requested_qty, dispatched_qty, received_qty,
            variance_qty, unit, unit_cost, notes
        ) VALUES (
            v_tenant_id, v_trf_id2, v_item_mush, 6.0000, 6.0000, 0.0000,
            0.0000, 'CAN', 28500.00,
            '6 kaleng champignon utuh bersegel diberangkatkan via staf runner resto'
        ) ON CONFLICT DO NOTHING;
    END IF;

    -- Case 3: Intra-Branch Transfer (TSH-01 Gudang Kering -> TSH-01 Chiller Steak) - PENDING REQUEST
    INSERT INTO stock_transfers (
        id, tenant_id, transfer_number, waybill_number,
        origin_outlet_id, origin_warehouse_id,
        destination_outlet_id, destination_warehouse_id,
        transfer_date, transfer_type, status,
        dispatched_by_name, notes
    ) VALUES (
        v_trf_id3, v_tenant_id, 'TRF-INT-202610-001', 'SJ-INT-202610-001',
        v_steak_outlet, v_wh_tsh2,
        v_steak_outlet, v_wh_tsh1,
        CURRENT_DATE, 'INTRA_BRANCH', 'PENDING',
        'Budi Santoso',
        'Permintaan mutasi internal dari gudang kering ke chiller panggangan utama'
    ) ON CONFLICT (tenant_id, transfer_number) DO NOTHING;

    IF v_item_tend IS NOT NULL THEN
        INSERT INTO stock_transfer_items (
            tenant_id, transfer_id, item_id, requested_qty, dispatched_qty, received_qty,
            variance_qty, unit, unit_cost, notes
        ) VALUES (
            v_tenant_id, v_trf_id3, v_item_tend, 5.0000, 0.0000, 0.0000,
            0.0000, 'KG', 185000.00,
            'Persiapan stok tenderloin porsi weekend'
        ) ON CONFLICT DO NOTHING;
    END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
-- Revert constraints and columns
ALTER TABLE stock_transfer_items
    DROP COLUMN IF EXISTS variance_qty,
    DROP COLUMN IF EXISTS variance_reason,
    DROP COLUMN IF EXISTS unit_cost,
    DROP COLUMN IF EXISTS notes;

ALTER TABLE stock_transfers
    DROP COLUMN IF EXISTS origin_outlet_id,
    DROP COLUMN IF EXISTS destination_outlet_id,
    DROP COLUMN IF EXISTS transfer_type,
    DROP COLUMN IF EXISTS waybill_number,
    DROP COLUMN IF EXISTS dispatched_at,
    DROP COLUMN IF EXISTS received_at,
    DROP COLUMN IF EXISTS cancelled_at,
    DROP COLUMN IF EXISTS cancellation_reason;

ALTER TABLE warehouses ALTER COLUMN outlet_id DROP NOT NULL;
