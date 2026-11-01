import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FinancialReportsPage } from './FinancialReportsPage'
import { useAuthStore } from '@/features/auth/auth-store'

const MOCK_PNL = {
  period_label: 'Oktober 2026 (Month-to-Date)',
  period_start: '2026-10-01',
  period_end: '2026-10-25',
  gross_sales: 152750000,
  discounts: 4250000,
  net_sales: 148500000,
  food_cost: 46332000,
  waste_and_shrinkage: 960000,
  total_cogs: 47292000,
  cogs_pct: 31.8,
  gross_profit: 101208000,
  gross_margin_pct: 68.2,
  labor_cost: 46406070,
  labor_pct: 31.2,
  prime_cost: 93698070,
  prime_cost_pct: 63.1,
  utilities_and_fuel: 4330000,
  maintenance_ambiance: 650000,
  consumables_packaging: 820000,
  marketing_promo: 750000,
  rent_and_property: 3500000,
  admin_and_tech: 550000,
  total_opex: 57006070,
  opex_pct: 38.4,
  ebitda: 44201930,
  ebitda_pct: 29.8,
  tax_pb1: 14850000,
  net_profit: 44201930,
  net_margin_pct: 29.8,
  outlets: [
    {
      outlet_id: '01a16ca4-770a-7f46-9216-79dd3612a375',
      outlet_name: 'Tropical Steak House (TSH-01)',
      net_sales: 84500000,
      total_cogs: 27885000,
      gross_profit: 56615000,
      labor_cost: 17500000,
      total_opex: 25800000,
      net_profit: 30815000,
      net_margin_pct: 36.5,
    },
  ],
  monthly_trends: [
    { month_key: '2026-05', month_label: 'Mei', revenue: 98010000, cogs: 31212720, expenses: 38194067, net_profit: 28731255 },
    { month_key: '2026-06', month_label: 'Jun', revenue: 112860000, cogs: 35941920, expenses: 42754553, net_profit: 34035486 },
    { month_key: '2026-07', month_label: 'Jul', revenue: 138105000, cogs: 44454480, expenses: 51305463, net_profit: 42875872 },
    { month_key: '2026-08', month_label: 'Agu', revenue: 105435000, cogs: 33577320, expenses: 39904249, net_profit: 31825390 },
    { month_key: '2026-09', month_label: 'Sep', revenue: 129195000, cogs: 41144040, expenses: 49025220, net_profit: 38897698 },
    { month_key: '2026-10', month_label: 'Okt', revenue: 148500000, cogs: 47292000, expenses: 57006070, net_profit: 44201930 },
  ],
  category_breakdown: [
    { code: 'STEAK', name: 'Steaks & Meltique Premium', amount: 66825000, percentage: 45, color: '#3B82F6' },
    { code: 'TRADITIONAL', name: 'Kuliner Tradisional & Ikan Bakar', amount: 40095000, percentage: 27, color: '#F59E0B' },
    { code: 'BEVERAGE', name: 'Bar, Mocktail & Kopi Manding', amount: 28215000, percentage: 19, color: '#10B981' },
    { code: 'SNACK', name: 'Appetizer & Dessert', amount: 13365000, percentage: 9, color: '#8B5CF6' },
  ],
}

const MOCK_BEP = {
  monthly_fixed_cost: 46400000,
  contribution_margin_ratio: 0.68,
  monthly_bep_amount: 68235294,
  daily_bep_amount: 2274510,
  today_revenue: 5780000,
  today_progress_pct: 254.1,
  is_bep_reached: true,
  bep_reached_time: '14:15 WIB',
  zone_status: 'PROFIT_ZONE',
}

const MOCK_EXPENSES = [
  {
    id: 'exp-1',
    category_id: 'cat-1',
    category_code: 'EXP-UTIL',
    category_name: 'Utilitas & Energi (Listrik PLN & Gas LPG)',
    expense_date: '2026-10-24',
    title: 'Pengisian 4 Tabung Gas LPG 50kg Dapur Steak',
    amount: 2480000,
    payment_method: 'BANK_TRANSFER',
    receipt_ref: 'INV-LPG-8812',
    recorded_by_name: 'Agus Supriyanto',
    status: 'CONFIRMED',
  },
]

const MOCK_CATEGORIES = [
  {
    id: 'cat-1',
    code: 'EXP-UTIL',
    name: 'Utilitas & Energi (Listrik PLN & Gas LPG)',
  },
]

