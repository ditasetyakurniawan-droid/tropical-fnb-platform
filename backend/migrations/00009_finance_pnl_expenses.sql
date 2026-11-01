-- 00009_finance_pnl_expenses.sql
-- Milestone 7: Modul Keuangan, Laporan Laba Rugi (P&L), Expense Tracker (OPEX), dan Break-Even Point (BEP)

-- +goose Up

-- 1. Master Kategori Biaya Operasional (OPEX Categories)
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exp_cat_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_exp_cat_tenant ON expense_categories(tenant_id);

-- 2. Buku Besar Transaksi Biaya Operasional (Operating Expenses Ledger)
CREATE TABLE IF NOT EXISTS operating_expenses (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL, -- NULL = Konsolidasi / Kantor Pusat Manding
    category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    title VARCHAR(200) NOT NULL,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(30) NOT NULL DEFAULT 'PETTY_CASH', -- PETTY_CASH, BANK_TRANSFER, CORPORATE_CARD
    receipt_ref VARCHAR(64), -- Nomor Nota / Kwitansi Fisik
    recorded_by_name VARCHAR(100) NOT NULL,
    approved_by_name VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED', -- DRAFT, CONFIRMED, VOID
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opex_date ON operating_expenses(tenant_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_opex_outlet ON operating_expenses(tenant_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_opex_cat ON operating_expenses(category_id);

-- 3. Seed Default Master Kategori Biaya Operasional Resto
INSERT INTO expense_categories (id, tenant_id, code, name, description)
SELECT 
    '0192b000-0001-7000-8000-000000000001',
    t.id,
    'EXP-UTIL',
    'Utilitas & Energi (Listrik PLN & Gas LPG)',
    'Tagihan token listrik PLN, isi ulang tabung gas LPG 50kg/12kg untuk kompor grill dan wok, serta air PDAM'
FROM tenants t
WHERE t.slug = 'tropical-temanggung'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO expense_categories (id, tenant_id, code, name, description)
SELECT 
    '0192b000-0001-7000-8000-000000000002',
    t.id,
    'EXP-MAINT',
    'Perawatan Fasilitas, Kolam Koi & Gazebo',
    'Bahan perawatan air & pakan ikan kolam koi, pupuk tanaman gazebo Manding, perbaikan meja/kursi, servis chiller'
FROM tenants t
WHERE t.slug = 'tropical-temanggung'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO expense_categories (id, tenant_id, code, name, description)
SELECT 
    '0192b000-0001-7000-8000-000000000003',
    t.id,
    'EXP-CONSUM',
    'Bahan Habis Pakai & Packaging',
    'Box takeaway ramah lingkungan, kantong kresek oxo-biodegradable, sabun cuci piring resto, klorin sanitasi, tisu meja'
FROM tenants t
WHERE t.slug = 'tropical-temanggung'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO expense_categories (id, tenant_id, code, name, description)
SELECT 
    '0192b000-0001-7000-8000-000000000004',
    t.id,
    'EXP-MKT',
    'Marketing, Iklan & Promosi Digital',
    'Iklan Instagram/TikTok Ads lokal Temanggung, cetak standing banner promo akhir pekan, sponsorship event gathering'
FROM tenants t
WHERE t.slug = 'tropical-temanggung'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO expense_categories (id, tenant_id, code, name, description)
SELECT 
    '0192b000-0001-7000-8000-000000000005',
    t.id,
    'EXP-RENT',
    'Sewa Properti & Retribusi Daerah',
    'Alokasi biaya sewa lahan Manding dan retribusi kebersihan/keamanan lingkungan'
FROM tenants t
WHERE t.slug = 'tropical-temanggung'
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO expense_categories (id, tenant_id, code, name, description)
SELECT 
    '0192b000-0001-7000-8000-000000000006',
    t.id,
    'EXP-ADM',
    'Administrasi, Internet & Lisensi Software',
    'Internet dedicated fiber optic 100 Mbps resto, kertas thermal kasir 80mm, alat tulis kantor, dan perizinan legal'
FROM tenants t
WHERE t.slug = 'tropical-temanggung'
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 4. Seed Real Cases Biaya Operasional (Bulan Berjalan Oktober 2026)
INSERT INTO operating_expenses (
    id, tenant_id, outlet_id, category_id, expense_date, title, amount, payment_method, receipt_ref, recorded_by_name, approved_by_name, status, notes
)
SELECT 
    '0192b000-0002-7000-8000-000000000001',
    t.id,
    o_tsh.id,
    '0192b000-0001-7000-8000-000000000001',
    '2026-10-24',
    'Pengisian 4 Tabung Gas LPG 50kg Dapur Steak & Central Kitchen',
    2480000.00,
    'BANK_TRANSFER',
    'INV-LPG-TMG-8812',
    'Agus Supriyanto',
    'Budi Santoso (Owner)',
    'CONFIRMED',
    'Pasokan gas kompor grill lava rock dan steamer central kitchen untuk kebutuhan 2 minggu operasional'
FROM tenants t
JOIN outlets o_tsh ON o_tsh.tenant_id = t.id AND o_tsh.code = 'TSH-01'
WHERE t.slug = 'tropical-temanggung'
ON CONFLICT DO NOTHING;

INSERT INTO operating_expenses (
    id, tenant_id, outlet_id, category_id, expense_date, title, amount, payment_method, receipt_ref, recorded_by_name, approved_by_name, status, notes
)
SELECT 
    '0192b000-0002-7000-8000-000000000002',
    t.id,
    o_tgr.id,
    '0192b000-0001-7000-8000-000000000001',
    '2026-10-23',
    'Token Listrik PLN Manding Resto & Pompa Kolam 11.000 VA',
    1850000.00,
    'BANK_TRANSFER',
    'PLN-KW-991204',
    'Agus Supriyanto',
    'Budi Santoso (Owner)',
    'CONFIRMED',
    'Pembelian token listrik utama untuk operasional lampu gazebo, dapur outdoor, dan sirkulasi kolam'
FROM tenants t
JOIN outlets o_tgr ON o_tgr.tenant_id = t.id AND o_tgr.code = 'TGR-01'
WHERE t.slug = 'tropical-temanggung'
ON CONFLICT DO NOTHING;

INSERT INTO operating_expenses (
    id, tenant_id, outlet_id, category_id, expense_date, title, amount, payment_method, receipt_ref, recorded_by_name, approved_by_name, status, notes
)
SELECT 
    '0192b000-0002-7000-8000-000000000003',
    t.id,
    o_tgr.id,
    '0192b000-0001-7000-8000-000000000002',
    '2026-10-22',
    'Perawatan Kolam Koi, Pembelian Pakan Premium & Obat Air Ozon',
    650000.00,
    'PETTY_CASH',
    'NOTA-AQUA-551',
    'Siti Aminah',
    'Budi Santoso (Owner)',
    'CONFIRMED',
    'Pakan apung protein 42% untuk 150 ekor koi kolam tengah gazebo Manding dan bakteri starter filter biologis'
FROM tenants t
JOIN outlets o_tgr ON o_tgr.tenant_id = t.id AND o_tgr.code = 'TGR-01'
WHERE t.slug = 'tropical-temanggung'
ON CONFLICT DO NOTHING;

INSERT INTO operating_expenses (
    id, tenant_id, outlet_id, category_id, expense_date, title, amount, payment_method, receipt_ref, recorded_by_name, approved_by_name, status, notes
)
SELECT 
    '0192b000-0002-7000-8000-000000000004',
    t.id,
    NULL, -- Konsolidasi Group
    '0192b000-0001-7000-8000-000000000003',
    '2026-10-20',
    'Pengadaan Box Kraft Takeaway Steak & Tas Spunbond Ramah Lingkungan (1.000 Pcs)',
    820000.00,
    'BANK_TRANSFER',
    'KW-PACK-8802',
    'Dewi Lestari',
    'Budi Santoso (Owner)',
    'CONFIRMED',
    'Packaging takeaway anti bocor dengan sablon logo Tropical F&B untuk pesanan bawa pulang'
FROM tenants t
WHERE t.slug = 'tropical-temanggung'
ON CONFLICT DO NOTHING;

INSERT INTO operating_expenses (
    id, tenant_id, outlet_id, category_id, expense_date, title, amount, payment_method, receipt_ref, recorded_by_name, approved_by_name, status, notes
)
SELECT 
    '0192b000-0002-7000-8000-000000000005',
    t.id,
    NULL, -- Konsolidasi Group
    '0192b000-0001-7000-8000-000000000006',
    '2026-10-18',
    'Langganan Dedicated Internet Fiber Optic Resto 100 Mbps',
    550000.00,
    'BANK_TRANSFER',
    'INV-TEL-99812',
    'Dewi Lestari',
    'Budi Santoso (Owner)',
    'CONFIRMED',
    'Koneksi internet dedicated untuk Cloud POS, KDS Dapur, Tablet Absensi GPS, dan Free Wi-Fi tamu'
FROM tenants t
WHERE t.slug = 'tropical-temanggung'
ON CONFLICT DO NOTHING;

INSERT INTO operating_expenses (
    id, tenant_id, outlet_id, category_id, expense_date, title, amount, payment_method, receipt_ref, recorded_by_name, approved_by_name, status, notes
)
SELECT 
    '0192b000-0002-7000-8000-000000000006',
    t.id,
    NULL, -- Konsolidasi Group
    '0192b000-0001-7000-8000-000000000004',
    '2026-10-15',
    'Kampanye Iklan Instagram & Google Maps Ads Spesial Weekend Manding',
    750000.00,
    'CORPORATE_CARD',
    'META-ADS-881923',
    'Dewi Lestari',
    'Budi Santoso (Owner)',
    'CONFIRMED',
    'Promosi gathering keluarga dan reservasi gazebo akhir pekan area Temanggung, Magelang, Wonosobo'
FROM tenants t
WHERE t.slug = 'tropical-temanggung'
ON CONFLICT DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS operating_expenses CASCADE;
DROP TABLE IF EXISTS expense_categories CASCADE;
