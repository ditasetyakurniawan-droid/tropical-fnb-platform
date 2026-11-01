-- +goose Up
-- ============================================================================
-- Milestone 6: Procurement, Multi-Warehouse, Receiving with Actual Weight Scales,
-- Blind Stock Opname, Waste/Spoilage Tracking, and Precision Real-Time HPA Engine.
--
-- Conventions (docs/adr/0003 + docs/adr/0005):
--   * Multi-Tenant & Multi-Outlet with strict isolation.
--   * Warehouses distinguish Central Kitchen (WH-CK-01) from individual outlets.
--   * Floating/decimal weights use NUMERIC(12,4) for milligram/gram accuracy.
--   * Currency uses NUMERIC(15,2) for exact Rupiah transactions.
--   * Blind Opname hides system theoretical stock from floor staff.
-- ============================================================================

-- ------------------------------------------------------------ permissions --
INSERT INTO permissions (code, module, description) VALUES
    ('inventory.warehouse.view',   'inventory', 'Melihat daftar gudang dan saldo stok multi-lokasi'),
    ('inventory.warehouse.manage', 'inventory', 'Menambah dan mengubah master data gudang'),
    ('procurement.po.manage',      'inventory', 'Membuat, menyetujui, dan membatalkan Purchase Order (PO)'),
    ('procurement.receiving.manage','inventory', 'Mencatat penerimaan barang dengan timbangan riil dan faktur'),
    ('inventory.transfer.manage',  'inventory', 'Membuat dan memproses mutasi stok antar-cabang/central kitchen'),
    ('inventory.opname.conduct',   'inventory', 'Melakukan input hitungan fisik blind stock opname'),
    ('inventory.opname.approve',   'inventory', 'Meninjau laporan selisih (variance) dan menyetujui penyesuaian opname'),
    ('inventory.waste.manage',     'inventory', 'Mencatat bahan basi, rusak, gagal masak, dan staff meal')
ON CONFLICT (code) DO NOTHING;

-- Grant permissions to OWNER, MANAGER, and CHEF system roles
-- +goose StatementBegin
DO $$
DECLARE
    v_role_owner uuid;
    v_role_mgr uuid;
    v_role_chef uuid;
BEGIN
    SELECT id INTO v_role_owner FROM roles WHERE code = 'OWNER' LIMIT 1;
    SELECT id INTO v_role_mgr FROM roles WHERE code = 'OUTLET_MANAGER' LIMIT 1;
    SELECT id INTO v_role_chef FROM roles WHERE code = 'HEAD_CHEF' LIMIT 1;

    IF v_role_owner IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_code) VALUES
            (v_role_owner, 'inventory.warehouse.view'),
            (v_role_owner, 'inventory.warehouse.manage'),
            (v_role_owner, 'procurement.po.manage'),
            (v_role_owner, 'procurement.receiving.manage'),
            (v_role_owner, 'inventory.transfer.manage'),
            (v_role_owner, 'inventory.opname.conduct'),
            (v_role_owner, 'inventory.opname.approve'),
            (v_role_owner, 'inventory.waste.manage')
        ON CONFLICT DO NOTHING;
    END IF;

    IF v_role_mgr IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_code) VALUES
            (v_role_mgr, 'inventory.warehouse.view'),
            (v_role_mgr, 'procurement.po.manage'),
            (v_role_mgr, 'procurement.receiving.manage'),
            (v_role_mgr, 'inventory.transfer.manage'),
            (v_role_mgr, 'inventory.opname.conduct'),
            (v_role_mgr, 'inventory.opname.approve'),
            (v_role_mgr, 'inventory.waste.manage')
        ON CONFLICT DO NOTHING;
    END IF;

    IF v_role_chef IS NOT NULL THEN
        INSERT INTO role_permissions (role_id, permission_code) VALUES
            (v_role_chef, 'inventory.warehouse.view'),
            (v_role_chef, 'procurement.receiving.manage'),
            (v_role_chef, 'inventory.transfer.manage'),
            (v_role_chef, 'inventory.opname.conduct'),
            (v_role_chef, 'inventory.waste.manage')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
