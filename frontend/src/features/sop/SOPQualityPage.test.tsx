import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SOPQualityPage } from './SOPQualityPage';
import * as sopApi from './sop-api';
import type { SOPTemplate, SOPChecklistRun, QualityAudit, SOPHandbookArticle } from './types';

vi.mock('./sop-api');

const MOCK_HANDBOOK: SOPHandbookArticle[] = [
  {
    id: 'hb-1',
    tenant_id: 'tenant-1',
    category: 'STEAK_GRILL',
    title: 'Standar Tingkat Kematangan Steak Tropical',
    subtitle: 'Instruksi koki panggangan daging meltique & tenderloin.',
    badge_text: 'GRILL STATION',
    icon_name: 'Flame',
    content_markdown: 'Rare: 52C, Medium Rare: 57C, Medium: 63C, Well Done: 74C',
    sort_order: 1,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'hb-2',
    tenant_id: 'tenant-1',
    category: 'PORTIONING_HPA',
    title: 'Standar Gramasi Porsi & Plating',
    subtitle: 'Kontrol HPA anti over-portioning di station plating.',
    badge_text: 'PORTION CONTROL',
    icon_name: 'ChefHat',
    content_markdown: 'Daging 200g, French fries 100g, mix vegetable 50g',
    sort_order: 2,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'hb-3',
    tenant_id: 'tenant-1',
    category: 'SAFETY_EQUIPMENT',
    title: 'Keamanan Gas LPG 50kg & Pencegahan Kebakaran',
    subtitle: 'Prosedur wajib divisi kasir dan kitchen safety saat closing.',
    badge_text: 'SAFETY PROTOCOL',
    icon_name: 'ShieldAlert',
    content_markdown: 'Pemeriksaan regulator LPG dan kesiapan APAR',
    sort_order: 3,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const MOCK_TEMPLATES: SOPTemplate[] = [
  {
    id: 'tmpl-1',
    tenant_id: 'tenant-1',
    code: 'SOP-GRILL-01',
    title: 'Standar Kalibrasi Griddle & Suhu Chiller Daging',
    station: 'GRILL_STEAK',
    shift_phase: 'OPENING',
    description: 'Pengecekan suhu chiller 0-4 C dan pemanasan grill 200 C.',
    estimated_duration_minutes: 15,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    items: [
      {
        id: 'tmpl-item-1',
        template_id: 'tmpl-1',
        sort_order: 1,
        task_name: 'Suhu Cold Storage / Meat Chiller berada di rentang 0°C s.d. 4°C',
        requires_photo: true,
        requires_numeric_input: true,
        numeric_unit: '°C',
        min_val: 0,
        max_val: 4,
        is_critical: true,
        created_at: new Date().toISOString(),
      },
    ],
  },
];

const MOCK_RUNS: SOPChecklistRun[] = [
  {
    id: 'run-1',
    tenant_id: 'tenant-1',
    outlet_id: 'outlet-1',
    outlet_name: 'Tropical Manding',
    template_id: 'tmpl-1',
    template_code: 'SOP-GRILL-01',
    template_title: 'Standar Kalibrasi Griddle & Suhu Chiller Daging',
    station: 'GRILL_STEAK',
    shift_phase: 'OPENING',
    shift_name: 'SHIFT_PAGI',
    run_date: '2026-10-25',
    assigned_to_user_id: 'user-1',
    assigned_to_name: 'Chef Junaedi',
    status: 'COMPLETED',
    started_at: '2026-10-25T07:00:00Z',
    completed_at: '2026-10-25T07:20:00Z',
    total_items: 4,
    completed_items: 4,
    flagged_items: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    records: [
      {
        id: 'rec-1',
        run_id: 'run-1',
        template_item_id: 'tmpl-item-1',
        task_name: 'Suhu Cold Storage / Meat Chiller berada di rentang 0°C s.d. 4°C',
        requires_photo: true,
        requires_numeric_input: true,
        numeric_unit: '°C',
        min_val: 0,
        max_val: 4,
        is_critical: true,
        is_checked: true,
        numeric_actual_value: 2.5,
        is_within_range: true,
        flagged: false,
        photo_url: 'https://images.unsplash.com/photo-1544025162-d76694265947',
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ],
  },
];

const MOCK_AUDITS: QualityAudit[] = [
  {
    id: 'audit-1',
    tenant_id: 'tenant-1',
    outlet_id: 'outlet-1',
    outlet_name: 'Tropical Manding (Joglo & Gazebo Lesehan)',
    audit_number: 'QAC-20261024-001',
    audit_date: '2026-10-24',
    auditor_user_id: 'auditor-1',
    auditor_name: 'Bpk. Surya Dinata (Quality Assurance Principal)',
    audit_type: 'ROUTINE_WEEKLY',
    score_food_quality: 96,
    score_service_speed: 92,
    score_cleanliness: 95,
    score_safety_equipment: 94,
    total_weighted_score: 94.45,
    overall_grade: 'A_EXCELLENT',
    summary_notes: 'Kualitas steak tenderloin meltique konsisten juicy. Area saung gazebo bersih.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    action_items: [
      {
        id: 'act-1',
        audit_id: 'audit-1',
        area: 'Gazebo Manding 4 & Taman Kelinci',
        issue_description: 'Bantalan lesehan di Gazebo 4 terdapat noda sambal',
        corrective_action: 'Cuci dry-clean sarung bantal dan ganti dengan cadangan',
        severity: 'MEDIUM',
        assigned_to_role: 'Leader Cleaning Manding',
        due_date: '2026-10-26',
        status: 'OPEN',
        created_at: new Date().toISOString(),
      },
    ],
  },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SOPQualityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sopApi.fetchSOPTemplates).mockResolvedValue(MOCK_TEMPLATES);
    vi.mocked(sopApi.fetchSOPChecklistRuns).mockResolvedValue(MOCK_RUNS);
    vi.mocked(sopApi.fetchQualityAudits).mockResolvedValue(MOCK_AUDITS);
    vi.mocked(sopApi.fetchHandbookArticles).mockResolvedValue(MOCK_HANDBOOK);
  });

  it('renders SOP header, KPI metrics, and checklist runs', async () => {
    renderWithProviders(<SOPQualityPage />);

    expect(screen.getByText(/SOP Operasional & Kontrol Mutu Cabang/i)).toBeInTheDocument();
    expect(screen.getByText(/Checklist Harian Shift/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('SOP-GRILL-01')).toBeInTheDocument();
      expect(screen.getByText(/Standar Kalibrasi Griddle & Suhu Chiller Daging/i)).toBeInTheDocument();
      expect(screen.getByText('Chef Junaedi')).toBeInTheDocument();
    });
  });

  it('switches between tabs: Checklists, Audits, and Handbook', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SOPQualityPage />);

    // Click Tab 2: Rapor Audit Mutu
    const auditTabBtn = screen.getByRole('button', { name: /Rapor Audit Mutu/i });
    await user.click(auditTabBtn);

    await waitFor(() => {
      expect(screen.getByText(/Tiket Temuan & Tindakan Korektif Audit Lapangan/i)).toBeInTheDocument();
      expect(screen.getByText(/Bantalan lesehan di Gazebo 4 terdapat noda sambal/i)).toBeInTheDocument();
    });

    // Click Tab 3: Buku Panduan SOP
    const handbookTabBtn = screen.getByRole('button', { name: /Buku Panduan SOP/i });
    await user.click(handbookTabBtn);

    await waitFor(() => {
      expect(screen.getByText(/Standar Tingkat Kematangan Steak Tropical/i)).toBeInTheDocument();
      expect(screen.getByText(/Standar Gramasi Porsi & Plating/i)).toBeInTheDocument();
      expect(screen.getByText(/Keamanan Gas LPG 50kg & Pencegahan Kebakaran/i)).toBeInTheDocument();
    });
  });

  it('filters runs by station', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SOPQualityPage />);

    await waitFor(() => {
      expect(screen.getByText('SOP-GRILL-01')).toBeInTheDocument();
    });

    // Click Dapur Nusantara station filter (which should hide GRILL_STEAK run)
    const dapurBtn = screen.getByRole('button', { name: /Dapur Nusantara/i });
    await user.click(dapurBtn);

    await waitFor(() => {
      expect(screen.getByText(/Tidak ada checklist aktif untuk filter ini/i)).toBeInTheDocument();
    });
  });

  it('opens custom SOP template builder modal', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SOPQualityPage />);

    const designBtn = screen.getByRole('button', { name: /Desain SOP Kustom/i });
    await user.click(designBtn);

    await waitFor(() => {
      expect(screen.getByText(/Kustomisasi & Desain Template SOP Mandiri/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Cth: SOP-GRILL-02/i)).toBeInTheDocument();
      expect(screen.getByText(/Daftar Butir Pemeriksaan Checklist/i)).toBeInTheDocument();
    });
  });
});
