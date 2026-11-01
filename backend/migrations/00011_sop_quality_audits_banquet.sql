-- 00011_sop_quality_audits_banquet.sql
-- Milestone 9: Digitalisasi SOP Harian, Kontrol Kualitas Mutu (Quality Audit Scorecard)
-- & Engine Banquet Reservasi Event Jamuan (Paket Prasmanan, Pre-Order & Kitchen Prep).

-- +goose Up
-- +goose StatementBegin

-- 1. Master Template SOP Operasional (SOP Templates)
CREATE TABLE IF NOT EXISTS sop_templates (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE, -- NULL means applicable across all outlets
    code VARCHAR(50) NOT NULL,
    title VARCHAR(150) NOT NULL,
    station VARCHAR(50) NOT NULL, -- GRILL_STEAK, DAPUR_NUSANTARA, BAR_MINUMAN, FOH_GAZEBO, KASIR_SAFETY, CLEANING_TAMAN
    shift_phase VARCHAR(32) NOT NULL, -- OPENING, HANDOVER, CLOSING
    description TEXT,
    estimated_duration_minutes INTEGER NOT NULL DEFAULT 15,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_sop_templates_code UNIQUE (tenant_id, code),
    CONSTRAINT chk_sop_shift_phase CHECK (shift_phase IN ('OPENING', 'HANDOVER', 'CLOSING'))
);

CREATE INDEX IF NOT EXISTS idx_sop_templates_tenant_station ON sop_templates(tenant_id, station, shift_phase);