describe('FinancialReportsPage (Milestone 7)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: 'mock-jwt-token',
      user: {
        id: 'usr-1',
        tenant_id: 'tenant-1',
        username: 'owner',
        full_name: 'Budi Santoso (Owner)',
        email: 'owner@tropicalfnb.local',
        is_active: true,
      },
      accessibleOutlets: [
        {
          id: '01a16ca4-770a-7f46-9216-79dd3612a375',
          code: 'TSH-01',
          slug: 'tropical-steak-house',
          name: 'Tropical Steak House',
          outlet_type: 'RESTAURANT',
          tax_pb1_percent: 10,
          service_charge_percent: 0,
          address: 'Temanggung',
        },
      ],
      isGlobalAllOutlets: true,
      isAuthenticated: true,
    })

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/finance/pnl')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_PNL),
        })
      }
      if (url.includes('/api/v1/finance/bep')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_BEP),
        })
      }
      if (url.includes('/api/v1/finance/expenses')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_EXPENSES),
        })
      }
      if (url.includes('/api/v1/finance/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_CATEGORIES),
        })
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    }))
  })

  it('renders executive cockpit with P&L metrics, KPI cards, and BEP daily gauge', async () => {
    render(
      <MemoryRouter>
        <FinancialReportsPage />
      </MemoryRouter>,
    )

    // Heading verification
    expect(screen.getByText(/Laporan Keuangan & Laba Rugi Realtime/i)).toBeInTheDocument()

    // Wait for PnL and BEP data to render
    await waitFor(() => {
      expect(screen.getAllByText(/148\.500\.000/)[0]).toBeInTheDocument()
      expect(screen.getAllByText(/44\.201\.930/)[0]).toBeInTheDocument()
    })

    // BEP daily status check
    expect(screen.getByText(/Titik Impas Tercapai pukul 14:15 WIB/i)).toBeInTheDocument()
    expect(screen.getByText(/Diagram Aliran Finansial F&B/i)).toBeInTheDocument()

    // Realtime Animated Charts (Contracts & Deals + Cash Flow & Revenue)
    expect(screen.getByText(/Contracts & Deals F&B/i)).toBeInTheDocument()
    expect(screen.getByText(/Cash Flow & Revenue/i)).toBeInTheDocument()
    expect(screen.getByText(/Period: Last 6 months/i)).toBeInTheDocument()
  })

  it('switches to Tab 2 Laporan Laba Rugi (USALI) and displays the statement', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <FinancialReportsPage />
      </MemoryRouter>,
    )

    const tab2Btn = screen.getByRole('button', { name: /2\. Tabel Laporan Laba Rugi/i })
    await user.click(tab2Btn)

    await waitFor(() => {
      expect(screen.getByText(/Format Standar Asosiasi Restoran & Perhotelan \(USALI\)/i)).toBeInTheDocument()
      expect(screen.getByText(/TOTAL PENJUALAN BERSIH \(NET SALES\)/i)).toBeInTheDocument()
      expect(screen.getByText(/LABA BERSIH RIIL RESTORAN \(NET PROFIT\)/i)).toBeInTheDocument()
    })
  })

  it('switches to Tab 3 Buku Pengeluaran (OPEX) and opens new expense modal', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <FinancialReportsPage />
      </MemoryRouter>,
    )

    const tab3Btn = screen.getByRole('button', { name: /3\. Buku Pengeluaran \(OPEX\)/i })
    await user.click(tab3Btn)

    await waitFor(() => {
      expect(screen.getByText(/Buku Besar Pengeluaran Operasional Resto/i)).toBeInTheDocument()
      expect(screen.getByText('Pengisian 4 Tabung Gas LPG 50kg Dapur Steak')).toBeInTheDocument()
    })

    // Click on + Catat Pengeluaran Baru button
    const newExpenseBtns = screen.getAllByRole('button', { name: /\+ Catat Pengeluaran Baru/i })
    await user.click(newExpenseBtns[0]!)

    await waitFor(() => {
      expect(screen.getByText(/Catat Pengeluaran Operasional \(OPEX\)/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/Misal: Pembelian 2 Tabung Gas LPG 50kg/i)).toBeInTheDocument()
    })
  })

  it('switches to Tab 4 Analisis Titik Impas (BEP) and displays Prime Cost breakdown', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <FinancialReportsPage />
      </MemoryRouter>,
    )

    const tab4Btn = screen.getByRole('button', { name: /4\. Analisis Titik Impas \(BEP\)/i })
    await user.click(tab4Btn)

    await waitFor(() => {
      expect(screen.getByText(/Bedah Prime Cost F&B Restoran/i)).toBeInTheDocument()
      expect(screen.getByText(/Rumus Titik Impas \(\*Break-Even Point\*\)/i)).toBeInTheDocument()
      expect(screen.getByText(/TARGET BEP HARIAN RESTO/i)).toBeInTheDocument()
    })
  })
})
