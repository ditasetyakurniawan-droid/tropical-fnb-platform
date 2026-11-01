import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoyaltyVouchersPage } from './LoyaltyVouchersPage'
import type { Customer, PointsLedgerEntry, Voucher } from './types'

const MOCK_CUSTOMERS: Customer[] = [
  {
    id: '0192c000-0001-7000-8000-000000000001',
    tenant_id: '01a16ca4-7709-7b43-8af9-cf41da3c78d6',
    phone: '085711223344',
    name: 'dr. Farhan Syahputra',
    email: 'dr.farhan@klinikmandiri.id',
    membership_tier: 'TROPICAL_VIP',
    points_balance: 1245,
    lifetime_spend: 12450000,
    visit_count: 18,
    birthday: '1984-11-12',
    dietary_notes: 'Alergi seafood dan udang. Daging steak medium-rare.',
    preferences: 'Ruang VIP AC Steak House dekat vas bunga segar.',
    created_at: '2026-10-25T04:00:00Z',
    updated_at: '2026-10-25T04:00:00Z',
  },
  {
    id: '0192c000-0001-7000-8000-000000000002',
    tenant_id: '01a16ca4-7709-7b43-8af9-cf41da3c78d6',
    phone: '081234567890',
    name: 'Bpk. Hendro (Paguyuban Temanggung)',
    email: 'hendro.paguyuban@temanggungkab.go.id',
    membership_tier: 'GOLD',
    points_balance: 580,
    lifetime_spend: 5800000,
    visit_count: 8,
    birthday: '1975-06-20',
    dietary_notes: 'Kopi Arabika Temanggung tanpa gula.',
    preferences: 'Joglo Utama Lesehan Manding untuk gathering.',
    created_at: '2026-10-25T04:00:00Z',
    updated_at: '2026-10-25T04:00:00Z',
  },
]

const MOCK_VOUCHERS: Voucher[] = [
  {
    id: '01a16fd5-4ebb-7280-bdcc-933f86b0d6fd',
    tenant_id: '01a16ca4-7709-7b43-8af9-cf41da3c78d6',
    code: 'TROPICALVIP',
    title: 'Diskon Spesial VIP Tier 15%',
    description: 'Diskon 15% maksimal Rp 150.000 khusus member Gold & Tropical VIP.',
    discount_type: 'PERCENTAGE',
    discount_value: 15,
    max_discount_amount: 150000,
    min_purchase_amount: 500000,
    min_membership_tier: 'GOLD',
    usage_limit_total: 50,
    usage_count: 6,
    valid_from: '2026-09-24',
    valid_until: '2027-01-22',
    is_active: true,
    created_at: '2026-10-25T04:00:00Z',
    updated_at: '2026-10-25T04:00:00Z',
  },
  {
    id: '01a16fd5-4ebc-7272-844c-46b4ef46f30d',
    tenant_id: '01a16ca4-7709-7b43-8af9-cf41da3c78d6',
    code: 'WELCOME25',
    title: 'Promo Pelanggan Baru 25%',
    description: 'Diskon 25% maksimal Rp 25.000 khusus transaksi member baru di Tropical F&B.',
    discount_type: 'PERCENTAGE',
    discount_value: 25,
    max_discount_amount: 25000,
    min_purchase_amount: 80000,
    usage_limit_total: 200,
    usage_count: 42,
    valid_from: '2026-08-25',
    valid_until: '2027-02-21',
    is_active: true,
    created_at: '2026-10-25T04:00:00Z',
    updated_at: '2026-10-25T04:00:00Z',
  },
]

const MOCK_LEDGER: PointsLedgerEntry[] = [
  {
    id: '01a16fd5-4eb9-7fc7-96b4-b60158114044',
    tenant_id: '01a16ca4-7709-7b43-8af9-cf41da3c78d6',
    customer_id: '0192c000-0001-7000-8000-000000000001',
    customer_name: 'dr. Farhan Syahputra',
    customer_phone: '085711223344',
    tx_type: 'EARN',
    points: 100,
    balance_after: 1245,
    description: 'Poin transaksi jamuan makan malam #TRP-STK-1002 (Rp 1.000.000)',
    created_at: '2026-10-24T12:00:00Z',
  },
]