CREATE TRIGGER sop_templates_set_updated_at BEFORE UPDATE ON sop_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. Detail Item Tugas Standar SOP (SOP Template Items)
CREATE TABLE IF NOT EXISTS sop_template_items (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    template_id UUID NOT NULL REFERENCES sop_templates(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 1,
    task_name VARCHAR(200) NOT NULL,
    task_instruction TEXT,
    requires_photo BOOLEAN NOT NULL DEFAULT false,
    requires_numeric_input BOOLEAN NOT NULL DEFAULT false,
    numeric_unit VARCHAR(20),
    min_val NUMERIC(10, 2),
    max_val NUMERIC(10, 2),
    is_critical BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sop_template_items_order ON sop_template_items(template_id, sort_order);

-- 3. Sesi Checklist Harian Lapangan (SOP Checklist Runs)
CREATE TABLE IF NOT EXISTS sop_checklist_runs (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    template_id UUID NOT NULL REFERENCES sop_templates(id) ON DELETE RESTRICT,
    run_date DATE NOT NULL DEFAULT CURRENT_DATE,
    shift_name VARCHAR(32) NOT NULL DEFAULT 'SHIFT_PAGI', -- SHIFT_PAGI, SHIFT_SORE, SHIFT_MIDDLE
    assigned_to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    supervisor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, COMPLETED, FLAGGED_ISSUE
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    total_items INTEGER NOT NULL DEFAULT 0,
    completed_items INTEGER NOT NULL DEFAULT 0,
    flagged_items INTEGER NOT NULL DEFAULT 0,
    supervisor_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_sop_run_status CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FLAGGED_ISSUE'))
);

CREATE INDEX IF NOT EXISTS idx_sop_runs_tenant_outlet_date ON sop_checklist_runs(tenant_id, outlet_id, run_date);

CREATE TRIGGER sop_checklist_runs_set_updated_at BEFORE UPDATE ON sop_checklist_runs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Rekaman Jawaban & Bukti Checklist Lapangan (SOP Item Records)
CREATE TABLE IF NOT EXISTS sop_checklist_item_records (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    run_id UUID NOT NULL REFERENCES sop_checklist_runs(id) ON DELETE CASCADE,
    template_item_id UUID NOT NULL REFERENCES sop_template_items(id) ON DELETE CASCADE,
    is_checked BOOLEAN NOT NULL DEFAULT false,
    numeric_actual_value NUMERIC(10, 2),
    is_within_range BOOLEAN NOT NULL DEFAULT true,
    photo_url TEXT,
    notes TEXT,
    flagged BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sop_item_records_run ON sop_checklist_item_records(run_id);

-- 5. Rapor Inspeksi & Audit Mutu Cabang (Quality Audits)
CREATE TABLE IF NOT EXISTS quality_audits (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
    audit_number VARCHAR(50) NOT NULL,
    auditor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    audit_date DATE NOT NULL DEFAULT CURRENT_DATE,
    audit_type VARCHAR(32) NOT NULL DEFAULT 'ROUTINE_WEEKLY', -- ROUTINE_WEEKLY, SURPRISE_INSPECTION, MYSTERY_SHOPPER
    score_food_quality NUMERIC(5, 2) NOT NULL DEFAULT 100.00 CHECK (score_food_quality >= 0 AND score_food_quality <= 100),
    score_service_speed NUMERIC(5, 2) NOT NULL DEFAULT 100.00 CHECK (score_service_speed >= 0 AND score_service_speed <= 100),
    score_cleanliness NUMERIC(5, 2) NOT NULL DEFAULT 100.00 CHECK (score_cleanliness >= 0 AND score_cleanliness <= 100),
    score_safety_equipment NUMERIC(5, 2) NOT NULL DEFAULT 100.00 CHECK (score_safety_equipment >= 0 AND score_safety_equipment <= 100),
    total_weighted_score NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    overall_grade VARCHAR(32) NOT NULL DEFAULT 'A_EXCELLENT', -- A_EXCELLENT, B_GOOD, C_NEEDS_IMPROVEMENT, D_CRITICAL
    summary_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_quality_audits_num UNIQUE (tenant_id, audit_number),
    CONSTRAINT chk_quality_audit_grade CHECK (overall_grade IN ('A_EXCELLENT', 'B_GOOD', 'C_NEEDS_IMPROVEMENT', 'D_CRITICAL'))
);

CREATE INDEX IF NOT EXISTS idx_quality_audits_tenant_outlet ON quality_audits(tenant_id, outlet_id, audit_date DESC);

CREATE TRIGGER quality_audits_set_updated_at BEFORE UPDATE ON quality_audits
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. Tiket Tindakan Korektif Audit (Audit Action Items)
CREATE TABLE IF NOT EXISTS audit_action_items (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    audit_id UUID NOT NULL REFERENCES quality_audits(id) ON DELETE CASCADE,
    area VARCHAR(100) NOT NULL,
    issue_description TEXT NOT NULL,
    severity VARCHAR(32) NOT NULL DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, CRITICAL
    corrective_action TEXT NOT NULL,
    assigned_to_role VARCHAR(50) NOT NULL DEFAULT 'STORE_MANAGER',
    due_date DATE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN', -- OPEN, IN_PROGRESS, RESOLVED
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_audit_action_status CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED'))
);

CREATE INDEX IF NOT EXISTS idx_audit_action_status ON audit_action_items(audit_id, status);

-- 7. Master Paket Prasmanan & Banquet Event (Banquet Packages)
CREATE TABLE IF NOT EXISTS banquet_packages (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    min_pax INTEGER NOT NULL DEFAULT 20 CHECK (min_pax >= 1),
    price_per_pax NUMERIC(18, 2) NOT NULL CHECK (price_per_pax >= 0),
    category VARCHAR(32) NOT NULL DEFAULT 'BUFFET_PRASMANAN', -- BUFFET_PRASMANAN, VIP_SET_MENU, COFFEE_BREAK, CUSTOM_BANQUET
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_banquet_packages_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_banquet_packages_tenant ON banquet_packages(tenant_id, category);

CREATE TRIGGER banquet_packages_set_updated_at BEFORE UPDATE ON banquet_packages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 8. Komposisi Menu di Dalam Paket Prasmanan (Banquet Package Items)
CREATE TABLE IF NOT EXISTS banquet_package_items (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    package_id UUID NOT NULL REFERENCES banquet_packages(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    dish_course VARCHAR(32) NOT NULL DEFAULT 'MAIN_COURSE', -- APPETIZER, MAIN_COURSE, DESSERT, BEVERAGE
    portion_multiplier NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banquet_items_pkg ON banquet_package_items(package_id);

-- 9. Modifikasi Tabel Reservasi untuk Mendukung Banquet & Kitchen Prep
ALTER TABLE reservations 
    ADD COLUMN IF NOT EXISTS banquet_package_id UUID REFERENCES banquet_packages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS kitchen_prep_status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
    ADD COLUMN IF NOT EXISTS layout_setup_notes TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_reminder_sent_at TIMESTAMPTZ;

-- 10. Daftar Pre-Order Makanan/Minuman Jamuan pada Reservasi (Reservation Preorders)
CREATE TABLE IF NOT EXISTS reservation_preorders (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
    banquet_package_id UUID REFERENCES banquet_packages(id) ON DELETE SET NULL,
    item_name VARCHAR(150) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    unit_price NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    total_price NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    serving_stage VARCHAR(32) NOT NULL DEFAULT 'BUFFET_MAIN', -- WELCOME_DRINK, STARTER, BUFFET_MAIN, CLOSING_DESSERT
    kitchen_prep_station VARCHAR(32) NOT NULL DEFAULT 'KITCHEN', -- GRILL, KITCHEN, BAR
    prep_status VARCHAR(32) NOT NULL DEFAULT 'QUEUED', -- QUEUED, IN_PREP, READY_FOR_EVENT
    special_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_res_preorders_res_id ON reservation_preorders(reservation_id);

-- ============================================================================
-- SEED DATA: Template SOP, Checklist Harian, Audit Mutu, & Paket Prasmanan
-- ============================================================================
DO $$
DECLARE
    v_tenant_id UUID;
    v_steak_id  UUID;
    v_garden_id UUID;
    v_mgr_steak UUID;
    v_spv_steak UUID;
    v_spv_garden UUID;
    v_kasir_garden UUID;

    v_tmpl_grill_id  UUID;
    v_tmpl_gazebo_id UUID;
    v_tmpl_cashier_id UUID;
    v_tmpl_closing_id UUID;

    v_item_g1 UUID;
    v_item_g2 UUID;
    v_item_g3 UUID;
    v_item_g4 UUID;

    v_item_gz1 UUID;
    v_item_gz2 UUID;
    v_item_gz3 UUID;

    v_run_grill_id UUID;
    v_run_gazebo_id UUID;

    v_audit_id UUID;

    v_pkg_nusantara_id UUID;
    v_pkg_steak_vip_id UUID;
    v_pkg_arisan_id    UUID;

    v_item_tenderloin UUID;
    v_item_gurame     UUID;
    v_item_ayam       UUID;
    v_item_ribeye     UUID;

    v_res_hendro_id   UUID;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'tropical-temanggung';
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'Tenant tropical-temanggung not found, skipping seed';
        RETURN;
    END IF;

    SELECT id INTO v_steak_id FROM outlets WHERE tenant_id = v_tenant_id AND code = 'TSH-01';
    SELECT id INTO v_garden_id FROM outlets WHERE tenant_id = v_tenant_id AND code = 'TGR-01';
    SELECT id INTO v_mgr_steak FROM users WHERE tenant_id = v_tenant_id AND username = 'manager_steak';
    SELECT id INTO v_spv_steak FROM users WHERE tenant_id = v_tenant_id AND username = 'spv_steak';
    SELECT id INTO v_spv_garden FROM users WHERE tenant_id = v_tenant_id AND username = 'spv_garden';
    SELECT id INTO v_kasir_garden FROM users WHERE tenant_id = v_tenant_id AND username = 'kasir_garden';
    SELECT id INTO v_res_hendro_id FROM reservations WHERE tenant_id = v_tenant_id AND reservation_number = 'RSV-20261028-001' LIMIT 1;

    -- Query beberapa menu_items untuk dikaitkan ke banquet
    SELECT id INTO v_item_tenderloin FROM menu_items WHERE tenant_id = v_tenant_id AND name LIKE '%Tenderloin%' LIMIT 1;
    SELECT id INTO v_item_ribeye FROM menu_items WHERE tenant_id = v_tenant_id AND name LIKE '%Ribeye%' LIMIT 1;
    SELECT id INTO v_item_gurame FROM menu_items WHERE tenant_id = v_tenant_id AND name LIKE '%Gurame%' LIMIT 1;
    SELECT id INTO v_item_ayam FROM menu_items WHERE tenant_id = v_tenant_id AND name LIKE '%Ayam Bakar%' LIMIT 1;

    -- A. SOP TEMPLATES
    -- 1. SOP Opening Dapur Grill & Butchering
    INSERT INTO sop_templates (
        id, tenant_id, outlet_id, code, title, station, shift_phase, description, estimated_duration_minutes
    ) VALUES (
        uuidv7(), v_tenant_id, v_steak_id, 'SOP-GRILL-OPEN',
        'SOP Opening Dapur Grill & Butchering Steak',
        'GRILL_STEAK', 'OPENING',
        'Pengecekan temperatur cold storage daging, sanitasi panggangan, dan kesiapan marinasi meltique.', 20
    ) RETURNING id INTO v_tmpl_grill_id;

    -- Items Dapur Grill
    INSERT INTO sop_template_items (id, template_id, sort_order, task_name, task_instruction, requires_photo, requires_numeric_input, numeric_unit, min_val, max_val, is_critical)
    VALUES 
    (uuidv7(), v_tmpl_grill_id, 1, 'Pemeriksaan Suhu Chiller Daging', 'Ukur suhu chiller daging primer. Pastikan berada di rentang 0°C s/d 4°C untuk menjaga higienitas dan kesegaran daging.', true, true, '°C', 0.00, 4.00, true)
    RETURNING id INTO v_item_g1;

    INSERT INTO sop_template_items (id, template_id, sort_order, task_name, task_instruction, requires_photo, requires_numeric_input, numeric_unit, min_val, max_val, is_critical)
    VALUES 
    (uuidv7(), v_tmpl_grill_id, 2, 'Pemeriksaan Suhu Freezer Daging Beku', 'Pastikan suhu freezer penyimpanan daging -18°C s/d -22°C.', true, true, '°C', -22.00, -18.00, true)
    RETURNING id INTO v_item_g2;

    INSERT INTO sop_template_items (id, template_id, sort_order, task_name, task_instruction, requires_photo, requires_numeric_input, is_critical)
    VALUES 
    (uuidv7(), v_tmpl_grill_id, 3, 'Sanitasi Talenan & Pisau Butchering', 'Rendam talenan khusus daging merah dalam larutan sanitiser food-grade selama 5 menit.', false, false, false)
    RETURNING id INTO v_item_g3;

    INSERT INTO sop_template_items (id, template_id, sort_order, task_name, task_instruction, requires_photo, requires_numeric_input, is_critical)
    VALUES 
    (uuidv7(), v_tmpl_grill_id, 4, 'Cek Kesiapan Saus Batch (Mushroom & BBQ)', 'Pastikan stok saus Level 2 minimal 3 Liter telah dipanaskan pada bain-marie suhu 65°C.', false, false, false)
    RETURNING id INTO v_item_g4;

    -- 2. SOP Opening Gazebo Manding & Kolam Koi
    INSERT INTO sop_templates (
        id, tenant_id, outlet_id, code, title, station, shift_phase, description, estimated_duration_minutes
    ) VALUES (
        uuidv7(), v_tenant_id, v_garden_id, 'SOP-GAZEBO-OPEN',
        'SOP Opening Area Gazebo Manding & Kolam Koi',
        'FOH_GAZEBO', 'OPENING',
        'Pengecekan kebersihan 10 saung gazebo, sirkulasi kolam koi, dan keselamatan arena bermain anak.', 25
    ) RETURNING id INTO v_tmpl_gazebo_id;

    INSERT INTO sop_template_items (id, template_id, sort_order, task_name, task_instruction, requires_photo, requires_numeric_input, is_critical)
    VALUES 
    (uuidv7(), v_tmpl_gazebo_id, 1, 'Sanitasi Karpet & Meja Lesehan Gazebo 1-10', 'Sapu dan lap meja gazebo dengan disinfektan wangi serai. Pastikan tidak ada remah makanan atau abu rokok.', true, false, false)
    RETURNING id INTO v_item_gz1;

    INSERT INTO sop_template_items (id, template_id, sort_order, task_name, task_instruction, requires_photo, requires_numeric_input, is_critical)
    VALUES 
    (uuidv7(), v_tmpl_gazebo_id, 2, 'Cek Kejernihan Air & Pemberian Pakan Kolam Koi', 'Pastikan pompa sirkulasi aktif dan berikan pakan pelet takaran 200 gram pada kolam koi utama.', true, false, false)
    RETURNING id INTO v_item_gz2;

    INSERT INTO sop_template_items (id, template_id, sort_order, task_name, task_instruction, requires_photo, requires_numeric_input, is_critical)
    VALUES 
    (uuidv7(), v_tmpl_gazebo_id, 3, 'Inspeksi Kebersihan & Keamanan Playground Anak', 'Periksa tidak ada baut longgar pada ayunan/perosotan dan pastikan rumput sintetis kering.', false, false, true)
    RETURNING id INTO v_item_gz3;

    -- 3. SOP Opening Kasir & Safety Resto
    INSERT INTO sop_templates (
        id, tenant_id, outlet_id, code, title, station, shift_phase, description, estimated_duration_minutes
    ) VALUES (
        uuidv7(), v_tenant_id, v_garden_id, 'SOP-CASHIER-OPEN',
        'SOP Opening Kasir & Safety Resto',
        'KASIR_SAFETY', 'OPENING',
        'Hitung modal uang tunai laci kasir (cash float), tes printer thermal POS, dan cek tabung gas.', 15
    ) RETURNING id INTO v_tmpl_cashier_id;

    INSERT INTO sop_template_items (template_id, sort_order, task_name, task_instruction, requires_photo, requires_numeric_input, numeric_unit, min_val, max_val, is_critical)
    VALUES 
    (v_tmpl_cashier_id, 1, 'Hitung Modal Kas Fisik Laci Kasir (Cash Float)', 'Pastikan modal kasir pas Rp 500.000 dengan pecahan kecil lengkap untuk kembalian.', false, true, 'Rp', 500000.00, 500000.00, true),
    (v_tmpl_cashier_id, 2, 'Tes Cetak & Kertas Roll Printer Struk POS', 'Cetak test print pada printer kasir dan printer dapur station.', false, false, NULL, NULL, NULL, false),
    (v_tmpl_cashier_id, 3, 'Pemeriksaan Tabung Gas LPG 50kg Dapur', 'Periksa regulator tidak berbunyi mendesis dan indikator jarum tekanan gas di zona hijau.', true, false, NULL, NULL, NULL, true);

    -- 4. SOP Closing & Handover Resto
    INSERT INTO sop_templates (
        id, tenant_id, outlet_id, code, title, station, shift_phase, description, estimated_duration_minutes
    ) VALUES (
        uuidv7(), v_tenant_id, NULL, 'SOP-CLOSING-STORE',
        'SOP Closing Shift Malam & Keamanan Resto',
        'KASIR_SAFETY', 'CLOSING',
        'Pemadaman kompor gas, penyimpanan bahan baku sisa ke chiller, rekonsiliasi kasir & kunci gerbang.', 30
    ) RETURNING id INTO v_tmpl_closing_id;

    INSERT INTO sop_template_items (template_id, sort_order, task_name, task_instruction, requires_photo, requires_numeric_input, is_critical)
    VALUES 
    (v_tmpl_closing_id, 1, 'Tutup Seluruh Valve Regulator Gas LPG', 'Pastikan semua regulator gas kompor grill dan tungku nusantara terkunci rapat.', true, false, true),
    (v_tmpl_closing_id, 2, 'Simpan & Beri Label Tanggal Bahan Sisa ke Chiller', 'Semua daging yang sudah di-thawing wajib diberi label FIFO dan dibungkus plastic wrap.', false, false, true),
    (v_tmpl_closing_id, 3, 'Cetak Laporan Penutupan Kasir (Z-Report) & Setor Uang', 'Cocokkan fisik uang laci kasir dengan ringkasan sistem POS lalu masukkan ke brankas.', true, false, true);

    -- B. SOP CHECKLIST RUNS (Hari Ini)
    -- Run 1: Dapur Grill (Status COMPLETED)
    INSERT INTO sop_checklist_runs (
        id, tenant_id, outlet_id, template_id, run_date, shift_name, assigned_to_user_id, supervisor_user_id,
        status, started_at, completed_at, total_items, completed_items, flagged_items, supervisor_notes
    ) VALUES (
        uuidv7(), v_tenant_id, v_steak_id, v_tmpl_grill_id, CURRENT_DATE, 'SHIFT_PAGI',
        v_spv_steak, v_mgr_steak,
        'COMPLETED', now() - INTERVAL '3 hour', now() - INTERVAL '2 hour 40 minute',
        4, 4, 0, 'Suhu chiller stabil di 2.4°C dan freezer -19.5°C. Kesiapan daging meltique siap saji.'
    ) RETURNING id INTO v_run_grill_id;

    INSERT INTO sop_checklist_item_records (run_id, template_item_id, is_checked, numeric_actual_value, is_within_range, photo_url, notes, completed_at)
    VALUES 
    (v_run_grill_id, v_item_g1, true, 2.40, true, 'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?w=600&auto=format&fit=crop&q=80', 'Termometer chiller digital terbaca 2.4°C normal.', now() - INTERVAL '2 hour 55 minute'),
    (v_run_grill_id, v_item_g2, true, -19.50, true, 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80', 'Freezer utama beku sempurna.', now() - INTERVAL '2 hour 50 minute'),
    (v_run_grill_id, v_item_g3, true, NULL, true, NULL, 'Talenan merah daging steril.', now() - INTERVAL '2 hour 45 minute'),
    (v_run_grill_id, v_item_g4, true, NULL, true, NULL, 'Saus mushroom 4 Liter siap saji di bain marie.', now() - INTERVAL '2 hour 40 minute');

    -- Run 2: Gazebo Manding (Status IN_PROGRESS)
    INSERT INTO sop_checklist_runs (
        id, tenant_id, outlet_id, template_id, run_date, shift_name, assigned_to_user_id, supervisor_user_id,
        status, started_at, completed_at, total_items, completed_items, flagged_items, supervisor_notes
    ) VALUES (
        uuidv7(), v_tenant_id, v_garden_id, v_tmpl_gazebo_id, CURRENT_DATE, 'SHIFT_PAGI',
        v_spv_garden, NULL,
        'IN_PROGRESS', now() - INTERVAL '40 minute', NULL,
        3, 2, 0, 'Proses sanitasi gazebo 1-10 dan pembersihan kolam ikan koi.'
    ) RETURNING id INTO v_run_gazebo_id;

    INSERT INTO sop_checklist_item_records (run_id, template_item_id, is_checked, numeric_actual_value, is_within_range, photo_url, notes, completed_at)
    VALUES 
    (v_run_gazebo_id, v_item_gz1, true, NULL, true, 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=600&auto=format&fit=crop&q=80', 'Gazebo 1-10 telah disapu dan disemprot disinfektan sereh.', now() - INTERVAL '30 minute'),
    (v_run_gazebo_id, v_item_gz2, true, NULL, true, NULL, 'Pelet koi 200gr diberikan, air jernih, pompa aktif.', now() - INTERVAL '25 minute'),
    (v_run_gazebo_id, v_item_gz3, false, NULL, true, NULL, NULL, NULL);

    -- C. QUALITY AUDIT (Store Quality Scorecard)
    INSERT INTO quality_audits (
        id, tenant_id, outlet_id, audit_number, auditor_user_id, audit_date, audit_type,
        score_food_quality, score_service_speed, score_cleanliness, score_safety_equipment,
        total_weighted_score, overall_grade, summary_notes
    ) VALUES (
        uuidv7(), v_tenant_id, v_steak_id, 'QAC-20261024-001', v_mgr_steak, CURRENT_DATE - INTERVAL '1 day',
        'ROUTINE_WEEKLY',
        96.00, 92.00, 95.00, 94.00,
        94.45, 'A_EXCELLENT',
        'Kualitas steak dan porsi konsisten sesuai resep. Kebersihan meja indoor dan gazebo terjaga prima. Catatan kecil pada karet pintu chiller walk-in belakang.'
    ) RETURNING id INTO v_audit_id;

    INSERT INTO audit_action_items (
        audit_id, area, issue_description, severity, corrective_action, assigned_to_role, due_date, status
    ) VALUES (
        v_audit_id, 'Dapur Butchering Belakang', 'Karet segel pintu chiller walk-in sedikit berongga menyebabkan kondensasi embun.',
        'MEDIUM', 'Ganti karet gasket pintu chiller dan periksa engsel penutup otomatis.', 'STORE_MANAGER',
        CURRENT_DATE + INTERVAL '3 day', 'OPEN'
    );

    -- D. BANQUET PACKAGES & ITEMS
    -- 1. Paket Prasmanan Tropical Nusantara
    INSERT INTO banquet_packages (
        id, tenant_id, outlet_id, code, name, description, min_pax, price_per_pax, category, is_active
    ) VALUES (
        uuidv7(), v_tenant_id, v_garden_id, 'PKG-NUSANTARA-50',
        'Paket Prasmanan Tropical Nusantara (Min. 50 Pax)',
        'Paket lengkap jamuan prasmanan prasmanan khas Tropical: Ayam Bakar Madu, Gurame Terbang, Sop Sejuk Manding, Nasi Bakul, Es Teh Melati, dan Puding Buah.',
        50, 65000.00, 'BUFFET_PRASMANAN', true
    ) RETURNING id INTO v_pkg_nusantara_id;

    IF v_item_ayam IS NOT NULL THEN
        INSERT INTO banquet_package_items (package_id, menu_item_id, dish_course, portion_multiplier, notes)
        VALUES (v_pkg_nusantara_id, v_item_ayam, 'MAIN_COURSE', 1.00, 'Porsi potongan ayam bakar bumbu madu');
    END IF;

    IF v_item_gurame IS NOT NULL THEN
        INSERT INTO banquet_package_items (package_id, menu_item_id, dish_course, portion_multiplier, notes)
        VALUES (v_pkg_nusantara_id, v_item_gurame, 'MAIN_COURSE', 0.50, '1 ekor gurame dibagi untuk 2 pax prasmanan');
    END IF;

    -- 2. Paket VIP Gathering Grill & Steak
    INSERT INTO banquet_packages (
        id, tenant_id, outlet_id, code, name, description, min_pax, price_per_pax, category, is_active
    ) VALUES (
        uuidv7(), v_tenant_id, v_steak_id, 'PKG-VIP-STEAK-30',
        'Paket VIP Gathering Grill & Steak (Min. 30 Pax)',
        'Menu eksklusif Ruang VIP AC Steak House: Australian Tenderloin 200g / Ribeye BBQ, Potato Wedges, Mix Veggie, Saus Mushroom, dan Tropical Mocktail.',
        30, 145000.00, 'VIP_SET_MENU', true
    ) RETURNING id INTO v_pkg_steak_vip_id;

    IF v_item_tenderloin IS NOT NULL THEN
        INSERT INTO banquet_package_items (package_id, menu_item_id, dish_course, portion_multiplier, notes)
        VALUES (v_pkg_steak_vip_id, v_item_tenderloin, 'MAIN_COURSE', 1.00, 'Tingkat kematangan standar Medium Well');
    END IF;

    IF v_item_ribeye IS NOT NULL THEN
        INSERT INTO banquet_package_items (package_id, menu_item_id, dish_course, portion_multiplier, notes)
        VALUES (v_pkg_steak_vip_id, v_item_ribeye, 'MAIN_COURSE', 1.00, 'Pilihan Ribeye BBQ');
    END IF;

    -- 3. Paket Arisan & Coffee Break Gazebo
    INSERT INTO banquet_packages (
        id, tenant_id, outlet_id, code, name, description, min_pax, price_per_pax, category, is_active
    ) VALUES (
        uuidv7(), v_tenant_id, v_garden_id, 'PKG-ARISAN-GAZEBO-20',
        'Paket Arisan & Coffee Break Gazebo (Min. 20 Pax)',
        'Santai di Gazebo Manding: 3 macam jajanan tradisional Temanggung, Tempe Mendoan panas, Kopi Tubruk Manding, dan Teh Panas Gula Batu.',
        20, 35000.00, 'COFFEE_BREAK', true
    ) RETURNING id INTO v_pkg_arisan_id;

    -- E. PRE-ORDERS PADA RESERVASI BPK. HENDRO (RSV-20261028-001)
    IF v_res_hendro_id IS NOT NULL THEN
        UPDATE reservations 
        SET banquet_package_id = v_pkg_nusantara_id,
            kitchen_prep_status = 'PREPPING',
            layout_setup_notes = 'Susun meja prasmanan di Joglo Utama bagian tengah, siapkan 35 piring keramik & sendok garpu stainless. Sound system & mic untuk sambutan.',
            whatsapp_reminder_sent_at = now() - INTERVAL '1 day'
        WHERE id = v_res_hendro_id;

        IF v_item_ayam IS NOT NULL THEN
            INSERT INTO reservation_preorders (
                reservation_id, menu_item_id, banquet_package_id, item_name, quantity, unit_price, total_price,
                serving_stage, kitchen_prep_station, prep_status, special_notes
            ) VALUES (
                v_res_hendro_id, v_item_ayam, v_pkg_nusantara_id, 'Ayam Bakar Madu Spesial Gazebo (Prasmanan)',
                35, 35000.00, 1225000.00,
                'BUFFET_MAIN', 'KITCHEN', 'IN_PREP', 'Bakar kecokelatan dengan olesan madu ekstra.'
            );
        END IF;

        IF v_item_gurame IS NOT NULL THEN
            INSERT INTO reservation_preorders (
                reservation_id, menu_item_id, banquet_package_id, item_name, quantity, unit_price, total_price,
                serving_stage, kitchen_prep_station, prep_status, special_notes
            ) VALUES (
                v_res_hendro_id, v_item_gurame, v_pkg_nusantara_id, 'Gurame Goreng Terbang Temanggung (Prasmanan)',
                18, 55000.00, 990000.00,
                'BUFFET_MAIN', 'KITCHEN', 'QUEUED', 'Goreng garing terbang, sambal terasi dipisah di mangkok prasmanan.'
            );
        END IF;
    END IF;

END $$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- 1. Revert Pre-orders & Reservations enhancements
DROP TABLE IF EXISTS reservation_preorders CASCADE;

ALTER TABLE reservations 
    DROP COLUMN IF EXISTS whatsapp_reminder_sent_at,
    DROP COLUMN IF EXISTS layout_setup_notes,
    DROP COLUMN IF EXISTS kitchen_prep_status,
    DROP COLUMN IF EXISTS banquet_package_id;

-- 2. Drop Banquet packages
DROP TABLE IF EXISTS banquet_package_items CASCADE;
DROP TABLE IF EXISTS banquet_packages CASCADE;

-- 3. Drop Quality audits & action items
DROP TABLE IF EXISTS audit_action_items CASCADE;
DROP TABLE IF EXISTS quality_audits CASCADE;

-- 4. Drop SOP tables
DROP TABLE IF EXISTS sop_checklist_item_records CASCADE;
DROP TABLE IF EXISTS sop_checklist_runs CASCADE;
DROP TABLE IF EXISTS sop_template_items CASCADE;
DROP TABLE IF EXISTS sop_templates CASCADE;

-- +goose StatementEnd