-- +goose StatementEnd

-- ------------------------------------------------------------ 1. warehouses --
CREATE TABLE IF NOT EXISTS warehouses (
    id              uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    outlet_id       uuid        REFERENCES outlets(id) ON DELETE RESTRICT, -- NULL jika Gudang Pusat (Central Kitchen)
    code            varchar(32) NOT NULL,
    name            varchar(100) NOT NULL,
    warehouse_type  varchar(30) NOT NULL DEFAULT 'OUTLET_STORAGE', -- CENTRAL_KITCHEN, CHILLER, FREEZER, DRY_STORE, OUTLET_STORAGE
    address         text,
    pic_name        varchar(100),
    is_active       boolean     NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_code ON warehouses (tenant_id, code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_warehouses_outlet ON warehouses (tenant_id, outlet_id);

-- --------------------------------------------------------- 2. stock_balances --
CREATE TABLE IF NOT EXISTS stock_balances (
    id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    warehouse_id        uuid        NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    item_id             uuid        NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    quantity            numeric(12, 4) NOT NULL DEFAULT 0,
    reserved_quantity   numeric(12, 4) NOT NULL DEFAULT 0,
    min_stock_alert     numeric(12, 4) NOT NULL DEFAULT 0,
    max_stock_capacity  numeric(12, 4) NOT NULL DEFAULT 0,
    last_counted_at     timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_stock_warehouse_item UNIQUE (tenant_id, warehouse_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_wh ON stock_balances (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_item ON stock_balances (tenant_id, item_id);

-- ------------------------------------------------------------- 3. suppliers --
CREATE TABLE IF NOT EXISTS suppliers (
    id                      uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id               uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    code                    varchar(32) NOT NULL,
    name                    varchar(150) NOT NULL,
    category                varchar(50) NOT NULL DEFAULT 'RAW_FOOD', -- MEAT, POULTRY, SEAFOOD, VEGETABLES, DAIRY, DRY_GOODS, PACKAGING
    contact_person          varchar(100),
    phone                   varchar(50),
    email                   varchar(100),
    address                 text,
    term_of_payment_days    int         NOT NULL DEFAULT 0, -- 0 = COD / Cash on Delivery, 7, 14, 30
    bank_name               varchar(50),
    bank_account_number     varchar(50),
    bank_account_holder     varchar(100),
    is_active               boolean     NOT NULL DEFAULT true,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    deleted_at              timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_code ON suppliers (tenant_id, code) WHERE deleted_at IS NULL;

-- ------------------------------------------------------- 4. purchase_orders --
CREATE TABLE IF NOT EXISTS purchase_orders (
    id                      uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id               uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    outlet_id               uuid        NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    warehouse_id            uuid        NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    supplier_id             uuid        NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    po_number               varchar(64) NOT NULL,
    order_date              date        NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date  date        NOT NULL DEFAULT CURRENT_DATE,
    status                  varchar(30) NOT NULL DEFAULT 'DRAFT', -- DRAFT, SUBMITTED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED
    subtotal_amount         numeric(15, 2) NOT NULL DEFAULT 0,
    tax_amount              numeric(15, 2) NOT NULL DEFAULT 0,
    total_amount            numeric(15, 2) NOT NULL DEFAULT 0,
    notes                   text,
    created_by_user_id      uuid        REFERENCES users(id),
    approved_by_user_id     uuid        REFERENCES users(id),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_po_number UNIQUE (tenant_id, po_number)
);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders (tenant_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_warehouse ON purchase_orders (tenant_id, warehouse_id);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    purchase_order_id   uuid        NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_id             uuid        NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    ordered_qty         numeric(12, 4) NOT NULL,
    unit                varchar(20) NOT NULL,
    unit_price          numeric(15, 2) NOT NULL,
    subtotal            numeric(15, 2) NOT NULL,
    received_qty        numeric(12, 4) NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items (purchase_order_id);

-- -------------------------------------------------------- 5. goods_receipts --
CREATE TABLE IF NOT EXISTS goods_receipts (
    id                      uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id               uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    receipt_number          varchar(64) NOT NULL,
    purchase_order_id       uuid        REFERENCES purchase_orders(id),
    supplier_id             uuid        NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    warehouse_id            uuid        NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    received_date           date        NOT NULL DEFAULT CURRENT_DATE,
    received_time           timestamptz NOT NULL DEFAULT now(),
    invoice_number          varchar(64),
    total_billed_amount     numeric(15, 2) NOT NULL DEFAULT 0,
    total_actual_amount     numeric(15, 2) NOT NULL DEFAULT 0,
    photo_url               text,
    notes                   text,
    received_by_name        varchar(100),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_gr_number UNIQUE (tenant_id, receipt_number)
);
CREATE INDEX IF NOT EXISTS idx_gr_po ON goods_receipts (tenant_id, purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_gr_wh ON goods_receipts (tenant_id, warehouse_id);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
    id                      uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id               uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    goods_receipt_id        uuid        NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
    po_item_id              uuid        REFERENCES purchase_order_items(id),
    item_id                 uuid        NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    billed_qty              numeric(12, 4) NOT NULL,
    actual_weight_qty       numeric(12, 4) NOT NULL, -- Timbangan Aktual Lapangan
    variance_weight_qty     numeric(12, 4) NOT NULL DEFAULT 0, -- actual - billed
    unit                    varchar(20) NOT NULL,
    unit_cost               numeric(15, 2) NOT NULL,
    subtotal_cost           numeric(15, 2) NOT NULL,
    reject_qty              numeric(12, 4) NOT NULL DEFAULT 0,
    reject_reason           text,
    expiry_date             date,
    batch_number            varchar(64),
    created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gri_gr ON goods_receipt_items (goods_receipt_id);

-- ------------------------------------------------------- 6. stock_transfers --
CREATE TABLE IF NOT EXISTS stock_transfers (
    id                          uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id                   uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    transfer_number             varchar(64) NOT NULL,
    origin_warehouse_id         uuid        NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    destination_warehouse_id    uuid        NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    transfer_date               date        NOT NULL DEFAULT CURRENT_DATE,
    status                      varchar(30) NOT NULL DEFAULT 'PENDING', -- PENDING, IN_TRANSIT, RECEIVED, CANCELLED
    dispatched_by_name          varchar(100),
    received_by_name            varchar(100),
    notes                       text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_trf_number UNIQUE (tenant_id, transfer_number),
    CONSTRAINT chk_diff_warehouses CHECK (origin_warehouse_id <> destination_warehouse_id)
);
CREATE INDEX IF NOT EXISTS idx_st_origin ON stock_transfers (tenant_id, origin_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_st_dest ON stock_transfers (tenant_id, destination_warehouse_id);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
    id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    transfer_id         uuid        NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    item_id             uuid        NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    requested_qty       numeric(12, 4) NOT NULL,
    dispatched_qty      numeric(12, 4) NOT NULL DEFAULT 0,
    received_qty        numeric(12, 4) NOT NULL DEFAULT 0,
    unit                varchar(20) NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sti_trf ON stock_transfer_items (transfer_id);

-- --------------------------------------------------------- 7. stock_opnames --
CREATE TABLE IF NOT EXISTS stock_opnames (
    id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    opname_number       varchar(64) NOT NULL,
    warehouse_id        uuid        NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    opname_date         date        NOT NULL DEFAULT CURRENT_DATE,
    status              varchar(30) NOT NULL DEFAULT 'DRAFT', -- DRAFT, COUNTED, APPROVED, CANCELLED
    conducted_by_name   varchar(100),
    approved_by_name    varchar(100),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_opname_number UNIQUE (tenant_id, opname_number)
);
CREATE INDEX IF NOT EXISTS idx_opname_wh ON stock_opnames (tenant_id, warehouse_id);

CREATE TABLE IF NOT EXISTS stock_opname_items (
    id                      uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id               uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    stock_opname_id         uuid        NOT NULL REFERENCES stock_opnames(id) ON DELETE CASCADE,
    item_id                 uuid        NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    system_theoretical_qty  numeric(12, 4) NOT NULL, -- DISEMBUNYIKAN dari staf lantai saat proses input
    physical_counted_qty    numeric(12, 4) NOT NULL,
    variance_qty            numeric(12, 4) NOT NULL, -- physical - system
    unit_cost               numeric(15, 2) NOT NULL,
    variance_cost           numeric(15, 2) NOT NULL,
    variance_category       varchar(30) NOT NULL DEFAULT 'NORMAL', -- NORMAL, SPOILAGE, OVER_PORTIONING, SHRINKAGE, UNRECORDED_WASTE, COUNT_ERROR
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soi_opname ON stock_opname_items (stock_opname_id);

-- --------------------------------------------------------- 8. waste_records --
CREATE TABLE IF NOT EXISTS waste_records (
    id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    outlet_id           uuid        NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    warehouse_id        uuid        NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    waste_number        varchar(64) NOT NULL,
    waste_date          date        NOT NULL DEFAULT CURRENT_DATE,
    category            varchar(30) NOT NULL, -- EXPIRED_SPOILAGE, DROPPED_DAMAGED, COOKING_ERROR, STAFF_MEAL
    total_cost          numeric(15, 2) NOT NULL DEFAULT 0,
    photo_url           text,
    recorded_by_name    varchar(100),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_waste_number UNIQUE (tenant_id, waste_number)
);
CREATE INDEX IF NOT EXISTS idx_waste_wh ON waste_records (tenant_id, warehouse_id);

CREATE TABLE IF NOT EXISTS waste_record_items (
    id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    waste_record_id     uuid        NOT NULL REFERENCES waste_records(id) ON DELETE CASCADE,
    item_id             uuid        NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    quantity            numeric(12, 4) NOT NULL,
    unit                varchar(20) NOT NULL,
    unit_cost           numeric(15, 2) NOT NULL,
    subtotal_cost       numeric(15, 2) NOT NULL,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wri_waste ON waste_record_items (waste_record_id);

-- -------------------------------------------------------- 9. stock_movements --
CREATE TABLE IF NOT EXISTS stock_movements (
    id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
    tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    warehouse_id        uuid        NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    item_id             uuid        NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    movement_type       varchar(30) NOT NULL, -- PURCHASE_RECEIPT, TRANSFER_OUT, TRANSFER_IN, OPNAME_ADJUSTMENT, WASTE_DISPOSAL, POS_SALES_DEDUCTION
    reference_id        varchar(64),
    quantity_change     numeric(12, 4) NOT NULL, -- Positif untuk masuk, Negatif untuk keluar
    balance_after       numeric(12, 4) NOT NULL,
    unit_cost           numeric(15, 2) NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sm_wh_item ON stock_movements (tenant_id, warehouse_id, item_id);
CREATE INDEX IF NOT EXISTS idx_sm_date ON stock_movements (created_at DESC);

-- ---------------------------------------------------- 10. alter menu_items --
ALTER TABLE menu_items 
    ADD COLUMN IF NOT EXISTS hpa_calculation_mode varchar(20) NOT NULL DEFAULT 'DYNAMIC_BOM', -- DYNAMIC_BOM vs MANUAL_OVERRIDE
    ADD COLUMN IF NOT EXISTS manual_hpa numeric(15, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_calculated_hpa numeric(15, 2) NOT NULL DEFAULT 0;

-- ============================================================================
-- SEED DATA MILESTONE 6: Warehouses, Suppliers, Stock Balances, PO, GR, Opname
-- ============================================================================
-- +goose StatementBegin
DO $$
DECLARE
    v_tenant uuid;
    v_steak_outlet uuid;
    v_garden_outlet uuid;

    -- Warehouses
    v_wh_ck uuid := '0192a000-0001-7000-8000-000000000001'::uuid;
    v_wh_tsh uuid := '0192a000-0001-7000-8000-000000000002'::uuid;
    v_wh_tgr uuid := '0192a000-0001-7000-8000-000000000003'::uuid;

    -- Suppliers
    v_sup_meat uuid := '0192a000-0002-7000-8000-000000000001'::uuid;
    v_sup_poultry uuid := '0192a000-0002-7000-8000-000000000002'::uuid;
    v_sup_farm uuid := '0192a000-0002-7000-8000-000000000003'::uuid;
    v_sup_dairy uuid := '0192a000-0002-7000-8000-000000000004'::uuid;

    -- Sample IDs
    v_po1_id uuid := '0192a000-0003-7000-8000-000000000001'::uuid;
    v_po1_item1 uuid := '0192a000-0003-7000-8000-000000000002'::uuid;
    v_gr1_id uuid := '0192a000-0004-7000-8000-000000000001'::uuid;

    -- Inventory items
    v_item_tend uuid;
    v_item_rib uuid;
    v_item_chicken uuid;
    v_item_fish uuid;
    v_item_fries uuid;
    v_item_butter uuid;
    v_item_cream uuid;
    v_item_mush uuid;
BEGIN
    SELECT id INTO v_tenant FROM tenants WHERE slug = 'tropical-temanggung' LIMIT 1;
    SELECT id INTO v_steak_outlet FROM outlets WHERE code = 'TSH-01' LIMIT 1;
    SELECT id INTO v_garden_outlet FROM outlets WHERE code = 'TGR-01' LIMIT 1;

    IF v_tenant IS NULL THEN RETURN; END IF;

    -- Retrieve item IDs
    SELECT id INTO v_item_tend FROM inventory_items WHERE code = 'ING-BEEF-TEND' LIMIT 1;
    SELECT id INTO v_item_rib FROM inventory_items WHERE code = 'ING-BEEF-RIB' LIMIT 1;
    SELECT id INTO v_item_chicken FROM inventory_items WHERE code = 'ING-CHICKEN' LIMIT 1;
    SELECT id INTO v_item_fish FROM inventory_items WHERE code = 'ING-FISH-GUR' LIMIT 1;
    SELECT id INTO v_item_fries FROM inventory_items WHERE code = 'ING-FRIES' LIMIT 1;
    SELECT id INTO v_item_butter FROM inventory_items WHERE code = 'ING-BUTTER' LIMIT 1;
    SELECT id INTO v_item_cream FROM inventory_items WHERE code = 'ING-CREAM' LIMIT 1;
    SELECT id INTO v_item_mush FROM inventory_items WHERE code = 'ING-MUSH-CHAMP' LIMIT 1;

    -- 1. Insert 3 Distinct Warehouses
    INSERT INTO warehouses (id, tenant_id, outlet_id, code, name, warehouse_type, address, pic_name)
    VALUES
        (v_wh_ck, v_tenant, NULL, 'WH-CK-01', 'Gudang Central Kitchen Manding', 'CENTRAL_KITCHEN', 'Jl. Boulevard Tropical Manding (Area Belakang)', 'Chef Hendra Kusuma'),
        (v_wh_tsh, v_tenant, v_steak_outlet, 'WH-TSH-01', 'Chiller & Storage Tropical Steak House', 'CHILLER', 'Area Dapur Tropical Steak House', 'Agus Supriyanto'),
        (v_wh_tgr, v_tenant, v_garden_outlet, 'WH-TGR-01', 'Gudang & Kolam Tropical Garden Resto', 'OUTLET_STORAGE', 'Area Dapur Tropical Garden Resto', 'Siti Rahmawati')
    ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING;

    -- 2. Insert Suppliers
    INSERT INTO suppliers (id, tenant_id, code, name, category, contact_person, phone, email, address, term_of_payment_days, bank_name, bank_account_number, bank_account_holder)
    VALUES
        (v_sup_meat, v_tenant, 'SUP-MEAT-01', 'PT Agro Boga Utama (Imported Meat)', 'MEAT', 'Bambang Irawan', '0812-9988-7711', 'order@agroboga.co.id', 'Kawasan Industri Candi, Semarang', 14, 'BCA', '8030-1122-33', 'PT Agro Boga Utama'),
        (v_sup_poultry, v_tenant, 'SUP-FARM-01', 'CV Manding Makmur Unggas', 'POULTRY', 'Pak Slamet', '0857-4321-9900', 'slamet.poultry@gmail.com', 'Dusun Manding Kidul, Temanggung', 7, 'BRI', '0145-01-002233-50-1', 'CV Manding Makmur'),
        (v_sup_farm, v_tenant, 'SUP-VEG-01', 'Kelompok Tani Sayur Kledung Asri', 'VEGETABLES', 'Mas Wahyu', '0813-2890-4455', 'kledung.sayur@gmail.com', 'Kledung Pass, Temanggung', 0, 'Bank Jateng', '3024-5566-77', 'Wahyu Hidayat'),
        (v_sup_dairy, v_tenant, 'SUP-DAIRY-01', 'PT Diamond Cold Storage Distribution', 'DAIRY', 'Ibu Maya', '024-7612345', 'order.jateng@diamond.co.id', 'Krapyak, Semarang Barat', 30, 'Mandiri', '136-00-998877-1', 'PT Diamond Cold Storage')
    ON CONFLICT (tenant_id, code) WHERE deleted_at IS NULL DO NOTHING;

    -- 3. Populate Stock Balances for 3 Warehouses
    IF v_item_tend IS NOT NULL THEN
        INSERT INTO stock_balances (tenant_id, warehouse_id, item_id, quantity, reserved_quantity, min_stock_alert, max_stock_capacity)
        VALUES
            (v_tenant, v_wh_ck, v_item_tend, 15.0000, 0, 5.0000, 50.0000),
            (v_tenant, v_wh_tsh, v_item_tend, 10.5000, 0, 4.0000, 25.0000)
        ON CONFLICT (tenant_id, warehouse_id, item_id) DO UPDATE SET quantity = EXCLUDED.quantity;
    END IF;

    IF v_item_rib IS NOT NULL THEN
        INSERT INTO stock_balances (tenant_id, warehouse_id, item_id, quantity, reserved_quantity, min_stock_alert, max_stock_capacity)
        VALUES
            (v_tenant, v_wh_ck, v_item_rib, 12.0000, 0, 4.0000, 40.0000),
            (v_tenant, v_wh_tsh, v_item_rib, 8.0000, 0, 3.0000, 20.0000)
        ON CONFLICT (tenant_id, warehouse_id, item_id) DO UPDATE SET quantity = EXCLUDED.quantity;
    END IF;

    IF v_item_fries IS NOT NULL THEN
        INSERT INTO stock_balances (tenant_id, warehouse_id, item_id, quantity, reserved_quantity, min_stock_alert, max_stock_capacity)
        VALUES
            (v_tenant, v_wh_ck, v_item_fries, 30.0000, 0, 10.0000, 100.0000),
            (v_tenant, v_wh_tsh, v_item_fries, 20.0000, 0, 8.0000, 50.0000)
        ON CONFLICT (tenant_id, warehouse_id, item_id) DO UPDATE SET quantity = EXCLUDED.quantity;
    END IF;

    IF v_item_chicken IS NOT NULL THEN
        INSERT INTO stock_balances (tenant_id, warehouse_id, item_id, quantity, reserved_quantity, min_stock_alert, max_stock_capacity)
        VALUES
            (v_tenant, v_wh_ck, v_item_chicken, 15.0000, 0, 5.0000, 50.0000),
            (v_tenant, v_wh_tgr, v_item_chicken, 25.0000, 0, 10.0000, 60.0000)
        ON CONFLICT (tenant_id, warehouse_id, item_id) DO UPDATE SET quantity = EXCLUDED.quantity;
    END IF;

    IF v_item_fish IS NOT NULL THEN
        INSERT INTO stock_balances (tenant_id, warehouse_id, item_id, quantity, reserved_quantity, min_stock_alert, max_stock_capacity)
        VALUES
            (v_tenant, v_wh_tgr, v_item_fish, 30.0000, 0, 10.0000, 50.0000)
        ON CONFLICT (tenant_id, warehouse_id, item_id) DO UPDATE SET quantity = EXCLUDED.quantity;
    END IF;

    -- 4. Sample Purchase Order (PO-202610-001) for Beef Tenderloin
    IF v_item_tend IS NOT NULL THEN
        INSERT INTO purchase_orders (id, tenant_id, outlet_id, warehouse_id, supplier_id, po_number, order_date, expected_delivery_date, status, subtotal_amount, tax_amount, total_amount, notes)
        VALUES
            (v_po1_id, v_tenant, v_steak_outlet, v_wh_tsh, v_sup_meat, 'PO-202610-001', CURRENT_DATE - INTERVAL '2 day', CURRENT_DATE - INTERVAL '1 day', 'RECEIVED', 1350000.00, 0, 1350000.00, 'Pengadaan rutin Daging Tenderloin untuk persiapan akhir pekan')
        ON CONFLICT (tenant_id, po_number) DO NOTHING;

        INSERT INTO purchase_order_items (id, tenant_id, purchase_order_id, item_id, ordered_qty, unit, unit_price, subtotal, received_qty)
        VALUES
            (v_po1_item1, v_tenant, v_po1_id, v_item_tend, 10.0000, 'kg', 135000.00, 1350000.00, 9.8500)
        ON CONFLICT DO NOTHING;

        -- 5. Sample Goods Receipt (GR-202610-001) with actual scale weighing (billed 10kg, weighed 9.85kg)
        INSERT INTO goods_receipts (id, tenant_id, receipt_number, purchase_order_id, supplier_id, warehouse_id, received_date, received_time, invoice_number, total_billed_amount, total_actual_amount, notes, received_by_name)
        VALUES
            (v_gr1_id, v_tenant, 'GR-202610-001', v_po1_id, v_sup_meat, v_wh_tsh, CURRENT_DATE - INTERVAL '1 day', now() - INTERVAL '1 day', 'INV/AGRO/2026/1098', 1350000.00, 1329750.00, 'Daging diterima kondisi dingin (suhu 2°C). Timbangan aktual 9.85kg (susut es 150g).', 'Agus Supriyanto')
        ON CONFLICT (tenant_id, receipt_number) DO NOTHING;

        INSERT INTO goods_receipt_items (id, tenant_id, goods_receipt_id, po_item_id, item_id, billed_qty, actual_weight_qty, variance_weight_qty, unit, unit_cost, subtotal_cost, reject_qty, batch_number)
        VALUES
            (gen_random_uuid(), v_tenant, v_gr1_id, v_po1_item1, v_item_tend, 10.0000, 9.8500, -0.1500, 'kg', 135000.00, 1329750.00, 0, 'BATCH-TEND-2610-A')
        ON CONFLICT DO NOTHING;
    END IF;

    -- 6. Sample Blind Stock Opname Session (SOP-202610-001)
    IF v_item_tend IS NOT NULL AND v_item_fries IS NOT NULL THEN
        DECLARE
            v_sop_id uuid := '0192a000-0005-7000-8000-000000000001'::uuid;
        BEGIN
            INSERT INTO stock_opnames (id, tenant_id, opname_number, warehouse_id, opname_date, status, conducted_by_name, approved_by_name, notes)
            VALUES (v_sop_id, v_tenant, 'SOP-202610-001', v_wh_tsh, CURRENT_DATE, 'APPROVED', 'Agus Supriyanto', 'Budi Santoso (Owner)', 'Stock Opname Rutin Tutup Toko Periode Oktober 2026')
            ON CONFLICT (tenant_id, opname_number) DO NOTHING;

            INSERT INTO stock_opname_items (tenant_id, stock_opname_id, item_id, system_theoretical_qty, physical_counted_qty, variance_qty, unit_cost, variance_cost, variance_category, notes)
            VALUES
                (v_tenant, v_sop_id, v_item_tend, 11.0000, 10.5000, -0.5000, 135000.00, -67500.00, 'SHRINKAGE', 'Susut wajar trimming dan darah mencair'),
                (v_tenant, v_sop_id, v_item_fries, 20.0000, 20.0000, 0.0000, 28000.00, 0.00, 'NORMAL', 'Fisik cocok 100% dengan kemasan utuh pack 2.5kg')
            ON CONFLICT DO NOTHING;
        END;
    END IF;

    -- 7. Sample Waste Record (WST-202610-001)
    IF v_item_chicken IS NOT NULL THEN
        DECLARE
            v_wst_id uuid := '0192a000-0006-7000-8000-000000000001'::uuid;
        BEGIN
            INSERT INTO waste_records (id, tenant_id, outlet_id, warehouse_id, waste_number, waste_date, category, total_cost, recorded_by_name, notes)
            VALUES (v_wst_id, v_tenant, v_garden_outlet, v_wh_tgr, 'WST-202610-001', CURRENT_DATE, 'COOKING_ERROR', 70000.00, 'Siti Rahmawati', 'Ayam goreng kremes gosong karena suhu minyak terlalu tinggi saat jam sibuk')
            ON CONFLICT (tenant_id, waste_number) DO NOTHING;

            INSERT INTO waste_record_items (tenant_id, waste_record_id, item_id, quantity, unit, unit_cost, subtotal_cost, notes)
            VALUES (v_tenant, v_wst_id, v_item_chicken, 2.0000, 'kg', 35000.00, 70000.00, '2 ekor ayam gosong')
            ON CONFLICT DO NOTHING;
        END;
    END IF;

    -- 8. Set Custom Manual HPA on key menu items for demonstration
    UPDATE menu_items
       SET hpa_calculation_mode = 'DYNAMIC_BOM',
           manual_hpa = 52000.00,
           last_calculated_hpa = 47700.00
     WHERE code = 'MENU-TSH-TEND-200';

    UPDATE menu_items
       SET hpa_calculation_mode = 'MANUAL_OVERRIDE',
           manual_hpa = 42000.00,
           last_calculated_hpa = 46500.00
     WHERE code = 'MENU-TSH-RIB-200';

END $$;
-- +goose StatementEnd

-- +goose Down
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS waste_record_items;
DROP TABLE IF EXISTS waste_records;
DROP TABLE IF EXISTS stock_opname_items;
DROP TABLE IF EXISTS stock_opnames;
DROP TABLE IF EXISTS stock_transfer_items;
DROP TABLE IF EXISTS stock_transfers;
DROP TABLE IF EXISTS goods_receipt_items;
DROP TABLE IF EXISTS goods_receipts;
DROP TABLE IF EXISTS purchase_order_items;
DROP TABLE IF EXISTS purchase_orders;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS stock_balances;
DROP TABLE IF EXISTS warehouses;
ALTER TABLE menu_items 
    DROP COLUMN IF EXISTS last_calculated_hpa,
    DROP COLUMN IF EXISTS manual_hpa,
    DROP COLUMN IF EXISTS hpa_calculation_mode;
DELETE FROM role_permissions WHERE permission_code LIKE 'inventory.%' OR permission_code LIKE 'procurement.%';
DELETE FROM permissions WHERE code LIKE 'inventory.%' OR code LIKE 'procurement.%';
