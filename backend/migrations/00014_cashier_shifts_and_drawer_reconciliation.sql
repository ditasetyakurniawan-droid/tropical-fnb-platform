-- +goose Up
-- +goose StatementBegin

-- 1. Sesi Shift Kasir & Rekonsiliasi Laci Uang (Cashier Shifts)
CREATE TABLE IF NOT EXISTS cashier_shifts (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    shift_number VARCHAR(64) NOT NULL,
    cashier_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    supervisor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    shift_name VARCHAR(50) NOT NULL DEFAULT 'SHIFT_PAGI', -- SHIFT_PAGI, SHIFT_SORE, SHIFT_FULL
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- OPEN, CLOSED
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    opening_cash NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    expected_cash NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    actual_cash NUMERIC(18, 2),
    cash_difference NUMERIC(18, 2) DEFAULT 0.00,
    total_transactions INTEGER NOT NULL DEFAULT 0,
    gross_sales NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    discounts NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    net_sales NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    tax_pb1 NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    service_charge NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    payment_cash NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    payment_qris NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    payment_card NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    payment_transfer NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    total_paid_in NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    total_paid_out NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT chk_shift_status CHECK (status IN ('OPEN', 'CLOSED')),
    CONSTRAINT chk_opening_cash CHECK (opening_cash >= 0),
    CONSTRAINT uq_shift_number UNIQUE (tenant_id, shift_number)
);

CREATE INDEX IF NOT EXISTS idx_shift_outlet_status ON cashier_shifts (tenant_id, outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_shift_cashier ON cashier_shifts (tenant_id, cashier_user_id);

CREATE TRIGGER cashier_shifts_set_updated_at BEFORE UPDATE ON cashier_shifts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. Kas Masuk / Keluar Laci Kasir (Pay-In / Pay-Out Petty Cash)
CREATE TABLE IF NOT EXISTS cashier_shift_cash_movements (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    shift_id UUID NOT NULL REFERENCES cashier_shifts(id) ON DELETE CASCADE,
    movement_type VARCHAR(20) NOT NULL, -- PAID_IN, PAID_OUT
    amount NUMERIC(18, 2) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    authorized_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_movement_type CHECK (movement_type IN ('PAID_IN', 'PAID_OUT')),
    CONSTRAINT chk_movement_amount CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_shift_movements ON cashier_shift_cash_movements (tenant_id, shift_id);

-- 3. Link Orders to Active Shift
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES cashier_shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_shift_id ON orders (tenant_id, shift_id);

-- 4. Permissions Catalog for Shift Management
INSERT INTO permissions (code, module, description) VALUES
    ('pos.shift.open', 'pos', 'Membuka shift kasir dan input modal awal laci'),
    ('pos.shift.close', 'pos', 'Menutup shift kasir, hitung uang fisik laci dan cetak Z-Report'),
    ('pos.shift.view', 'pos', 'Melihat status shift kasir aktif dan cetak X-Report')
ON CONFLICT (code) DO NOTHING;

-- Grant permissions to OWNER, OUTLET_MANAGER, SUPERVISOR, and CASHIER
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'CASHIER')
  AND p.code IN ('pos.shift.open', 'pos.shift.close', 'pos.shift.view')
ON CONFLICT DO NOTHING;

-- 5. Seed an initial OPEN shift for today for Tropical Steak House cashier so POS is immediately active
DO $$
DECLARE
    v_tenant_id UUID;
    v_steak_id UUID;
    v_garden_id UUID;
    v_user_ksr_s UUID;
    v_user_ksr_g UUID;
    v_user_spv_s UUID;
    v_shift_s_id UUID;
    v_shift_g_id UUID;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
    SELECT id INTO v_steak_id FROM outlets WHERE tenant_id = v_tenant_id AND code = 'TSH-01' LIMIT 1;
    SELECT id INTO v_garden_id FROM outlets WHERE tenant_id = v_tenant_id AND code = 'TGR-01' LIMIT 1;
    SELECT id INTO v_user_ksr_s FROM users WHERE tenant_id = v_tenant_id AND username = 'kasir_steak' LIMIT 1;
    SELECT id INTO v_user_ksr_g FROM users WHERE tenant_id = v_tenant_id AND username = 'kasir_garden' LIMIT 1;
    SELECT id INTO v_user_spv_s FROM users WHERE tenant_id = v_tenant_id AND username = 'spv_steak' LIMIT 1;

    IF v_steak_id IS NOT NULL AND v_user_ksr_s IS NOT NULL THEN
        INSERT INTO cashier_shifts (
            tenant_id, outlet_id, shift_number, cashier_user_id, supervisor_user_id,
            shift_name, status, opened_at, opening_cash, expected_cash,
            total_transactions, gross_sales, net_sales, tax_pb1, payment_cash
        ) VALUES (
            v_tenant_id, v_steak_id, 'SHF-TSH-' || to_char(now(), 'YYYYMMDD') || '-001',
            v_user_ksr_s, v_user_spv_s, 'SHIFT_PAGI', 'OPEN', now() - INTERVAL '4 hours',
            250000.00, 250000.00, 0, 0, 0, 0, 0
        )
        ON CONFLICT (tenant_id, shift_number) DO NOTHING
        RETURNING id INTO v_shift_s_id;

        -- Associate existing open orders of TSH to this shift
        IF v_shift_s_id IS NOT NULL THEN
            UPDATE orders SET shift_id = v_shift_s_id WHERE tenant_id = v_tenant_id AND outlet_id = v_steak_id AND shift_id IS NULL;
        END IF;
    END IF;

    IF v_garden_id IS NOT NULL AND v_user_ksr_g IS NOT NULL THEN
        INSERT INTO cashier_shifts (
            tenant_id, outlet_id, shift_number, cashier_user_id, supervisor_user_id,
            shift_name, status, opened_at, opening_cash, expected_cash,
            total_transactions, gross_sales, net_sales, tax_pb1, payment_cash
        ) VALUES (
            v_tenant_id, v_garden_id, 'SHF-TGR-' || to_char(now(), 'YYYYMMDD') || '-001',
            v_user_ksr_g, NULL, 'SHIFT_PAGI', 'OPEN', now() - INTERVAL '3 hours',
            200000.00, 200000.00, 0, 0, 0, 0, 0
        )
        ON CONFLICT (tenant_id, shift_number) DO NOTHING
        RETURNING id INTO v_shift_g_id;

        IF v_shift_g_id IS NOT NULL THEN
            UPDATE orders SET shift_id = v_shift_g_id WHERE tenant_id = v_tenant_id AND outlet_id = v_garden_id AND shift_id IS NULL;
        END IF;
    END IF;
END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE orders DROP COLUMN IF EXISTS shift_id;
DROP TABLE IF EXISTS cashier_shift_cash_movements;
DROP TABLE IF EXISTS cashier_shifts;
DELETE FROM role_permissions WHERE permission_code IN ('pos.shift.open', 'pos.shift.close', 'pos.shift.view');
DELETE FROM permissions WHERE code IN ('pos.shift.open', 'pos.shift.close', 'pos.shift.view');
-- +goose StatementEnd
