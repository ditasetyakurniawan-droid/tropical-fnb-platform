-- +goose Up
-- +goose StatementBegin
-- ============================================================================
-- Seed: Tropical Group Temanggung (Tropical Steak House & Tropical Garden Resto)
-- ============================================================================

DO $$
DECLARE
    v_tenant_id   uuid;
    v_steak_id    uuid;
    v_garden_id   uuid;
    v_role_owner  uuid;
    v_role_mgr    uuid;
    v_role_spv    uuid;
    v_role_cashier uuid;
    v_role_chef   uuid;
    v_role_waiter uuid;
    v_user_owner  uuid;
    v_user_spv_s  uuid;
    v_user_ksr_s  uuid;
    v_user_spv_g  uuid;
    v_user_ksr_g  uuid;
    v_pass_hash   text := '$2b$10$2DB6wqO1NnBGR2RLi8JeouoaP4Eeeh7kEdXqFNbqZRFG/dUb6/JUO'; -- Password123!
    v_pin_hash    text := '$2b$10$NyWd0pZS5hLoo4max46U0.IGM56RhzHkLwSIllrRf1qAWi1b05rM6'; -- 123456
BEGIN
    -- 1. Create Tenant: Tropical Group Temanggung
    INSERT INTO tenants (slug, name, timezone, currency, settings)
    VALUES (
        'tropical-temanggung',
        'Tropical Group Temanggung',
        'Asia/Jakarta',
        'IDR',
        '{"company_name": "PT Tropical Kuliner Sejahtera", "city": "Temanggung"}'::jsonb
    )
    ON CONFLICT (slug) WHERE deleted_at IS NULL DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_tenant_id;

    -- 2. Create Outlets: Tropical Steak House & Tropical Garden Resto
    INSERT INTO outlets (tenant_id, code, slug, name, outlet_type, tax_pb1_percent, service_charge_percent, address, latitude, longitude, geofence_radius_meters)
    VALUES (
        v_tenant_id,
        'TSH-01',
        'tropical-steak-house',
        'Tropical Steak House',
        'RESTAURANT',
        10.00,
        0.00,
        'Jl. Gatot Subroto, Karangsari, Manding, Kec. Temanggung, Kabupaten Temanggung, Jawa Tengah 56224',
        -7.307500,
        110.169700,
        150
    )
    ON CONFLICT (slug) WHERE deleted_at IS NULL DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_steak_id;

    INSERT INTO outlets (tenant_id, code, slug, name, outlet_type, tax_pb1_percent, service_charge_percent, address, latitude, longitude, geofence_radius_meters)
    VALUES (
        v_tenant_id,
        'TGR-01',
        'tropical-garden-resto',
        'Tropical Garden Resto',
        'RESTAURANT',
        10.00,
        0.00,
        'Jl. Gatot Subroto, Karangsari, Manding, Kec. Temanggung, Kabupaten Temanggung, Jawa Tengah 56224',
        -7.307500,
        110.169700,
        200
    )
    ON CONFLICT (slug) WHERE deleted_at IS NULL DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_garden_id;

    -- 3. Create System Roles
    INSERT INTO roles (tenant_id, code, name, description, is_system)
    VALUES
        (v_tenant_id, 'OWNER', 'Owner / Direksi', 'Akses penuh ke seluruh cabang dan manajemen konsolidasi grup', true),
        (v_tenant_id, 'OUTLET_MANAGER', 'Manajer Restoran', 'Pengelolaan operasional harian cabang dan approval pengeluaran', true),
        (v_tenant_id, 'SUPERVISOR', 'Supervisor Operasional', 'Otorisasi void transaksi, diskon, dan audit opname stok', true),
        (v_tenant_id, 'CASHIER', 'Kasir', 'Layanan transaksi kasir, buka/tutup shift, dan cetak struk', true),
        (v_tenant_id, 'KITCHEN_CHEF', 'Koki / Kitchen Chef', 'Layar monitor dapur KDS, persiapan resep, dan batch saus', true),
        (v_tenant_id, 'WAITER', 'Pelayan / Waiter', 'Layanan meja, order gazebo, dan pengantaran menu', true)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name;

    SELECT id INTO v_role_owner   FROM roles WHERE tenant_id = v_tenant_id AND code = 'OWNER';
    SELECT id INTO v_role_mgr     FROM roles WHERE tenant_id = v_tenant_id AND code = 'OUTLET_MANAGER';
    SELECT id INTO v_role_spv     FROM roles WHERE tenant_id = v_tenant_id AND code = 'SUPERVISOR';
    SELECT id INTO v_role_cashier FROM roles WHERE tenant_id = v_tenant_id AND code = 'CASHIER';
    SELECT id INTO v_role_chef    FROM roles WHERE tenant_id = v_tenant_id AND code = 'KITCHEN_CHEF';
    SELECT id INTO v_role_waiter  FROM roles WHERE tenant_id = v_tenant_id AND code = 'WAITER';

    -- 4. Permissions Catalog
    INSERT INTO permissions (code, module, description)
    VALUES
        ('iam.user.read', 'iam', 'Melihat daftar user dan profil'),
        ('iam.user.manage', 'iam', 'Menambah dan mengubah akun karyawan'),
        ('pos.order.create', 'pos', 'Membuat pesanan kasir / meja'),
        ('pos.order.void', 'pos', 'Membatalkan item atau transaksi (membutuhkan PIN SPV)'),
        ('pos.order.discount', 'pos', 'Memberikan diskon manual (membutuhkan PIN SPV)'),
        ('inventory.stock.view', 'inventory', 'Melihat stok gudang dan mutasi'),
        ('inventory.stock.adjust', 'inventory', 'Menyetujui penyesuaian opname stok'),
        ('recipe.costing.view', 'recipe_hpp', 'Melihat HPP dan margin menu'),
        ('finance.report.view', 'finance', 'Melihat laporan laba rugi dan margin bersih'),
        ('hr.payroll.view', 'hr_payroll', 'Melihat rekap absensi dan penggajian')
    ON CONFLICT (code) DO NOTHING;

    -- Grant all permissions to OWNER
    INSERT INTO role_permissions (role_id, permission_code)
    SELECT v_role_owner, code FROM permissions
    ON CONFLICT DO NOTHING;

    -- Grant POS permissions to CASHIER and SUPERVISOR
    INSERT INTO role_permissions (role_id, permission_code)
    VALUES
        (v_role_cashier, 'pos.order.create'),
        (v_role_spv, 'pos.order.create'),
        (v_role_spv, 'pos.order.void'),
        (v_role_spv, 'pos.order.discount'),
        (v_role_spv, 'inventory.stock.view')
    ON CONFLICT DO NOTHING;

    -- 5. Seed Users
    -- 5a. Owner (Akses Global Seluruh Outlet)
    INSERT INTO users (tenant_id, username, full_name, email, password_hash, supervisor_pin_hash, is_active)
    VALUES (
        v_tenant_id,
        'owner',
        'Budi Santoso (Owner Tropical)',
        'owner@tropicalfnb.local',
        v_pass_hash,
        v_pin_hash,
        true
    )
    ON CONFLICT (tenant_id, username) WHERE deleted_at IS NULL DO UPDATE SET password_hash = EXCLUDED.password_hash
    RETURNING id INTO v_user_owner;

    -- Role assignment Owner: outlet_id is NULL (access all outlets!)
    INSERT INTO user_role_assignments (tenant_id, user_id, role_id, outlet_id)
    VALUES (v_tenant_id, v_user_owner, v_role_owner, NULL)
    ON CONFLICT DO NOTHING;

    -- 5b. Tropical Steak House Staff
    INSERT INTO users (tenant_id, username, full_name, email, password_hash, supervisor_pin_hash, is_active)
    VALUES (
        v_tenant_id,
        'spv_steak',
        'Rian Pratama (SPV Steak)',
        'spv.steak@tropicalfnb.local',
        v_pass_hash,
        v_pin_hash,
        true
    )
    ON CONFLICT (tenant_id, username) WHERE deleted_at IS NULL DO UPDATE SET password_hash = EXCLUDED.password_hash
    RETURNING id INTO v_user_spv_s;

    INSERT INTO user_role_assignments (tenant_id, user_id, role_id, outlet_id)
    VALUES (v_tenant_id, v_user_spv_s, v_role_spv, v_steak_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO users (tenant_id, username, full_name, email, password_hash, is_active)
    VALUES (
        v_tenant_id,
        'kasir_steak',
        'Siti Rahma (Kasir Steak)',
        'kasir.steak@tropicalfnb.local',
        v_pass_hash,
        true
    )
    ON CONFLICT (tenant_id, username) WHERE deleted_at IS NULL DO UPDATE SET password_hash = EXCLUDED.password_hash
    RETURNING id INTO v_user_ksr_s;

    INSERT INTO user_role_assignments (tenant_id, user_id, role_id, outlet_id)
    VALUES (v_tenant_id, v_user_ksr_s, v_role_cashier, v_steak_id)
    ON CONFLICT DO NOTHING;

    -- 5c. Tropical Garden Resto Staff
    INSERT INTO users (tenant_id, username, full_name, email, password_hash, supervisor_pin_hash, is_active)
    VALUES (
        v_tenant_id,
        'spv_garden',
        'Agus Wijaya (SPV Garden)',
        'spv.garden@tropicalfnb.local',
        v_pass_hash,
        v_pin_hash,
        true
    )
    ON CONFLICT (tenant_id, username) WHERE deleted_at IS NULL DO UPDATE SET password_hash = EXCLUDED.password_hash
    RETURNING id INTO v_user_spv_g;

    INSERT INTO user_role_assignments (tenant_id, user_id, role_id, outlet_id)
    VALUES (v_tenant_id, v_user_spv_g, v_role_spv, v_garden_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO users (tenant_id, username, full_name, email, password_hash, is_active)
    VALUES (
        v_tenant_id,
        'kasir_garden',
        'Dewi Lestari (Kasir Garden)',
        'kasir.garden@tropicalfnb.local',
        v_pass_hash,
        true
    )
    ON CONFLICT (tenant_id, username) WHERE deleted_at IS NULL DO UPDATE SET password_hash = EXCLUDED.password_hash
    RETURNING id INTO v_user_ksr_g;

    INSERT INTO user_role_assignments (tenant_id, user_id, role_id, outlet_id)
    VALUES (v_tenant_id, v_user_ksr_g, v_role_cashier, v_garden_id)
    ON CONFLICT DO NOTHING;

END $$;
-- +goose StatementEnd

-- +goose Down
DELETE FROM users WHERE username IN ('owner', 'spv_steak', 'kasir_steak', 'spv_garden', 'kasir_garden');
DELETE FROM outlets WHERE code IN ('TSH-01', 'TGR-01');
DELETE FROM tenants WHERE slug = 'tropical-temanggung';
