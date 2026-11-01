-- +goose Up
-- +goose StatementBegin

-- 1. Meja Indoor & Gazebo Outdoor (Dining Tables & Gazebos)
CREATE TABLE IF NOT EXISTS dining_tables (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    table_number VARCHAR(32) NOT NULL,
    section VARCHAR(50) NOT NULL DEFAULT 'INDOOR_MAIN', -- INDOOR_MAIN, INDOOR_VIP, OUTDOOR_GAZEBO, OUTDOOR_JOGLO, OUTDOOR_GARDEN
    capacity INTEGER NOT NULL DEFAULT 4,
    shape VARCHAR(30) NOT NULL DEFAULT 'RECTANGLE', -- RECTANGLE, ROUND, GAZEBO_OCTAGON
    status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE, RESERVED, OCCUPIED, BILL_PRINTED, DIRTY
    active_order_id UUID, -- Forward reference to orders
    pos_x INTEGER NOT NULL DEFAULT 0,
    pos_y INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT chk_dining_table_status CHECK (status IN ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'BILL_PRINTED', 'DIRTY')),
    CONSTRAINT chk_dining_table_capacity CHECK (capacity > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dining_table_num ON dining_tables (tenant_id, outlet_id, upper(table_number)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dining_table_outlet_sec ON dining_tables (tenant_id, outlet_id, section);

CREATE TRIGGER dining_tables_set_updated_at BEFORE UPDATE ON dining_tables
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. Transaksi Pesanan POS (Orders)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    order_number VARCHAR(64) NOT NULL,
    order_type VARCHAR(32) NOT NULL DEFAULT 'DINE_IN', -- DINE_IN, TAKEAWAY, EVENT_RESERVATION
    payment_flow VARCHAR(32) NOT NULL DEFAULT 'PAY_AFTER', -- PAY_FIRST, PAY_AFTER
    table_id UUID REFERENCES dining_tables(id) ON DELETE SET NULL,
    customer_name VARCHAR(120) NOT NULL DEFAULT 'Tamu',
    customer_phone VARCHAR(50),
    pax_count INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN', -- OPEN, IN_KITCHEN, SERVED, COMPLETED, CANCELLED, VOID
    payment_status VARCHAR(32) NOT NULL DEFAULT 'UNPAID', -- UNPAID, PARTIALLY_PAID, PAID, REFUNDED
    subtotal NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    discount_note TEXT,
    tax_pb1_percent NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    tax_pb1_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    service_charge_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    service_charge_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    final_total NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    change_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT chk_order_type CHECK (order_type IN ('DINE_IN', 'TAKEAWAY', 'EVENT_RESERVATION')),
    CONSTRAINT chk_order_payment_flow CHECK (payment_flow IN ('PAY_FIRST', 'PAY_AFTER')),
    CONSTRAINT chk_order_status CHECK (status IN ('OPEN', 'IN_KITCHEN', 'SERVED', 'COMPLETED', 'CANCELLED', 'VOID')),
    CONSTRAINT chk_order_payment_status CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_number ON orders (tenant_id, upper(order_number)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_outlet_status ON orders (tenant_id, outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);

-- Tambahkan FK active_order_id ke dining_tables
ALTER TABLE dining_tables 
    ADD CONSTRAINT fk_dining_tables_active_order 
    FOREIGN KEY (active_order_id) REFERENCES orders(id) ON DELETE SET NULL;

CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. Detail Item Pesanan (Order Items)
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    item_name VARCHAR(150) NOT NULL,
    unit_price NUMERIC(18, 2) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    subtotal NUMERIC(18, 2) NOT NULL,
    notes TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'ORDERED', -- ORDERED, COOKING, READY, SERVED, CANCELLED
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_order_item_qty CHECK (quantity > 0),
    CONSTRAINT chk_order_item_status CHECK (status IN ('ORDERED', 'COOKING', 'READY', 'SERVED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

CREATE TRIGGER order_items_set_updated_at BEFORE UPDATE ON order_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Pembayaran Pesanan (Order Payments)
CREATE TABLE IF NOT EXISTS order_payments (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_method VARCHAR(32) NOT NULL, -- CASH, QRIS, DEBIT_CARD, CREDIT_CARD, TRANSFER, SPLIT
    amount NUMERIC(18, 2) NOT NULL,
    change_given NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    reference_number VARCHAR(100),
    paid_by VARCHAR(120),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_payment_method CHECK (payment_method IN ('CASH', 'QRIS', 'DEBIT_CARD', 'CREDIT_CARD', 'TRANSFER', 'SPLIT'))
);

CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments (order_id);

-- 5. Split Bill / Tagihan Terpisah (Split Bills)
CREATE TABLE IF NOT EXISTS split_bills (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    split_number INTEGER NOT NULL,
    payer_name VARCHAR(120) NOT NULL DEFAULT 'Tamu',
    subtotal NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    tax_pb1_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    final_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(32),
    is_paid BOOLEAN NOT NULL DEFAULT false,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_split_bills_order ON split_bills (order_id);

-- 6. Detail Item per Split Bill (Split Bill Items)
CREATE TABLE IF NOT EXISTS split_bill_items (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    split_bill_id UUID NOT NULL REFERENCES split_bills(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    amount NUMERIC(18, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_split_bill_items ON split_bill_items (split_bill_id);

-- 7. Reservasi Skala Besar & Event (Reservations)
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    reservation_number VARCHAR(64) NOT NULL,
    customer_name VARCHAR(120) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL DEFAULT 'REGULAR_DINING', -- REGULAR_DINING, FAMILY_GATHERING, CORPORATE_EVENT, BIRTHDAY_PARTY, WEDDING_RECEPTION, COMMUNITY_MEETING
    pax_count INTEGER NOT NULL DEFAULT 2,
    reservation_date DATE NOT NULL,
    start_time VARCHAR(20) NOT NULL, -- Format: "18:30"
    end_time VARCHAR(20),            -- Format: "21:00"
    assigned_table_id UUID REFERENCES dining_tables(id) ON DELETE SET NULL,
    min_spend NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    deposit_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00, -- Down Payment (DP)
    deposit_paid BOOLEAN NOT NULL DEFAULT false,
    deposit_payment_method VARCHAR(32),
    status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED', -- PENDING_DEPOSIT, CONFIRMED, SEATED, COMPLETED, CANCELLED, NO_SHOW
    special_requests TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_reservation_event_type CHECK (event_type IN ('REGULAR_DINING', 'FAMILY_GATHERING', 'CORPORATE_EVENT', 'BIRTHDAY_PARTY', 'WEDDING_RECEPTION', 'COMMUNITY_MEETING')),
    CONSTRAINT chk_reservation_status CHECK (status IN ('PENDING_DEPOSIT', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
    CONSTRAINT chk_reservation_pax CHECK (pax_count > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reservations_num ON reservations (tenant_id, upper(reservation_number));
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations (tenant_id, outlet_id, reservation_date);

CREATE TRIGGER reservations_set_updated_at BEFORE UPDATE ON reservations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- SEED DATA: Meja & Gazebo Nyata Tropical Group Temanggung
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_tenant_id uuid;
    v_steak_id uuid;
    v_garden_id uuid;
    v_user_kasir_s uuid;
    v_user_kasir_g uuid;
    v_t1_id uuid;
    v_t2_id uuid;
    v_vip1_id uuid;
    v_gz1_id uuid;
    v_gz2_id uuid;
    v_joglo_id uuid;
    v_menu_tend uuid;
    v_menu_rib uuid;
    v_menu_ayam uuid;
    v_order_steak uuid;
    v_order_garden uuid;
    v_item_tend uuid;
    v_item_rib uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'tropical-temanggung' LIMIT 1;
    SELECT id INTO v_steak_id FROM outlets WHERE slug = 'tropical-steak-house' LIMIT 1;
    SELECT id INTO v_garden_id FROM outlets WHERE slug = 'tropical-garden-resto' LIMIT 1;
    SELECT id INTO v_user_kasir_s FROM users WHERE username = 'kasir_steak' LIMIT 1;
    SELECT id INTO v_user_kasir_g FROM users WHERE username = 'kasir_garden' LIMIT 1;

    IF v_tenant_id IS NOT NULL AND v_steak_id IS NOT NULL THEN
        -- Meja Tropical Steak House
        INSERT INTO dining_tables (tenant_id, outlet_id, table_number, section, capacity, shape, status, pos_x, pos_y)
        VALUES 
            (v_tenant_id, v_steak_id, 'T-01', 'INDOOR_MAIN', 4, 'RECTANGLE', 'AVAILABLE', 1, 1) RETURNING id INTO v_t1_id;
        INSERT INTO dining_tables (tenant_id, outlet_id, table_number, section, capacity, shape, status, pos_x, pos_y)
        VALUES 
            (v_tenant_id, v_steak_id, 'T-02', 'INDOOR_MAIN', 4, 'RECTANGLE', 'AVAILABLE', 1, 2) RETURNING id INTO v_t2_id;
        INSERT INTO dining_tables (tenant_id, outlet_id, table_number, section, capacity, shape, status, pos_x, pos_y)
        VALUES 
            (v_tenant_id, v_steak_id, 'T-03', 'INDOOR_MAIN', 4, 'RECTANGLE', 'AVAILABLE', 2, 1);
        INSERT INTO dining_tables (tenant_id, outlet_id, table_number, section, capacity, shape, status, pos_x, pos_y)
        VALUES 
            (v_tenant_id, v_steak_id, 'T-04', 'INDOOR_MAIN', 6, 'RECTANGLE', 'AVAILABLE', 2, 2);
        INSERT INTO dining_tables (tenant_id, outlet_id, table_number, section, capacity, shape, status, pos_x, pos_y)
        VALUES 
            (v_tenant_id, v_steak_id, 'T-05 (Couple)', 'INDOOR_MAIN', 2, 'ROUND', 'AVAILABLE', 3, 1);
        INSERT INTO dining_tables (tenant_id, outlet_id, table_number, section, capacity, shape, status, pos_x, pos_y)
        VALUES 
            (v_tenant_id, v_steak_id, 'VIP-01 (Room AC)', 'INDOOR_VIP', 12, 'RECTANGLE', 'AVAILABLE', 3, 2) RETURNING id INTO v_vip1_id;
    END IF;

    IF v_tenant_id IS NOT NULL AND v_garden_id IS NOT NULL THEN
        -- Gazebo & Area Tropical Garden Resto (Manding, Temanggung)
        INSERT INTO dining_tables (tenant_id, outlet_id, table_number, section, capacity, shape, status, pos_x, pos_y)
        VALUES 
            (v_tenant_id, v_garden_id, 'GAZEBO-01', 'OUTDOOR_GAZEBO', 6, 'GAZEBO_OCTAGON', 'AVAILABLE', 1, 1) RETURNING id INTO v_gz1_id;
        INSERT INTO dining_tables (tenant_id, outlet_id, table_number, section, capacity, shape, status, pos_x, pos_y)
        VALUES 
            (v_tenant_id, v_garden_id, 'GAZEBO-02', 'OUTDOOR_GAZEBO', 6, 'GAZEBO_OCTAGON', 'AVAILABLE', 1, 2) RETURNING id INTO v_gz2_id;
        INSERT INTO dining_tables (tenant_id, outlet_id, table_number, section, capacity, shape, status, pos_x, pos_y)
        VALUES 
            (v_tenant_id, v_garden_id, 'GAZEBO-03', 'OUTDOOR_GAZEBO', 6, 'GAZEBO_OCTAGON', 'AVAILABLE', 2, 1);
        INSERT INTO dining_tables (tenant_id, outlet_id, table_number, section, capacity, shape, status, pos_x, pos_y)
        VALUES 
            (v_tenant_id, v_garden_id, 'GAZEBO-04 (Kolam Ikan)', 'OUTDOOR_GAZEBO', 8, 'GAZEBO_OCTAGON', 'AVAILABLE', 2, 2);
        INSERT INTO dining_tables (tenant_id, outlet_id, table_number, section, capacity, shape, status, pos_x, pos_y)
        VALUES 
            (v_tenant_id, v_garden_id, 'GAZEBO-05 (Kolam Ikan)', 'OUTDOOR_GAZEBO', 8, 'GAZEBO_OCTAGON', 'AVAILABLE', 3, 1);
        INSERT INTO dining_tables (tenant_id, outlet_id, table_number, section, capacity, shape, status, pos_x, pos_y)
        VALUES 
            (v_tenant_id, v_garden_id, 'JOGLO-UTAMA', 'OUTDOOR_JOGLO', 50, 'RECTANGLE', 'AVAILABLE', 3, 2) RETURNING id INTO v_joglo_id;
    END IF;

    -- Seed Active Order 1: Dine-In Pay-After at T-01 (Tropical Steak House)
    SELECT id INTO v_menu_tend FROM menu_items WHERE code = 'MENU-TSH-TEND-200' LIMIT 1;
    SELECT id INTO v_menu_rib FROM menu_items WHERE code = 'MENU-TSH-RIB-200' LIMIT 1;

    IF v_t1_id IS NOT NULL AND v_menu_tend IS NOT NULL AND v_menu_rib IS NOT NULL THEN
        -- Tenderloin 88k + Ribeye 85k = Subtotal 173k + PB1 10% (17.300) = Total 190.300
        INSERT INTO orders (
            tenant_id, outlet_id, order_number, order_type, payment_flow,
            table_id, customer_name, pax_count, status, payment_status,
            subtotal, tax_pb1_percent, tax_pb1_amount, final_total,
            created_by, notes
        ) VALUES (
            v_tenant_id, v_steak_id, 'ORD-TSH-20261024-0001', 'DINE_IN', 'PAY_AFTER',
            v_t1_id, 'Bpk. Agus Santoso', 2, 'OPEN', 'UNPAID',
            173000.00, 10.00, 17300.00, 190300.00,
            v_user_kasir_s, 'Meja dekat jendela taman, steak disajikan bersamaan'
        ) RETURNING id INTO v_order_steak;

        UPDATE dining_tables SET status = 'OCCUPIED', active_order_id = v_order_steak WHERE id = v_t1_id;

        INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, subtotal, notes, status)
        VALUES (v_order_steak, v_menu_tend, 'Australian Tenderloin Steak 200g', 88000.00, 1, 88000.00, 'Mushroom sauce, kematangan Medium Rare', 'COOKING')
        RETURNING id INTO v_item_tend;

        INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, subtotal, notes, status)
        VALUES (v_order_steak, v_menu_rib, 'Ribeye Steak 200g with BBQ Sauce', 85000.00, 1, 85000.00, 'BBQ sauce, kematangan Medium Well', 'COOKING')
        RETURNING id INTO v_item_rib;
    END IF;

    -- Seed Active Order 2: Dine-In Pay-First Completed at GAZEBO-01 (Tropical Garden Resto)
    SELECT id INTO v_menu_ayam FROM menu_items WHERE code = 'MENU-TGR-AYAM-MADU' LIMIT 1;
    IF v_gz1_id IS NOT NULL AND v_menu_ayam IS NOT NULL THEN
        -- 2 Ayam Bakar Madu @ 35k = Subtotal 70k + PB1 10% (7.000) = Total 77.000 (Paid via QRIS)
        INSERT INTO orders (
            tenant_id, outlet_id, order_number, order_type, payment_flow,
            table_id, customer_name, pax_count, status, payment_status,
            subtotal, tax_pb1_percent, tax_pb1_amount, final_total, paid_amount,
            created_by, notes
        ) VALUES (
            v_tenant_id, v_garden_id, 'ORD-TGR-20261024-0001', 'DINE_IN', 'PAY_FIRST',
            v_gz1_id, 'Ibu Ratna & Keluarga', 4, 'IN_KITCHEN', 'PAID',
            70000.00, 10.00, 7000.00, 77000.00, 77000.00,
            v_user_kasir_g, 'Bayar di awal via QRIS, minta sambal lalapan ekstra'
        ) RETURNING id INTO v_order_garden;

        UPDATE dining_tables SET status = 'OCCUPIED', active_order_id = v_order_garden WHERE id = v_gz1_id;

        INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, subtotal, notes, status)
        VALUES (v_order_garden, v_menu_ayam, 'Ayam Bakar Madu Spesial Gazebo', 35000.00, 2, 70000.00, 'Bumbu bakar manis gurih pedas sedang', 'COOKING');

        INSERT INTO order_payments (order_id, payment_method, amount, reference_number, paid_by)
        VALUES (v_order_garden, 'QRIS', 77000.00, 'QRIS-BCA-982348123', 'Ratna Dewi');
    END IF;

    -- Seed Event Reservation: Gathering Paguyuban Temanggung di JOGLO-UTAMA
    IF v_tenant_id IS NOT NULL AND v_garden_id IS NOT NULL AND v_joglo_id IS NOT NULL THEN
        INSERT INTO reservations (
            tenant_id, outlet_id, reservation_number, customer_name, customer_phone,
            event_type, pax_count, reservation_date, start_time, end_time,
            assigned_table_id, min_spend, deposit_amount, deposit_paid, deposit_payment_method,
            status, special_requests
        ) VALUES (
            v_tenant_id, v_garden_id, 'RSV-20261028-001', 'Bpk. Hendro (Paguyuban Temanggung)', '081234567890',
            'CORPORATE_EVENT', 35, CURRENT_DATE + INTERVAL '4 day', '13:00', '16:00',
            v_joglo_id, 3500000.00, 1500000.00, true, 'TRANSFER',
            'CONFIRMED', 'Susunan meja U-Shape, siapkan mic wireless dan sambutan di Joglo Utama.'
        );

        -- Mark Joglo as RESERVED
        UPDATE dining_tables SET status = 'RESERVED' WHERE id = v_joglo_id;
    END IF;

    -- Seed Second Reservation: Romantic Dinner VIP Room di Tropical Steak House
    IF v_tenant_id IS NOT NULL AND v_steak_id IS NOT NULL AND v_vip1_id IS NOT NULL THEN
        INSERT INTO reservations (
            tenant_id, outlet_id, reservation_number, customer_name, customer_phone,
            event_type, pax_count, reservation_date, start_time, end_time,
            assigned_table_id, min_spend, deposit_amount, deposit_paid, deposit_payment_method,
            status, special_requests
        ) VALUES (
            v_tenant_id, v_steak_id, 'RSV-20261026-002', 'dr. Farhan Syahputra', '085711223344',
            'BIRTHDAY_PARTY', 10, CURRENT_DATE + INTERVAL '2 day', '19:00', '21:30',
            v_vip1_id, 1200000.00, 500000.00, true, 'TRANSFER',
            'CONFIRMED', 'Ulang tahun istri, setup dekorasi bunga meja dan reserved sign di VIP room.'
        );

        UPDATE dining_tables SET status = 'RESERVED' WHERE id = v_vip1_id;
    END IF;

END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS split_bill_items CASCADE;
DROP TABLE IF EXISTS split_bills CASCADE;
DROP TABLE IF EXISTS order_payments CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
ALTER TABLE IF EXISTS dining_tables DROP CONSTRAINT IF EXISTS fk_dining_tables_active_order;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS dining_tables CASCADE;

-- +goose StatementEnd
