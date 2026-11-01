import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ReservationsPage } from './ReservationsPage';
import * as posApi from './pos-api';
import * as crmApi from '@/features/crm/crm-api';
import type { Reservation, BanquetPackage, DiningTable } from './types';

vi.mock('./pos-api');
vi.mock('@/features/crm/crm-api');

const MOCK_RESERVATIONS: Reservation[] = [
  {
    id: 'res-1',
    tenant_id: 'tenant-1',
    outlet_id: 'outlet-1',
    outlet_code: 'TSH-01',
    reservation_number: 'RSV-20261028-001',
    customer_id: 'crm-cust-1',
    customer_name: 'Bpk. Hendro (Paguyuban Temanggung)',
    customer_phone: '081234567890',
    event_type: 'CORPORATE_EVENT',
    pax_count: 35,
    reservation_date: '2026-10-28',
    start_time: '12:00',
    end_time: '15:00',
    assigned_table_id: 'tbl-1',
    assigned_table_number: 'GAZEBO-01',
    min_spend: 3000000,
    deposit_amount: 1000000,
    deposit_paid: true,
    deposit_payment_method: 'TRANSFER',
    dp_receipt_ref: 'TRF-BCA-992110',
    status: 'CONFIRMED',
    special_requests: 'Panggung sambutan kecil & meja prasmanan di tengah.',
    banquet_package_id: 'pkg-1',
    banquet_package_name: 'Paket Prasmanan Nusantara 50 Pax',
    kitchen_prep_status: 'QUEUED',
    layout_setup_notes: 'Susunan kursi U-Shape mengitari kolam koi',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    preorders: [
      {
        id: 'po-1',
        reservation_id: 'res-1',
        item_name: 'Paket Prasmanan Nusantara',
        quantity: 35,
        unit_price: 85000,
        total_price: 2975000,
        serving_stage: 'BUFFET_MAIN',
        kitchen_prep_station: 'KITCHEN',
        prep_status: 'QUEUED',
        created_at: new Date().toISOString(),
      },
    ],
  },
];

const MOCK_BANQUET_PACKAGES: BanquetPackage[] = [
  {
    id: 'pkg-1',
    tenant_id: 'tenant-1',
    outlet_id: 'outlet-1',
    code: 'PKG-NUSANTARA-50',
    name: 'Paket Prasmanan Nusantara 50 Pax',
    description: 'Sajian lengkap ayam bakar madu, sambal matah, lalapan, es kelapa muda.',
    min_pax: 50,
    price_per_pax: 85000,
    category: 'BUFFET_PRASMANAN',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    items: [
      {
        id: 'item-1',
        package_id: 'pkg-1',
        menu_item_id: 'menu-1',
        menu_item_name: 'Ayam Bakar Madu',
        dish_course: 'MAIN_COURSE',
        portion_multiplier: 1,
        created_at: new Date().toISOString(),
      },
    ],
  },
  {
    id: 'pkg-2',
    tenant_id: 'tenant-1',
    outlet_id: 'outlet-1',
    code: 'PKG-VIP-STEAK-30',
    name: 'Paket Jamuan VIP Steak 30 Pax',
    description: 'Pilihan Tenderloin Meltique Steak 200g, mushroom sauce, dan french fries.',
    min_pax: 30,
    price_per_pax: 145000,
    category: 'VIP_SET_MENU',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const MOCK_TABLES: DiningTable[] = [
  {
    id: 'tbl-1',
    tenant_id: 'tenant-1',
    outlet_id: 'outlet-1',
    outlet_code: 'TSH-01',
    table_number: 'GAZEBO-01',
    section: 'OUTDOOR_GAZEBO',
    capacity: 40,
    shape: 'GAZEBO_OCTAGON',
    status: 'AVAILABLE',
    pos_x: 0,
    pos_y: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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

describe('ReservationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(posApi.fetchReservations).mockResolvedValue(MOCK_RESERVATIONS);
    vi.mocked(posApi.fetchBanquetPackages).mockResolvedValue(MOCK_BANQUET_PACKAGES);
    vi.mocked(posApi.fetchTables).mockResolvedValue(MOCK_TABLES);
    vi.mocked(crmApi.fetchCustomers).mockResolvedValue([]);
  });

  it('renders reservations, banquet details, and KPI summary', async () => {
    renderWithProviders(<ReservationsPage />);

    expect(screen.getByText(/Manajemen Banquet, Prasmanan & Reservasi Event/i)).toBeInTheDocument();
    expect(screen.getByText(/Jadwal & Reservasi Tamu/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('RSV-20261028-001')).toBeInTheDocument();
      expect(screen.getByText('Bpk. Hendro (Paguyuban Temanggung)')).toBeInTheDocument();
      expect(screen.getByText(/Paket Prasmanan Nusantara 50 Pax/i)).toBeInTheDocument();
      expect(screen.getByText(/35 Tamu \(Pax\)/i)).toBeInTheDocument();
      expect(screen.getByText(/LUNAS DP/i)).toBeInTheDocument();
    });
  });

  it('switches to Banquet Packages catalog tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReservationsPage />);

    await waitFor(() => {
      expect(screen.getByText('RSV-20261028-001')).toBeInTheDocument();
      expect(posApi.fetchBanquetPackages).toHaveBeenCalled();
    });

    const banquetTabBtn = screen.getByRole('button', { name: /Katalog Paket Prasmanan & Banquet/i });
    await user.click(banquetTabBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tambah Paket Prasmanan/i })).toBeInTheDocument();
      expect(screen.getByText(/Katalog Paket Prasmanan & Jamuan Event/i)).toBeInTheDocument();
      expect(screen.getByText('PKG-NUSANTARA-50')).toBeInTheDocument();
      expect(screen.getByText('PKG-VIP-STEAK-30')).toBeInTheDocument();
    });
  });

  it('opens WhatsApp reminder modal with generated message', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReservationsPage />);

    await waitFor(() => {
      expect(screen.getByText('RSV-20261028-001')).toBeInTheDocument();
    });

    const formatWABtn = screen.getByRole('button', { name: /Format WA/i });
    await user.click(formatWABtn);

    await waitFor(() => {
      expect(screen.getByText(/Pengingat & Konfirmasi WhatsApp/i)).toBeInTheDocument();
      expect(screen.getByText(/Penerima: Bpk. Hendro/i)).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText(/Format Pesan WhatsApp/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('RSV-20261028-001');
    expect(textarea.value).toContain('Tropical');
  });

  it('triggers kitchen prep alert to KDS', async () => {
    const user = userEvent.setup();
    vi.mocked(posApi.updateReservationPrepStatus).mockResolvedValue({
      message: 'Status kesiapan dapur diperbarui',
      prep_status: 'IN_PREP',
    });

    renderWithProviders(<ReservationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Kirim Notif Masak ke KDS/i)).toBeInTheDocument();
    });

    const kdsBtn = screen.getByRole('button', { name: /Kirim Notif Masak ke KDS/i });
    await user.click(kdsBtn);

    expect(posApi.updateReservationPrepStatus).toHaveBeenCalledWith('res-1', 'IN_PREP');
  });
});
