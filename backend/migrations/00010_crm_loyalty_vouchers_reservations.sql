-- 00010_crm_loyalty_vouchers_reservations.sql
-- Milestone 8: Customer Relationship Management (CRM), Membership Loyalty & Poin,
-- Engine Promo & Voucher Diskon, serta Integrasi Reservasi Meja/Gazebo & Klaim DP.

-- +goose Up
-- +goose StatementBegin

-- 1. Master Pelanggan & Profil CRM (Customers)
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    phone VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150),
    membership_tier VARCHAR(32) NOT NULL DEFAULT 'BRONZE', -- BRONZE, SILVER, GOLD, TROPICAL_VIP
    points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
    lifetime_spend NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    visit_count INTEGER NOT NULL DEFAULT 0,
    birthday DATE,
    dietary_notes TEXT,
    preferences TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_customers_phone UNIQUE (tenant_id, phone),
    CONSTRAINT chk_customer_tier CHECK (membership_tier IN ('BRONZE', 'SILVER', 'GOLD', 'TROPICAL_VIP'))
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_tier ON customers(tenant_id, membership_tier);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_customers_spend ON customers(tenant_id, lifetime_spend DESC);

CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. Buku Besar Transaksi Poin Reward Pelanggan (Points Ledger)
CREATE TABLE IF NOT EXISTS customer_points_ledger (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    tx_type VARCHAR(32) NOT NULL, -- EARN, REDEEM, ADJUSTMENT, EXPIRED
    points INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_points_tx_type CHECK (tx_type IN ('EARN', 'REDEEM', 'ADJUSTMENT', 'EXPIRED'))
);

