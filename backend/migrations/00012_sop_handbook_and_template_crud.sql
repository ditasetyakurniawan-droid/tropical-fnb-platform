-- +goose Up
-- ============================================================================
-- MILESTONE 9 EXTENSION: Digital Handbook Articles & Dynamic SOP Customization
-- ============================================================================

CREATE TABLE IF NOT EXISTS sop_handbook_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
    category VARCHAR(64) NOT NULL DEFAULT 'GENERAL_SERVICE', -- STEAK_GRILL, PORTIONING_HPA, GARDEN_AREA, SAFETY_EQUIPMENT, GENERAL_SERVICE
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255) NOT NULL DEFAULT '',
    badge_text VARCHAR(64) NOT NULL DEFAULT 'STANDAR F&B',
    icon_name VARCHAR(64) NOT NULL DEFAULT 'BookOpen',
    content_markdown TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sop_handbook_tenant ON sop_handbook_articles(tenant_id, category);

-- SEED INITIAL HANDBOOK ARTICLES (Tropical Resto Group)
-- +goose StatementBegin
DO $$
DECLARE
    v_tenant_id UUID;
BEGIN
    SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'tropical-temanggung';
    IF v_tenant_id IS NULL THEN
        RAISE NOTICE 'Tenant tropical-temanggung not found, skipping seed';
        RETURN;
    END IF;

    INSERT INTO sop_handbook_articles (
        id, tenant_id, outlet_id, category, title, subtitle, badge_text, icon_name, content_markdown, sort_order
    ) VALUES 
    (
        gen_random_uuid(), v_tenant_id, NULL, 'STEAK_GRILL',
        'Standar Tingkat Kematangan Steak Tropical',
        'Instruksi koki panggangan daging meltique & tenderloin.',
        'GRILL STATION', 'Flame',
        '**Rare (52°C)**: Pusat merah segar, sangat lembut dan berair (juicy) - 1.5 menit per sisi.

**Medium Rare (57°C)**: Pusat merah muda hangat, standar kelembutan steak terbaik - 2 menit per sisi.

**Medium (63°C)**: Garis merah muda tipis di tengah, tekstur daging padat kenyal - 2.5 menit per sisi.

**Medium Well (68°C)**: Sedikit semburat merah muda, paling disukai pelanggan lokal - 3 menit per sisi.

**Well Done (74°C+)**: Matang sempurna merata, cokelat keemasan tanpa darah - 3.5 menit per sisi.',
        1
    ),
    (
        gen_random_uuid(), v_tenant_id, NULL, 'PORTIONING_HPA',
        'Standar Gramasi Porsi & Plating Dapur',
        'Kontrol HPA anti over-portioning di station plating.',
        'PORTION CONTROL', 'ChefHat',
        '**Porsi Menu Steak Tunggal (Hotplate)**:
- Daging Meltique / Australian Beef: **200 gram (± 5 gr)**
- Saus Batch Mushroom / BBQ / Blackpepper: **80 ml** di mangkuk saus terpisah atau siram
- French Fries / Potato Wedges: **100 gram** digoreng garing renyah
- Mix Vegetable (Wortel, Jagung, Buncis rebus butter): **50 gram**

**Porsi Prasmanan Rombongan (Buffet)**:
- Gurame Terbang Temanggung: 1 ekor untuk 2 pax prasmanan
- Ayam Bakar Madu: 1 porsi potongan paha/dada per pax
- Kuah Soto Sejuk: 1 chafing dish 10 Liter disajikan panas pada burner api spiritus',
        2
    ),
    (
        gen_random_uuid(), v_tenant_id, NULL, 'GARDEN_AREA',
        'SOP Area Taman, Gazebo & Kolam Koi Manding',
        'Standar kenyamanan dan higienitas tamu lesehan keluarga.',
        'OUTDOOR & GARDEN', 'Sparkles',
        '**Pemeliharaan Kolam Ikan Koi**:
Beri pakan pelet takaran 200 gram pada jam 07.30 dan 16.30 WIB. Pastikan pompa aerasi dan skimmer air berjalan lancar. Jangan izinkan tamu memberi makanan sisa meja makan ke kolam.

**Sanitasi 10 Saung Gazebo Lesehan**:
Semprot karpet dan meja kayu menggunakan disinfektan sereh alami untuk mencegah serangga dan lalat. Lap hingga kering sempurna sebelum tamu masuk.',
        3
    ),
    (
        gen_random_uuid(), v_tenant_id, NULL, 'SAFETY_EQUIPMENT',
        'Keamanan Gas LPG 50kg & Pencegahan Kebakaran',
        'Prosedur wajib divisi kasir dan kitchen safety saat closing.',
        'SAFETY PROTOCOL', 'ShieldAlert',
        '**Pemeriksaan Regulator LPG**:
Selalu pastikan jarum manifold gas di zona hijau. Jika tercium bau gas tajam, dilarang menyalakan saklar listrik apapun dan segera buka ventilasi udara dapur.

**APAR (Alat Pemadam Api Ringan)**:
Terdapat 2 tabung APAR powder di Dapur Steak dan 1 tabung di Gazebo Garden. Pastikan segel pin utuh dan jarum barometer di posisi tengah hijau.',
        4
    );
END $$;
-- +goose StatementEnd

-- +goose Down
DROP TABLE IF EXISTS sop_handbook_articles CASCADE;