describe('LoyaltyVouchersPage (Milestone 8)', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    // Mock fetch for CRM endpoints
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = url.toString()
      if (urlStr.includes('/api/v1/crm/customers/0192c000-0001-7000-8000-000000000001')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ...MOCK_CUSTOMERS[0],
              recent_points: MOCK_LEDGER,
            }),
            { status: 200 }
          )
        )
      }
      if (urlStr.includes('/api/v1/crm/customers')) {
        return Promise.resolve(new Response(JSON.stringify(MOCK_CUSTOMERS), { status: 200 }))
      }
      if (urlStr.includes('/api/v1/crm/vouchers/validate')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              valid: true,
              discount_amount: 90000,
              message: "Voucher 'TROPICALVIP' berhasil digunakan (Hemat Rp 90000)",
              voucher: MOCK_VOUCHERS[0],
            }),
            { status: 200 }
          )
        )
      }
      if (urlStr.includes('/api/v1/crm/vouchers')) {
        return Promise.resolve(new Response(JSON.stringify(MOCK_VOUCHERS), { status: 200 }))
      }
      if (urlStr.includes('/api/v1/crm/points-ledger')) {
        return Promise.resolve(new Response(JSON.stringify(MOCK_LEDGER), { status: 200 }))
      }
      return Promise.reject(new Error(`Unhandled fetch: ${urlStr}`))
    })
  })

  function renderPage() {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LoyaltyVouchersPage />
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it('renders header, KPI cockpit, and customer CRM table', async () => {
    renderPage()

    // Cockpit title
    expect(screen.getByText('Manajemen Pelanggan, Poin & Voucher Promo')).toBeInTheDocument()

    // KPI cards
    await waitFor(() => {
      expect(screen.getByText('Total Pelanggan Terdaftar')).toBeInTheDocument()
      expect(screen.getByText('Tamu VIP & Gold')).toBeInTheDocument()
    })

    // Customer table items
    expect(await screen.findByText('dr. Farhan Syahputra')).toBeInTheDocument()
    expect(screen.getByText('Bpk. Hendro (Paguyuban Temanggung)')).toBeInTheDocument()
    expect(screen.getAllByText('TROPICAL VIP').length).toBeGreaterThan(0)
    expect(screen.getByText('GOLD TIER')).toBeInTheDocument()
  })

  it('switches to Tab 2 Promo & Voucher Diskon and renders coupons', async () => {
    const user = userEvent.setup()
    renderPage()

    // Click tab 2
    const voucherTab = await screen.findByRole('button', { name: /Promo & Voucher Diskon/i })
    await user.click(voucherTab)

    // Check voucher codes rendered
    await waitFor(() => {
      expect(screen.getByText('TROPICALVIP')).toBeInTheDocument()
      expect(screen.getByText('WELCOME25')).toBeInTheDocument()
      expect(screen.getByText(/Simulator Validasi Voucher Kasir POS/i)).toBeInTheDocument()
    })
  })

  it('switches to Tab 3 Buku Besar Poin Reward and renders audit log', async () => {
    const user = userEvent.setup()
    renderPage()

    // Click tab 3
    const ledgerTab = await screen.findByRole('button', { name: /Buku Besar Poin Reward/i })
    await user.click(ledgerTab)

    // Check ledger entry
    await waitFor(() => {
      expect(screen.getByText('+ DAPAT POIN')).toBeInTheDocument()
      expect(screen.getByText('+100 pts')).toBeInTheDocument()
      expect(screen.getByText(/Poin transaksi jamuan makan malam/i)).toBeInTheDocument()
    })
  })

  it('opens and closes Tambah Member modal', async () => {
    const user = userEvent.setup()
    renderPage()

    // Click Tambah Member
    const addBtn = screen.getByRole('button', { name: /Tambah Member/i })
    await user.click(addBtn)

    // Verify modal appeared
    expect(screen.getByText('Tambah Member Pelanggan Baru')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Contoh: dr. Farhan Syahputra/i)).toBeInTheDocument()

    // Click Batal
    const cancelBtn = screen.getByRole('button', { name: /Batal/i })
    await user.click(cancelBtn)

    // Modal closed
    await waitFor(() => {
      expect(screen.queryByText('Tambah Member Pelanggan Baru')).not.toBeInTheDocument()
    })
  })

  it('opens Customer Detail modal on row or detail button click, showing financial stats and ledger history', async () => {
    const user = userEvent.setup()
    renderPage()

    const detailButtons = await screen.findAllByRole('button', { name: /Detail/i })
    await user.click(detailButtons[0]!)

    // Check if modal title, actions, and customer details appear
    await waitFor(() => {
      expect(screen.getByText('Riwayat Mutasi Poin & Transaksi Pelanggan')).toBeInTheDocument()
      expect(screen.getByText(/Chat WhatsApp/i)).toBeInTheDocument()
      expect(screen.getByText(/Sesuaikan Poin Manual/i)).toBeInTheDocument()
      expect(screen.getByText(/Pantangan \/ Alergi Makanan/i)).toBeInTheDocument()
      expect(screen.getAllByText(/Alergi seafood dan udang/i).length).toBeGreaterThanOrEqual(2)
      expect(screen.getAllByText(/Ruang VIP AC Steak House/i).length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('+100 pts')).toBeInTheDocument()
    })

    // Click Tutup button in detail modal
    const closeBtn = screen.getByRole('button', { name: 'Tutup' })
    await user.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByText('Riwayat Mutasi Poin & Transaksi Pelanggan')).not.toBeInTheDocument()
    })
  })
})