CREATE INDEX IF NOT EXISTS idx_points_cust_created ON customer_points_ledger(tenant_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_order ON customer_points_ledger(order_id);

-- 3. Master Voucher & Promo Diskon (Vouchers)
CREATE TABLE IF NOT EXISTS vouchers (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    discount_type VARCHAR(32) NOT NULL, -- PERCENTAGE, FIXED_AMOUNT
    discount_value NUMERIC(18, 2) NOT NULL,
    max_discount_amount NUMERIC(18, 2), -- Opsional, batas maksimal potongan untuk tipe PERCENTAGE
    min_purchase_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    min_membership_tier VARCHAR(32), -- Opsional: NULL (semua), atau BRONZE, SILVER, GOLD, TROPICAL_VIP
    usage_limit_total INTEGER NOT NULL DEFAULT 100,
    usage_count INTEGER NOT NULL DEFAULT 0,
    valid_from DATE NOT NULL,
    valid_until DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_vouchers_code UNIQUE (tenant_id, code),
    CONSTRAINT chk_voucher_discount_type CHECK (discount_type IN ('PERCENTAGE', 'FIXED_AMOUNT'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vouchers_code_upper ON vouchers (tenant_id, upper(code));

CREATE INDEX IF NOT EXISTS idx_vouchers_active ON vouchers(tenant_id, is_active, valid_from, valid_until);

CREATE TRIGGER vouchers_set_updated_at BEFORE UPDATE ON vouchers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Hubungkan Reservasi dengan Customer & Down Payment Claim
ALTER TABLE reservations 
    ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS dp_claim_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS dp_receipt_ref VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_reservations_cust ON reservations(tenant_id, customer_id);

-- 5. Hubungkan Orders dengan Pelanggan CRM, Voucher, Poin, dan Klaim DP Reservasi
ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS points_redeemed INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS points_discount_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS dp_claimed_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(tenant_id, customer_id);

-- ----------------------------------------------------------------------------
-- SEED DATA REAL: Master Pelanggan CRM, Loyalty Ledger, Voucher & Reservasi DP
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_tenant_id uuid;
    v_steak_id uuid;
    v_garden_id uuid;
    v_joglo_id uuid;
    v_vip1_id uuid;
    v_gz1_id uuid;
    v_gz2_id uuid;
    v_cust_farhan uuid := '0192c000-0001-7000-8000-000000000001';
    v_cust_hendro uuid := '0192c000-0001-7000-8000-000000000002';
    v_cust_ratna  uuid := '0192c000-0001-7000-8000-000000000003';
    v_cust_kevin  uuid := '0192c000-0001-7000-8000-000000000004';
    v_cust_maya   uuid := '0192c000-0001-7000-8000-000000000005';
BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'tropical-temanggung' LIMIT 1;
    SELECT id INTO v_steak_id FROM outlets WHERE slug = 'tropical-steak-house' LIMIT 1;
    SELECT id INTO v_garden_id FROM outlets WHERE slug = 'tropical-garden-resto' LIMIT 1;

    SELECT id INTO v_joglo_id FROM dining_tables WHERE table_number LIKE '%JOGLO-UTAMA%' LIMIT 1;
    SELECT id INTO v_vip1_id FROM dining_tables WHERE table_number LIKE '%VIP-01%' LIMIT 1;
    SELECT id INTO v_gz1_id FROM dining_tables WHERE table_number LIKE '%GAZEBO-01%' LIMIT 1;
    SELECT id INTO v_gz2_id FROM dining_tables WHERE table_number LIKE '%GAZEBO-02%' LIMIT 1;

    IF v_tenant_id IS NOT NULL THEN
        -- A. Seed 5 Pelanggan Nyata Temanggung
        INSERT INTO customers (
            id, tenant_id, phone, name, email, membership_tier, points_balance,
            lifetime_spend, visit_count, birthday, dietary_notes, preferences
        ) VALUES 
        (
            v_cust_farhan, v_tenant_id, '085711223344', 'dr. Farhan Syahputra', 'dr.farhan@klinikmandiri.id',
            'TROPICAL_VIP', 1245, 12450000.00, 18, '1984-11-12',
            'Alergi seafood dan udang. Tingkat kematangan daging wajib medium-rare tanpa MSG berlebih.',
            'Prioritaskan Ruang VIP AC Steak House, meja dekat vas bunga segar. Minuman favorit Avocado Coffee & Jus Jeruk Murni.'
        ),
        (
            v_cust_hendro, v_tenant_id, '081234567890', 'Bpk. Hendro (Paguyuban Temanggung)', 'hendro.paguyuban@temanggungkab.go.id',
            'GOLD', 580, 5800000.00, 8, '1975-06-20',
            'Kopi Arabika Temanggung tanpa gula, sambal terasi pedas sedang.',
            'Joglo Utama Lesehan Manding untuk gathering skala besar (30-50 pax). Menu wajib Gurame Bakar Madu & Bebek Manding.'
        ),
        (
            v_cust_ratna, v_tenant_id, '087834567891', 'Ibu Ratna Dewi', 'ratna.dewi@bca.co.id',
            'SILVER', 165, 1650000.00, 5, '1990-03-15',
            'Tidak ada pantangan alergi. Anak-anak menyukai ayam krispi saus keju.',
            'Gazebo Bambu pinggir kolam koi Garden Resto. Menyukai suasana sejuk sore hari dan Es Kelapa Jeruk Tropis.'
        ),
        (
            v_cust_kevin, v_tenant_id, '089912345678', 'Ananda Kevin', 'kevin.temanggung@gmail.com',
            'BRONZE', 38, 380000.00, 2, '2002-08-05',
            'Porsi besar, suka makanan gurih dan kentang ekstra saus.',
            'Area Outdoor Garden malam hari untuk nongkrong komunitas motor. Mocktail Sunset Breeze & Mix Platter.'
        ),
        (
            v_cust_maya, v_tenant_id, '081398765432', 'Maya Anggraini', 'maya.anggraini@bankjateng.co.id',
            'BRONZE', 19, 190000.00, 1, '1998-12-01',
            'Kurangi garam berlebih.',
            'Indoor AC Meja Sofa, Sirloin Steak Single with Blackpepper Sauce.'
        )
        ON CONFLICT (tenant_id, phone) DO UPDATE SET
            name = EXCLUDED.name,
            membership_tier = EXCLUDED.membership_tier,
            points_balance = EXCLUDED.points_balance,
            lifetime_spend = EXCLUDED.lifetime_spend,
            visit_count = EXCLUDED.visit_count;

        -- B. Seed Buku Besar Poin (Points Ledger)
        INSERT INTO customer_points_ledger (
            tenant_id, customer_id, tx_type, points, balance_after, description, created_at
        ) VALUES 
        (v_tenant_id, v_cust_farhan, 'EARN', 1200, 1200, 'Akumulasi poin 17x kunjungan VIP Steak House (Rp 10.000 = 1 Poin)', now() - INTERVAL '15 day'),
        (v_tenant_id, v_cust_farhan, 'REDEEM', -55, 1145, 'Redeem 55 poin untuk potongan kasir Rp 5.500 pada order #TRP-STK-0922', now() - INTERVAL '7 day'),
        (v_tenant_id, v_cust_farhan, 'EARN', 100, 1245, 'Poin transaksi jamuan makan malam #TRP-STK-1002 (Rp 1.000.000)', now() - INTERVAL '2 day'),
        
        (v_tenant_id, v_cust_hendro, 'EARN', 580, 580, 'Akumulasi poin dari 8x reservasi gathering paguyuban di Joglo Utama', now() - INTERVAL '10 day'),
        (v_tenant_id, v_cust_ratna, 'EARN', 165, 165, 'Akumulasi poin 5x makan keluarga di Gazebo Bambu Manding', now() - INTERVAL '5 day'),
        (v_tenant_id, v_cust_kevin, 'EARN', 38, 38, 'Akumulasi poin dari 2x pesanan nongkrong outdoor', now() - INTERVAL '3 day'),
        (v_tenant_id, v_cust_maya, 'EARN', 19, 19, 'Poin member baru dari transaksi perdana #TRP-STK-1080', now() - INTERVAL '1 day');

        -- C. Seed Vouchers Nyata Siap Pakai di POS
        INSERT INTO vouchers (
            tenant_id, code, title, description, discount_type, discount_value,
            max_discount_amount, min_purchase_amount, min_membership_tier,
            usage_limit_total, usage_count, valid_from, valid_until, is_active
        ) VALUES
        (
            v_tenant_id, 'TROPICALVIP', 'Diskon Spesial VIP Tier 15%',
            'Diskon 15% maksimal Rp 150.000 khusus member Gold & Tropical VIP.',
            'PERCENTAGE', 15.00, 150000.00, 500000.00, 'GOLD',
            50, 6, CURRENT_DATE - INTERVAL '30 day', CURRENT_DATE + INTERVAL '90 day', true
        ),
        (
            v_tenant_id, 'GATHERING100', 'Voucher Event & Gathering Rp 100K',
            'Potongan langsung Rp 100.000 untuk booking event atau rombongan min transaksi Rp 1.500.000.',
            'FIXED_AMOUNT', 100000.00, NULL, 1500000.00, NULL,
            30, 2, CURRENT_DATE - INTERVAL '10 day', CURRENT_DATE + INTERVAL '60 day', true
        ),
        (
            v_tenant_id, 'WELCOME25', 'Promo Pelanggan Baru 25%',
            'Diskon 25% maksimal Rp 25.000 khusus transaksi member baru di Tropical F&B.',
            'PERCENTAGE', 25.00, 25000.00, 80000.00, NULL,
            200, 42, CURRENT_DATE - INTERVAL '60 day', CURRENT_DATE + INTERVAL '120 day', true
        ),
        (
            v_tenant_id, 'FLAT50K', 'Potongan Makan Siang Rp 50K',
            'Potongan belanja langsung Rp 50.000 dengan minimum transaksi Rp 300.000.',
            'FIXED_AMOUNT', 50000.00, NULL, 300000.00, NULL,
            100, 15, CURRENT_DATE - INTERVAL '15 day', CURRENT_DATE + INTERVAL '45 day', true
        )
        ON CONFLICT (tenant_id, code) DO UPDATE SET
            title = EXCLUDED.title,
            discount_type = EXCLUDED.discount_type,
            discount_value = EXCLUDED.discount_value,
            min_purchase_amount = EXCLUDED.min_purchase_amount,
            is_active = EXCLUDED.is_active;

        -- D. Hubungkan Reservasi Eksisting dengan Customer ID & Bukti DP
        UPDATE reservations
        SET customer_id = v_cust_hendro,
            dp_receipt_ref = 'TRF-BCA-889123'
        WHERE reservation_number = 'RSV-20261028-001';

        UPDATE reservations
        SET customer_id = v_cust_farhan,
            dp_receipt_ref = 'TRF-MDR-441299'
        WHERE reservation_number = 'RSV-20261026-002';

        -- E. Tambahkan 2 Reservasi Nyata Baru (Gazebo Manding)
        IF v_garden_id IS NOT NULL AND v_gz1_id IS NOT NULL THEN
            INSERT INTO reservations (
                tenant_id, outlet_id, customer_id, reservation_number, customer_name, customer_phone,
                event_type, pax_count, reservation_date, start_time, end_time,
                assigned_table_id, min_spend, deposit_amount, deposit_paid, deposit_payment_method,
                dp_receipt_ref, status, special_requests
            ) VALUES (
                v_tenant_id, v_garden_id, v_cust_ratna, 'RSV-20261027-003', 'Ibu Ratna Dewi', '087834567891',
                'FAMILY_GATHERING', 8, CURRENT_DATE + INTERVAL '3 day', '12:00', '14:30',
                v_gz1_id, 600000.00, 200000.00, true, 'QRIS',
                'QRIS-BCA-771822', 'CONFIRMED', 'Arisan keluarga, minta gazebo samping kolam koi Manding dan pakan ikan untuk anak-anak.'
            )
            ON CONFLICT (tenant_id, upper(reservation_number)) DO UPDATE SET
                deposit_paid = true,
                dp_receipt_ref = EXCLUDED.dp_receipt_ref;

            UPDATE dining_tables SET status = 'RESERVED' WHERE id = v_gz1_id;
        END IF;

        IF v_garden_id IS NOT NULL AND v_gz2_id IS NOT NULL THEN
            INSERT INTO reservations (
                tenant_id, outlet_id, customer_id, reservation_number, customer_name, customer_phone,
                event_type, pax_count, reservation_date, start_time, end_time,
                assigned_table_id, min_spend, deposit_amount, deposit_paid, deposit_payment_method,
                dp_receipt_ref, status, special_requests
            ) VALUES (
                v_tenant_id, v_garden_id, v_cust_kevin, 'RSV-20261029-004', 'Ananda Kevin', '089912345678',
                'COMMUNITY_MEETING', 6, CURRENT_DATE + INTERVAL '5 day', '18:30', '21:00',
                v_gz2_id, 400000.00, 150000.00, false, NULL,
                NULL, 'PENDING_DEPOSIT', 'Kumpul santai komunitas motor, butuh colokan charger laptop dekat gazebo.'
            )
            ON CONFLICT (tenant_id, upper(reservation_number)) DO UPDATE SET
                status = 'PENDING_DEPOSIT';
        END IF;

    END IF;
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE orders
    DROP COLUMN IF EXISTS reservation_id CASCADE,
    DROP COLUMN IF EXISTS dp_claimed_amount CASCADE,
    DROP COLUMN IF EXISTS points_discount_amount CASCADE,
    DROP COLUMN IF EXISTS points_redeemed CASCADE,
    DROP COLUMN IF EXISTS voucher_code CASCADE,
    DROP COLUMN IF EXISTS customer_id CASCADE;

ALTER TABLE reservations
    DROP COLUMN IF EXISTS dp_receipt_ref CASCADE,
    DROP COLUMN IF EXISTS dp_claim_order_id CASCADE,
    DROP COLUMN IF EXISTS customer_id CASCADE;

DROP TABLE IF EXISTS vouchers CASCADE;
DROP TABLE IF EXISTS customer_points_ledger CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

-- +goose StatementEnd
