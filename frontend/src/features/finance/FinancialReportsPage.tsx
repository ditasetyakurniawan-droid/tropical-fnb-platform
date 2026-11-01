import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp,
  PieChart,
  Calendar,
  RefreshCw,
  Printer,
  Plus,
  Building2,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Receipt,
  Scale,
} from 'lucide-react'
import { useAuthStore } from '@/features/auth/auth-store'
import { formatIDR } from '@/shared/utils/currency'
import { NumberInput } from '@/shared/ui/NumberInput'
import { SmoothNumber } from '@/shared/ui/SmoothNumber'
import { cn } from '@/shared/lib/cn'
import { PageTransition } from '@/shared/components/transitions/PageTransition'
import {
  RealtimeFinancialCharts,
} from './components/RealtimeFinancialCharts'
import {
  fetchPnL,
  fetchBEP,
  fetchExpenses,
  fetchExpenseCategories,
  createExpense,
  type PnLSummary,
  type BEPSummary,
  type OperatingExpense,
  type ExpenseCategory,
} from './finance-api'

type TabKey = 'executive-cockpit' | 'pnl-statement' | 'expense-tracker' | 'bep-analysis'

/**
 * Calculates start and end dates based on the selected period filter
 */
function getPeriodDates(period: string): { startDate: string; endDate: string } {
  const now = new Date()
  const toYMD = (d: Date) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  if (period === 'TODAY') {
    const today = toYMD(now)
    return { startDate: today, endDate: today }
  }
  if (period === 'WEEK') {
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(now.getDate() - 6)
    return { startDate: toYMD(sevenDaysAgo), endDate: toYMD(now) }
  }
  if (period === 'YEAR') {
    const startOfYear = new Date(now.getFullYear(), 0, 1)
    return { startDate: toYMD(startOfYear), endDate: toYMD(now) }
  }
  // Default: MTD (Bulan Berjalan)
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  return { startDate: toYMD(firstDayOfMonth), endDate: toYMD(now) }
}

export function FinancialReportsPage() {
  const accessibleOutlets = useAuthStore((s) => s.accessibleOutlets)
  const isGlobalAll = useAuthStore((s) => s.isGlobalAllOutlets)
  const activeOutletId = useAuthStore((s) => s.activeOutletId)
  const activeOutlet = useAuthStore((s) => s.getActiveOutlet())

  const defaultOutlet = isGlobalAll ? 'ALL' : (activeOutletId || accessibleOutlets[0]?.id || 'ALL')

  const [activeTab, setActiveTab] = useState<TabKey>('executive-cockpit')
  const [selectedOutlet, setSelectedOutlet] = useState<string>(defaultOutlet)
  const [selectedPeriod, setSelectedPeriod] = useState<string>('MTD') // MTD, TODAY, WEEK, YEAR
  const [isLoading, setIsLoading] = useState(false)

  // State data
  const [pnl, setPnl] = useState<PnLSummary | null>(null)
  const [bep, setBep] = useState<BEPSummary | null>(null)
  const [expenses, setExpenses] = useState<OperatingExpense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])

  // Modal State for New Expense
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
  const [expenseForm, setExpenseForm] = useState({
    title: '',
    category_id: '',
    amount: 0,
    payment_method: 'PETTY_CASH',
    receipt_ref: '',
    notes: '',
    expense_date: new Date().toISOString().split('T')[0],
  })
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false)
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const { startDate, endDate } = getPeriodDates(selectedPeriod)
      const [pnlData, bepData, expData, catData] = await Promise.all([
        fetchPnL(selectedOutlet, startDate, endDate),
        fetchBEP(selectedOutlet),
        fetchExpenses(selectedOutlet, startDate, endDate),
        fetchExpenseCategories(),
      ])

      setPnl(pnlData)
      setBep(bepData)
      setExpenses(expData)
      setCategories(catData)
      if (catData.length > 0 && catData[0]) {
        setExpenseForm((prev) => ({ ...prev, category_id: prev.category_id || catData[0]!.id }))
      }
    } catch (err) {
      console.error('Failed to load finance data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [selectedOutlet, selectedPeriod])

  useEffect(() => {
    let isCancelled = false
    const init = async () => {
      await Promise.resolve()
      if (!isCancelled) {
        await loadData()
      }
    }
    void init()
    return () => {
      isCancelled = true
    }
  }, [loadData])

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expenseForm.title || expenseForm.amount <= 0 || !expenseForm.category_id) {
      alert('Mohon lengkapi judul, kategori, dan nominal pengeluaran.')
      return
    }

    setIsSubmittingExpense(true)
    try {
      await createExpense({
        ...expenseForm,
        outlet_id: selectedOutlet === 'ALL' ? null : selectedOutlet,
      })

      setNotificationMsg('✅ Pengeluaran operasional berhasil dicatat & masuk buku kas!')
      setTimeout(() => setNotificationMsg(null), 4000)
      setIsExpenseModalOpen(false)
      setExpenseForm({
        title: '',
        category_id: categories[0]?.id || '',
        amount: 0,
        payment_method: 'PETTY_CASH',
        receipt_ref: '',
        notes: '',
        expense_date: new Date().toISOString().split('T')[0],
      })
      await loadData()
    } catch (err) {
      console.error('Failed to create expense:', err)
      alert('Gagal menyimpan pengeluaran operasional.')
    } finally {
      setIsSubmittingExpense(false)
    }
  }

  return (
    <PageTransition className="space-y-6 max-w-7xl mx-auto pb-12 tropical-glass">
      {/* Toast Notification */}
      {notificationMsg && (
        <div className="fixed top-16 right-6 z-50 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-2xl flex items-center gap-2 animate-bounce border border-emerald-400/40">
          <Sparkles className="size-5" />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* Golden Reference Header Panel (Warm Sage Frosted Glass) with Integrated 4 Command Cards */}
      <div data-spot="panel" className="bg-white/95 rounded-3xl p-6 shadow-sm border border-slate-200/90 transition-all">
        {/* Milestone & Standard Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-300">
            MILESTONE 6 — KEUANGAN &amp; LABA RUGI
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
            STANDAR USALI HOSPITALITY
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200">
            REALTIME MARGIN &amp; BEP
          </span>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-md shadow-emerald-500/20">
                <TrendingUp className="size-6" />
              </div>
              <div>
                <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
                  Laporan Keuangan &amp; Laba Rugi Realtime (P&amp;L)
                </h1>
                <p className="mt-0.5 text-xs text-slate-600 font-medium">
                  Kalkulasi Margin Bersih (*Net Margin*), Biaya Operasional (OPEX), dan Titik Impas (BEP) Standar F&amp;B
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Outlet Selector */}
            {isGlobalAll ? (
              <div className="flex items-center gap-2 bg-white border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs">
                <Building2 className="size-4 text-emerald-600" />
                <select
                  value={selectedOutlet}
                  onChange={(e) => setSelectedOutlet(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold text-slate-900 focus:outline-hidden cursor-pointer"
                  aria-label="Filter Outlet"
                >
                  <option value="ALL">Semua Resto (Konsolidasi Group)</option>
                  {accessibleOutlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 shadow-2xs">
                <Building2 className="size-4 text-emerald-600" />
                <span>{activeOutlet?.name ?? 'Cabang Resto'}</span>
                <span className="text-[10px] text-slate-500 font-mono">[🔒 {activeOutlet?.code ?? 'RESTO'}]</span>
              </div>
            )}

            {/* Period Selector */}
            <div className="flex items-center gap-2 bg-white border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs">
              <Calendar className="size-4 text-emerald-600" />
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="bg-transparent border-none text-xs font-bold text-slate-900 focus:outline-hidden cursor-pointer"
                aria-label="Filter Periode"
              >
                <option value="MTD">Bulan Berjalan (Oktober 2026)</option>
                <option value="TODAY">Hari Ini (Realtime)</option>
                <option value="WEEK">7 Hari Terakhir</option>
                <option value="YEAR">Tahun 2026 (YTD)</option>
              </select>
            </div>

            {/* Refresh Action */}
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              title="Segarkan Data Realtime"
            >
              <RefreshCw className={cn('size-3.5 text-emerald-600', isLoading && 'animate-spin')} />
              <span>Segarkan</span>
            </button>

            {/* New Expense Button */}
            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(true)}
              aria-label="+ Catat Pengeluaran Baru"
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="size-4" />
              <span>Catat Pengeluaran Baru</span>
            </button>
          </div>
        </div>

        {/* 4 Navigation Command Cards (The 4 interactive buttons with clear high-contrast affordance) */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Tab 1: Kokpit & Waterfall Kas */}
          <button
            type="button"
            onClick={() => setActiveTab('executive-cockpit')}
            data-spot="workflow"
            data-active={activeTab === 'executive-cockpit'}
            aria-pressed={activeTab === 'executive-cockpit'}
            className={cn(
              'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
              activeTab === 'executive-cockpit'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/25 ring-2 ring-emerald-400/40 border-emerald-500'
                : 'bg-white hover:bg-emerald-50/40 border-slate-200/90 hover:border-emerald-300 text-slate-800 shadow-2xs'
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={cn(
                  'p-1.5 rounded-lg',
                  activeTab === 'executive-cockpit' ? 'bg-emerald-500/50 text-white' : 'bg-emerald-100 text-emerald-800'
                )}
              >
                <TrendingUp className="size-4" />
              </div>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-bold rounded-full',
                  activeTab === 'executive-cockpit' ? 'bg-white text-emerald-700' : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                )}
              >
                Realtime
              </span>
            </div>
            <div className="mt-2.5">
              <div className={cn('text-xs font-bold', activeTab === 'executive-cockpit' ? 'text-white' : 'text-slate-900')}>
                1. Kokpit &amp; Waterfall Kas
              </div>
              <div className={cn('text-[11px] font-semibold', activeTab === 'executive-cockpit' ? 'text-emerald-100' : 'text-slate-600')}>
                Diagram Aliran Kas &amp; BEP Harian
              </div>
            </div>
          </button>

          {/* Tab 2: Tabel Laporan Laba Rugi */}
          <button
            type="button"
            onClick={() => setActiveTab('pnl-statement')}
            data-spot="workflow"
            data-active={activeTab === 'pnl-statement'}
            aria-pressed={activeTab === 'pnl-statement'}
            className={cn(
              'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
              activeTab === 'pnl-statement'
                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-500/25 ring-2 ring-teal-400/40 border-teal-500'
                : 'bg-white hover:bg-teal-50/40 border-slate-200/90 hover:border-teal-300 text-slate-800 shadow-2xs'
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={cn(
                  'p-1.5 rounded-lg',
                  activeTab === 'pnl-statement' ? 'bg-teal-500/50 text-white' : 'bg-teal-100 text-teal-800'
                )}
              >
                <PieChart className="size-4" />
              </div>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-bold rounded-full',
                  activeTab === 'pnl-statement' ? 'bg-white text-teal-700' : 'bg-teal-100 text-teal-900 border border-teal-200'
                )}
              >
                Standar USALI
              </span>
            </div>
            <div className="mt-2.5">
              <div className={cn('text-xs font-bold', activeTab === 'pnl-statement' ? 'text-white' : 'text-slate-900')}>
                2. Tabel Laporan Laba Rugi
              </div>
              <div className={cn('text-[11px] font-semibold', activeTab === 'pnl-statement' ? 'text-teal-100' : 'text-slate-600')}>
                Format Resmi Perhotelan &amp; F&amp;B
              </div>
            </div>
          </button>

          {/* Tab 3: Buku Pengeluaran (OPEX) */}
          <button
            type="button"
            onClick={() => setActiveTab('expense-tracker')}
            data-spot="workflow"
            data-active={activeTab === 'expense-tracker'}
            aria-pressed={activeTab === 'expense-tracker'}
            className={cn(
              'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
              activeTab === 'expense-tracker'
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-500/25 ring-2 ring-indigo-400/40 border-indigo-500'
                : 'bg-white hover:bg-indigo-50/40 border-slate-200/90 hover:border-indigo-300 text-slate-800 shadow-2xs'
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={cn(
                  'p-1.5 rounded-lg',
                  activeTab === 'expense-tracker' ? 'bg-indigo-500/50 text-white' : 'bg-indigo-100 text-indigo-800'
                )}
              >
                <Receipt className="size-4" />
              </div>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-bold rounded-full',
                  activeTab === 'expense-tracker' ? 'bg-white text-indigo-700' : 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                )}
              >
                <SmoothNumber value={expenses.length} format="number" /> Transaksi
              </span>
            </div>
            <div className="mt-2.5">
              <div className={cn('text-xs font-bold', activeTab === 'expense-tracker' ? 'text-white' : 'text-slate-900')}>
                3. Buku Pengeluaran (OPEX)
              </div>
              <div className={cn('text-[11px] font-semibold', activeTab === 'expense-tracker' ? 'text-indigo-100' : 'text-slate-600')}>
                Gas LPG, Listrik, Kolam &amp; Packaging
              </div>
            </div>
          </button>

          {/* Tab 4: Analisis Titik Impas (BEP) */}
          <button
            type="button"
            onClick={() => setActiveTab('bep-analysis')}
            data-spot="workflow"
            data-active={activeTab === 'bep-analysis'}
            aria-pressed={activeTab === 'bep-analysis'}
            className={cn(
              'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
              activeTab === 'bep-analysis'
                ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-400/40 border-amber-500'
                : 'bg-white hover:bg-amber-50/40 border-slate-200/90 hover:border-amber-300 text-slate-800 shadow-2xs'
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={cn(
                  'p-1.5 rounded-lg',
                  activeTab === 'bep-analysis' ? 'bg-amber-500/50 text-white' : 'bg-amber-100 text-amber-800'
                )}
              >
                <Scale className="size-4" />
              </div>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-bold rounded-full',
                  activeTab === 'bep-analysis' ? 'bg-white text-amber-800' : 'bg-amber-100 text-amber-900 border border-amber-200'
                )}
              >
                Prime Cost
              </span>
            </div>
            <div className="mt-2.5">
              <div className={cn('text-xs font-bold', activeTab === 'bep-analysis' ? 'text-white' : 'text-slate-900')}>
                4. Analisis Titik Impas (BEP)
              </div>
              <div className={cn('text-[11px] font-semibold', activeTab === 'bep-analysis' ? 'text-amber-100' : 'text-slate-600')}>
                Simulasi Beban Tetap vs Margin
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* TAB 1: EXECUTIVE COCKPIT & WATERFALL FLOW */}
      {activeTab === 'executive-cockpit' && pnl && (
        <div className="space-y-6">
          {/* Top KPI Metric Cards - Glassy V14 with Smooth Rolling Numbers */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
            {/* Net Sales */}
            <div data-spot="stat" className="glass-panel-v14 rounded-3xl p-4 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-0.5 animate-glass-card stagger-1 relative overflow-hidden group">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Penjualan Bersih</span>
              <p className="mt-1 text-base lg:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                <SmoothNumber value={pnl.net_sales} format="idr" />
              </p>
              <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                <span>Omzet Bersih Kasir</span>
              </div>
            </div>

            {/* Real COGS */}
            <div data-spot="stat" className="glass-panel-v14 rounded-3xl p-4 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-0.5 animate-glass-card stagger-2 relative overflow-hidden group">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">HPP Bahan (COGS)</span>
              <p className="mt-1 text-base lg:text-lg font-black text-rose-600 dark:text-rose-400 tracking-tight">
                <SmoothNumber value={pnl.total_cogs} format="idr" />
              </p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Rasio HPP</span>
                <span className="rounded-md bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                  <SmoothNumber value={pnl.cogs_pct} format="percent" decimals={1} />
                </span>
              </div>
            </div>

            {/* Gross Profit */}
            <div data-spot="stat" className="glass-panel-v14 rounded-3xl p-4 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-0.5 animate-glass-card stagger-3 relative overflow-hidden group">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Laba Kotor</span>
              <p className="mt-1 text-base lg:text-lg font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                <SmoothNumber value={pnl.gross_profit} format="idr" />
              </p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Margin Kotor</span>
                <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  <SmoothNumber value={pnl.gross_margin_pct} format="percent" decimals={1} />
                </span>
              </div>
            </div>

            {/* Labor Cost */}
            <div data-spot="stat" className="glass-panel-v14 rounded-3xl p-4 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-0.5 animate-glass-card stagger-4 relative overflow-hidden group">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Gaji Staf (M5)</span>
              <p className="mt-1 text-base lg:text-lg font-black text-amber-600 dark:text-amber-400 tracking-tight">
                <SmoothNumber value={pnl.labor_cost} format="idr" />
              </p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Rasio Gaji</span>
                <span className="rounded-md bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                  <SmoothNumber value={pnl.labor_pct} format="percent" decimals={1} />
                </span>
              </div>
            </div>

            {/* Total OPEX */}
            <div data-spot="stat" className="glass-panel-v14 rounded-3xl p-4 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-0.5 animate-glass-card stagger-5 relative overflow-hidden group">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">OPEX Operasional</span>
              <p className="mt-1 text-base lg:text-lg font-black text-indigo-600 dark:text-indigo-400 tracking-tight">
                <SmoothNumber value={pnl.total_opex} format="idr" />
              </p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Rasio OPEX</span>
                <span className="rounded-md bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                  <SmoothNumber value={pnl.opex_pct} format="percent" decimals={1} />
                </span>
              </div>
            </div>

            {/* Net Profit (Adaptive: emerald when positive, rose when negative) */}
            <div
              data-spot="stat"
              className={cn(
                'rounded-3xl p-4 shadow-xl hover:shadow-2xl backdrop-blur-2xl transition-all duration-300 hover:-translate-y-0.5 animate-glass-card stagger-6 relative overflow-hidden',
                pnl.net_profit >= 0
                  ? 'border border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 via-white/80 to-teal-500/10 dark:from-emerald-950/40 dark:via-slate-900/80 dark:to-teal-950/20 shadow-emerald-500/10'
                  : 'border border-rose-500/40 bg-gradient-to-br from-rose-500/15 via-white/80 to-orange-500/10 dark:from-rose-950/40 dark:via-slate-900/80 dark:to-orange-950/20 shadow-rose-500/10',
              )}
            >
              <span
                className={cn(
                  'text-[11px] font-black uppercase tracking-wider',
                  pnl.net_profit >= 0 ? 'text-emerald-900 dark:text-emerald-300' : 'text-rose-900 dark:text-rose-300',
                )}
              >
                Laba Bersih Riil
              </span>
              <p
                className={cn(
                  'mt-1 text-base lg:text-lg font-black tracking-tight',
                  pnl.net_profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400',
                )}
              >
                <SmoothNumber value={pnl.net_profit} format="idr" />
              </p>
              <div className="mt-1.5 flex items-center justify-between">
                <span
                  className={cn(
                    'text-[10px] font-semibold',
                    pnl.net_profit >= 0 ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300',
                  )}
                >
                  Margin Bersih
                </span>
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-black text-white shadow-xs',
                    pnl.net_profit >= 0 ? 'bg-emerald-600' : 'bg-rose-600',
                  )}
                >
                  <SmoothNumber value={pnl.net_margin_pct} format="percent" decimals={1} />
                </span>
              </div>
            </div>
          </div>

          {/* Realtime Animated Charts (Contracts & Deals Donut + Cash Flow & Revenue Spline Area) */}
          <RealtimeFinancialCharts
            netSales={pnl.net_sales}
            totalCOGS={pnl.total_cogs}
            laborCost={pnl.labor_cost}
            totalOpex={pnl.total_opex}
            netProfit={pnl.net_profit}
            monthlyTrends={pnl.monthly_trends}
            categoryBreakdown={pnl.category_breakdown}
          />

          {/* Daily BEP Realtime Progress Gauge - Glassy V14 */}
          {bep && (
            <div data-spot="panel" className="glass-panel-v14 rounded-3xl p-5 sm:p-6 shadow-xl animate-glass-card stagger-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white font-bold text-xs shadow-md shadow-amber-500/20">
                    ⚡
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Titik Impas Harian (*Daily Break-Even Point / BEP*)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Target omzet minimum harian untuk menutup biaya sewa, gaji, dan utilitas restoran
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {bep.is_bep_reached ? (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-emerald-100/90 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700/60 text-emerald-900 dark:text-emerald-300 font-bold text-xs shadow-xs">
                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                      <span>🎉 Titik Impas Tercapai pukul {bep.bep_reached_time} (Zona Laba Murni)</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-amber-100/90 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/60 text-amber-900 dark:text-amber-300 font-bold text-xs shadow-xs">
                      <span>Sedang Menuju Titik Impas (<SmoothNumber value={bep.today_progress_pct} format="percent" decimals={1} />)</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>
                    Omzet Hari Ini: <strong className="text-slate-900 dark:text-white"><SmoothNumber value={bep.today_revenue} format="idr" /></strong>
                  </span>
                  <span>
                    Target BEP Harian: <strong className="text-slate-900 dark:text-white"><SmoothNumber value={bep.daily_bep_amount} format="idr" /></strong>
                  </span>
                </div>
                <div className="w-full bg-slate-100/80 dark:bg-slate-800/80 rounded-full h-4 overflow-hidden border border-slate-200/80 dark:border-slate-700 p-0.5 shadow-inner">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-700 flex items-center justify-end pr-2 text-[10px] font-black text-white shadow-sm',
                      bep.is_bep_reached
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                        : 'bg-gradient-to-r from-amber-500 to-orange-500',
                    )}
                    style={{ width: `${Math.min(bep.today_progress_pct, 100)}%` }}
                  >
                    <SmoothNumber value={bep.today_progress_pct} format="percent" decimals={1} />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  *Setiap transaksi di atas <strong><SmoothNumber value={bep.daily_bep_amount} format="idr" /></strong> langsung berkontribusi murni 68% ke Margin Bersih restoran setelah dipotong HPP bahan.
                </p>
              </div>
            </div>
          )}

          {/* Realtime P&L Waterfall / Cash Flow Diagram - Glassy V14 */}
          <div data-spot="panel" className="glass-panel-v14 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4 animate-glass-card stagger-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <PieChart className="size-4 text-emerald-600" />
                  <span>Diagram Aliran Finansial F&amp;B (*P&amp;L Financial Waterfall Flow*)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Visualisasi transparan pemotongan pendapatan dari konsumen hingga menghasilkan Laba Bersih
                </p>
              </div>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md px-3 py-1 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-xs">
                Periode: {pnl.period_label}
              </span>
            </div>

            {/* Waterfall Flow Nodes */}
            <div className="grid grid-cols-1 md:grid-cols-7 gap-2.5 text-center pt-2">
              {/* Step 1: Gross Sales */}
              <div className="flex flex-col justify-between p-3.5 rounded-2xl bg-white/50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 shadow-xs hover:shadow-md transition-all">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">1. Omzet Kotor</span>
                <p className="text-sm font-black text-slate-900 dark:text-white my-1">
                  <SmoothNumber value={pnl.gross_sales} format="idr" />
                </p>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">100% Billing</span>
              </div>

              {/* Step 2: Discounts */}
              <div className="flex flex-col justify-between p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/50 shadow-xs hover:shadow-md transition-all">
                <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase">2. (-) Diskon/Promo</span>
                <p className="text-sm font-black text-rose-800 dark:text-rose-300 my-1">
                  -<SmoothNumber value={pnl.discounts} format="idr" />
                </p>
                <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-400">Voucher &amp; Promo</span>
              </div>

              {/* Step 3: Net Sales */}
              <div className="flex flex-col justify-between p-3.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/50 shadow-xs hover:shadow-md transition-all">
                <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase">3. (=) Penjualan Bersih</span>
                <p className="text-sm font-black text-blue-900 dark:text-blue-200 my-1">
                  <SmoothNumber value={pnl.net_sales} format="idr" />
                </p>
                <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400">Dasar Perhitungan</span>
              </div>

              {/* Step 4: COGS */}
              <div className="flex flex-col justify-between p-3.5 rounded-2xl bg-orange-50/70 dark:bg-orange-950/40 border border-orange-200/80 dark:border-orange-900/50 shadow-xs hover:shadow-md transition-all">
                <span className="text-[10px] font-bold text-orange-700 dark:text-orange-400 uppercase">4. (-) HPP &amp; Waste</span>
                <p className="text-sm font-black text-orange-900 dark:text-orange-200 my-1">
                  -<SmoothNumber value={pnl.total_cogs} format="idr" />
                </p>
                <span className="text-[10px] font-bold text-orange-800 dark:text-orange-300">
                  <SmoothNumber value={pnl.cogs_pct} format="percent" decimals={1} /> Rasio HPP
                </span>
              </div>

              {/* Step 5: Labor Cost */}
              <div className="flex flex-col justify-between p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/50 shadow-xs hover:shadow-md transition-all">
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">5. (-) Gaji Staf</span>
                <p className="text-sm font-black text-amber-900 dark:text-amber-200 my-1">
                  -<SmoothNumber value={pnl.labor_cost} format="idr" />
                </p>
                <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300">
                  <SmoothNumber value={pnl.labor_pct} format="percent" decimals={1} /> Rasio Gaji
                </span>
              </div>

              {/* Step 6: Other OPEX */}
              <div className="flex flex-col justify-between p-3.5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200/80 dark:border-purple-900/50 shadow-xs hover:shadow-md transition-all">
                <span className="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase">6. (-) Gas, PLN, Kolam</span>
                <p className="text-sm font-black text-purple-900 dark:text-purple-200 my-1">
                  -<SmoothNumber value={pnl.total_opex - pnl.labor_cost} format="idr" />
                </p>
                <span className="text-[10px] font-bold text-purple-800 dark:text-purple-300">
                  <SmoothNumber
                    value={pnl.net_sales > 0 ? ((pnl.total_opex - pnl.labor_cost) / pnl.net_sales) * 100 : 0}
                    format="percent"
                    decimals={1}
                  />{' '}
                  Biaya Tetap
                </span>
              </div>

              {/* Step 7: NET PROFIT */}
              <div className="flex flex-col justify-between p-3.5 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-lg shadow-emerald-600/30 border border-emerald-400/40 hover:shadow-xl transition-all">
                <span className="text-[10px] font-black text-emerald-200 uppercase">7. (=) Laba Bersih</span>
                <p className="text-sm font-black text-white my-1">
                  <SmoothNumber value={pnl.net_profit} format="idr" />
                </p>
                <span className="text-[10px] font-black bg-white/20 rounded-md py-0.5">
                  <SmoothNumber value={pnl.net_margin_pct} format="percent" decimals={1} /> NET MARGIN
                </span>
              </div>
            </div>

            {/* Prime Cost Rule Banner */}
            <div className="flex items-center justify-between rounded-2xl bg-white/50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 p-3.5 text-xs backdrop-blur-md">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-600" />
                <span>
                  <strong>
                    Prime Cost Resto (HPP + Gaji): <SmoothNumber value={pnl.prime_cost_pct} format="percent" decimals={1} />
                  </strong>{' '}
                  (Nilai: <SmoothNumber value={pnl.prime_cost} format="idr" />). Standar industri restoran sehat internasional berada di bawah <strong>60.0%</strong>.
                </span>
              </div>
              <span
                className={cn(
                  'px-2.5 py-1 rounded-xl font-bold text-[11px] shadow-2xs',
                  pnl.prime_cost_pct <= 65
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
                )}
              >
                {pnl.prime_cost_pct <= 65 ? 'STATUS: SEHAT & EFISIEN' : 'PERINGATAN: OVERBUDGET'}
              </span>
            </div>
          </div>

          {/* Per-Outlet Comparative Summary - Glassy V14 */}
          <div data-spot="panel" className="glass-panel-v14 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4 animate-glass-card stagger-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="size-4 text-emerald-600" />
              <span>Performa Laba Bersih Antar-Outlet (Steak House vs Garden Resto)</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pnl.outlets.map((out) => (
                <div key={out.outlet_id} className="rounded-2xl border border-white/60 dark:border-slate-800 bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl p-4 shadow-sm hover:shadow-md transition-all space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/80 pb-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">{out.outlet_name}</span>
                    <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-2 py-0.5 rounded-lg border border-emerald-500/20">
                      Margin: <SmoothNumber value={out.net_margin_pct} format="percent" decimals={1} />
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Penjualan Bersih:</span>
                      <p className="font-bold text-slate-900 dark:text-white">
                        <SmoothNumber value={out.net_sales} format="idr" />
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Beban HPP (COGS):</span>
                      <p className="font-bold text-rose-600 dark:text-rose-400">
                        <SmoothNumber value={out.total_cogs} format="idr" />
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Beban Gaji &amp; OPEX:</span>
                      <p className="font-bold text-amber-600 dark:text-amber-400">
                        <SmoothNumber value={out.total_opex} format="idr" />
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Laba Bersih Riil:</span>
                      <p className="font-black text-emerald-600 dark:text-emerald-400">
                        <SmoothNumber value={out.net_profit} format="idr" />
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: P&L FORMAL STATEMENT TABLE (USALI) - Glassy V14 */}
      {activeTab === 'pnl-statement' && pnl && (
        <div data-spot="table" className="glass-panel-v14 rounded-3xl shadow-xl overflow-hidden animate-glass-card stagger-1">
          {/* Header Actions */}
          <div className="p-5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Laporan Laba Rugi Eksekutif (Income Statement / P&amp;L)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Format Standar Asosiasi Restoran &amp; Perhotelan (USALI) • Periode: {pnl.period_label}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 rounded-xl bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-300 text-emerald-800 px-4 py-2 text-xs font-bold transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
              >
                <Printer className="size-4 text-emerald-700" />
                <span>Cetak / Simpan PDF Laporan Laba Rugi</span>
              </button>
            </div>
          </div>

          {/* Detailed Statement Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Komponen Laba Rugi F&amp;B</th>
                  <th className="px-4 py-3 text-right">Nilai Rupiah</th>
                  <th className="px-4 py-3 text-right">% Terhadap Net Sales</th>
                  <th className="px-4 py-3">Keterangan Akuntansi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {/* 1. REVENUE SECTION */}
                <tr className="bg-slate-50/70 font-bold text-slate-900">
                  <td className="px-4 py-2.5 text-emerald-800" colSpan={4}>
                    1. PENDAPATAN OPERASIONAL (REVENUE)
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2 pl-8">Penjualan Makanan &amp; Minuman Kotor (Gross Sales)</td>
                  <td className="px-4 py-2 text-right">{formatIDR(pnl.gross_sales)}</td>
                  <td className="px-4 py-2 text-right">100.0%</td>
                  <td className="px-4 py-2 text-slate-500">Total struk transaksi kasir sebelum diskon</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 pl-8 text-rose-600">(-) Diskon, Promo &amp; Komplain Tamu</td>
                  <td className="px-4 py-2 text-right text-rose-600">({formatIDR(pnl.discounts)})</td>
                  <td className="px-4 py-2 text-right text-rose-600">
                    {Math.round((pnl.discounts / pnl.net_sales) * 1000) / 10}%
                  </td>
                  <td className="px-4 py-2 text-slate-500">Potongan voucher &amp; diskon promo member</td>
                </tr>
                <tr className="bg-blue-50/50 font-bold text-blue-900">
                  <td className="px-4 py-2.5 pl-6">TOTAL PENJUALAN BERSIH (NET SALES)</td>
                  <td className="px-4 py-2.5 text-right font-black">{formatIDR(pnl.net_sales)}</td>
                  <td className="px-4 py-2.5 text-right font-black">100.0%</td>
                  <td className="px-4 py-2.5 text-blue-800">Basis utama persentase performa resto</td>
                </tr>

                {/* 2. COGS SECTION */}
                <tr className="bg-slate-50/70 font-bold text-slate-900">
                  <td className="px-4 py-2.5 text-orange-800" colSpan={4}>
                    2. HARGA POKOK PENJUALAN (COST OF GOODS SOLD / COGS)
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2 pl-8">Bahan Baku Makanan &amp; Minuman Terjual (Recipe BOM)</td>
                  <td className="px-4 py-2 text-right text-rose-700">({formatIDR(pnl.food_cost)})</td>
                  <td className="px-4 py-2 text-right">
                    {Math.round((pnl.food_cost / pnl.net_sales) * 1000) / 10}%
                  </td>
                  <td className="px-4 py-2 text-slate-500">Dihitung dari Moving Average Cost (MAC) riil gudang</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 pl-8">Selisih Opname Gudang &amp; Waste Basi/Rusak</td>
                  <td className="px-4 py-2 text-right text-rose-700">({formatIDR(pnl.waste_and_shrinkage)})</td>
                  <td className="px-4 py-2 text-right">
                    {Math.round((pnl.waste_and_shrinkage / pnl.net_sales) * 1000) / 10}%
                  </td>
                  <td className="px-4 py-2 text-slate-500">Catatan bahan rusak, kedaluwarsa &amp; susut timbangan</td>
                </tr>
                <tr className="bg-orange-50/50 font-bold text-orange-950">
                  <td className="px-4 py-2.5 pl-6">TOTAL HPP BAHAN BAKU (COGS)</td>
                  <td className="px-4 py-2.5 text-right font-black text-rose-700">({formatIDR(pnl.total_cogs)})</td>
                  <td className="px-4 py-2.5 text-right font-black">{pnl.cogs_pct}%</td>
                  <td className="px-4 py-2.5 text-orange-800">Standar F&amp;B Sehat: &lt; 35%</td>
                </tr>

                {/* 3. GROSS PROFIT */}
                <tr className="bg-emerald-50/60 font-black text-emerald-950 text-xs">
                  <td className="px-4 py-3">LABA KOTOR (GROSS MARGIN)</td>
                  <td className="px-4 py-3 text-right text-emerald-800 text-sm">{formatIDR(pnl.gross_profit)}</td>
                  <td className="px-4 py-3 text-right text-emerald-800 text-sm">{pnl.gross_margin_pct}%</td>
                  <td className="px-4 py-3 text-emerald-800">Laba penjualan setelah bahan baku</td>
                </tr>

                {/* 4. OPEX SECTION */}
                <tr className="bg-slate-50/70 font-bold text-slate-900">
                  <td className="px-4 py-2.5 text-indigo-800" colSpan={4}>
                    3. BIAYA OPERASIONAL (OPERATING EXPENSES / OPEX)
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2 pl-8">Beban Gaji Karyawan, Lembur &amp; Tunjangan (Labor Payroll)</td>
                  <td className="px-4 py-2 text-right text-amber-700">({formatIDR(pnl.labor_cost)})</td>
                  <td className="px-4 py-2 text-right">{pnl.labor_pct}%</td>
                  <td className="px-4 py-2 text-slate-500">Beban gaji 12 karyawan tetap &amp; harian (M5)</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 pl-8">Utilitas &amp; Bahan Bakar (Listrik PLN &amp; Gas LPG Dapur)</td>
                  <td className="px-4 py-2 text-right">({formatIDR(pnl.utilities_and_fuel)})</td>
                  <td className="px-4 py-2 text-right">
                    {Math.round((pnl.utilities_and_fuel / pnl.net_sales) * 1000) / 10}%
                  </td>
                  <td className="px-4 py-2 text-slate-500">Tabung gas 50kg, token listrik 11.000 VA</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 pl-8">Perawatan Kolam Koi, Kebun Gazebo &amp; Sanitasi</td>
                  <td className="px-4 py-2 text-right">({formatIDR(pnl.maintenance_ambiance)})</td>
                  <td className="px-4 py-2 text-right">
                    {Math.round((pnl.maintenance_ambiance / pnl.net_sales) * 1000) / 10}%
                  </td>
                  <td className="px-4 py-2 text-slate-500">Pakan koi Manding, pupuk taman, ozon filter kolam</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 pl-8">Bahan Habis Pakai &amp; Box Packaging Takeaway</td>
                  <td className="px-4 py-2 text-right">({formatIDR(pnl.consumables_packaging)})</td>
                  <td className="px-4 py-2 text-right">
                    {Math.round((pnl.consumables_packaging / pnl.net_sales) * 1000) / 10}%
                  </td>
                  <td className="px-4 py-2 text-slate-500">Kotak steak kraft, tas spunbond, tisu, sabun cuci</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 pl-8">Pemasaran, Iklan Instagram &amp; Event Sponsorship</td>
                  <td className="px-4 py-2 text-right">({formatIDR(pnl.marketing_promo)})</td>
                  <td className="px-4 py-2 text-right">
                    {Math.round((pnl.marketing_promo / pnl.net_sales) * 1000) / 10}%
                  </td>
                  <td className="px-4 py-2 text-slate-500">Promosi digital weekend &amp; standing banner</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 pl-8">Sewa Properti &amp; Retribusi Daerah Manding</td>
                  <td className="px-4 py-2 text-right">({formatIDR(pnl.rent_and_property)})</td>
                  <td className="px-4 py-2 text-right">
                    {Math.round((pnl.rent_and_property / pnl.net_sales) * 1000) / 10}%
                  </td>
                  <td className="px-4 py-2 text-slate-500">Alokasi beban sewa bulanan dan kebersihan</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 pl-8">Administrasi, Wifi Fiber Dedicated &amp; Lisensi</td>
                  <td className="px-4 py-2 text-right">({formatIDR(pnl.admin_and_tech)})</td>
                  <td className="px-4 py-2 text-right">
                    {Math.round((pnl.admin_and_tech / pnl.net_sales) * 1000) / 10}%
                  </td>
                  <td className="px-4 py-2 text-slate-500">Internet dedicated Cloud POS, KDS &amp; struk kasir</td>
                </tr>
                <tr className="bg-indigo-50/50 font-bold text-indigo-950">
                  <td className="px-4 py-2.5 pl-6">TOTAL BIAYA OPERASIONAL (OPEX)</td>
                  <td className="px-4 py-2.5 text-right font-black text-rose-700">({formatIDR(pnl.total_opex)})</td>
                  <td className="px-4 py-2.5 text-right font-black">{pnl.opex_pct}%</td>
                  <td className="px-4 py-2.5 text-indigo-800">Total beban tetap + variabel operasional</td>
                </tr>

                {/* 5. EBITDA */}
                <tr className="bg-slate-100 font-bold text-slate-900">
                  <td className="px-4 py-2.5">LABA OPERASIONAL SEBELUM PAJAK (EBITDA)</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-900">{formatIDR(pnl.ebitda)}</td>
                  <td className="px-4 py-2.5 text-right font-bold">{pnl.ebitda_pct}%</td>
                  <td className="px-4 py-2.5 text-slate-600">Operating profit resto</td>
                </tr>

                {/* 6. TAX */}
                <tr>
                  <td className="px-4 py-2 pl-8 text-slate-600">Pajak Restoran PB1 10% (Titipan Konsumen)</td>
                  <td className="px-4 py-2 text-right text-slate-600">{formatIDR(pnl.tax_pb1)}</td>
                  <td className="px-4 py-2 text-right">10.0%</td>
                  <td className="px-4 py-2 text-slate-500">Disetorkan ke Bapenda Kab. Temanggung</td>
                </tr>

                {/* 7. FINAL NET PROFIT */}
                <tr className="bg-emerald-600 text-white font-black text-sm">
                  <td className="px-4 py-4">LABA BERSIH RIIL RESTORAN (NET PROFIT)</td>
                  <td className="px-4 py-4 text-right text-base font-black">{formatIDR(pnl.net_profit)}</td>
                  <td className="px-4 py-4 text-right text-base font-black">{pnl.net_margin_pct}%</td>
                  <td className="px-4 py-4 text-emerald-100 font-bold text-xs">
                    Laba bersih yang siap dibagikan / reinvestasi
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: OPERATING EXPENSES (EXPENSE TRACKER) - Glassy V14 */}
      {activeTab === 'expense-tracker' && (
        <div className="space-y-4 animate-glass-card stagger-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 glass-panel-v14 p-5 rounded-3xl shadow-xl">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Buku Besar Pengeluaran Operasional Resto (*Operating Expenses Ledger*)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Catat pengeluaran rutin dapur, listrik, gas, kolam, dan perlengkapan resto harian
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(true)}
              aria-label="+ Catat Pengeluaran Baru"
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="size-4" />
              <span>Catat Pengeluaran Baru</span>
            </button>
          </div>

          <div data-spot="table" className="glass-panel-v14 rounded-3xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200/80 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Tanggal &amp; No. Kwitansi</th>
                    <th className="px-4 py-3">Kategori Biaya</th>
                    <th className="px-4 py-3">Deskripsi Pengeluaran</th>
                    <th className="px-4 py-3">Outlet Tujuan</th>
                    <th className="px-4 py-3">Metode Bayar</th>
                    <th className="px-4 py-3 text-right">Nominal Biaya</th>
                    <th className="px-4 py-3">Dicatat Oleh</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        Belum ada catatan pengeluaran pada periode ini.
                      </td>
                    </tr>
                  ) : (
                    expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-bold text-slate-900 block">{exp.expense_date}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {exp.receipt_ref || 'Tanpa No. Kwitansi'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                            {exp.category_name}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-slate-900 block">{exp.title}</span>
                          {exp.notes && <span className="text-[10px] text-slate-500">{exp.notes}</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{exp.outlet_name}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                            {exp.payment_method}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-black text-rose-700 text-sm">
                          {formatIDR(exp.amount)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{exp.recorded_by_name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            {exp.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PRIME COST & BEP ANALYSIS - Glassy V14 */}
      {activeTab === 'bep-analysis' && pnl && bep && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Card: Prime Cost Deep Dive */}
            <div className="glass-panel-v14 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4 animate-glass-card stagger-1">
              <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold shadow-md shadow-emerald-500/20">
                  🥩
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Bedah Prime Cost F&amp;B Restoran</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Kombinasi Beban Pokok Bahan Baku &amp; Biaya Karyawan</p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center p-3 rounded-2xl bg-white/50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">1. HPP Bahan Baku Riil (COGS)</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    <SmoothNumber value={pnl.total_cogs} format="idr" /> (<SmoothNumber value={pnl.cogs_pct} format="percent" decimals={1} />)
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-2xl bg-white/50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">2. Beban Tenaga Kerja (Labor Payroll)</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    <SmoothNumber value={pnl.labor_cost} format="idr" /> (<SmoothNumber value={pnl.labor_pct} format="percent" decimals={1} />)
                  </span>
                </div>
                <div className="flex justify-between items-center p-3.5 rounded-2xl bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/30 dark:border-emerald-700/60 shadow-xs">
                  <div>
                    <span className="font-bold text-emerald-950 dark:text-emerald-200 block">TOTAL PRIME COST</span>
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400">Golden Rule F&amp;B Dunia: &le; 60.0%</span>
                  </div>
                  <span className="font-black text-emerald-900 dark:text-emerald-300 text-base">
                    <SmoothNumber value={pnl.prime_cost} format="idr" /> (<SmoothNumber value={pnl.prime_cost_pct} format="percent" decimals={1} />)
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Di restoran profesional (*Toast &amp; Simphony standard*), jika Prime Cost berada di bawah 60%, restoran memiliki daya tahan finansial yang sangat kuat terhadap fluktuasi harga bahan mentah dan sepi pengunjung.
              </p>
            </div>

            {/* Right Card: BEP Calculation Formula */}
            <div className="glass-panel-v14 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4 animate-glass-card stagger-2">
              <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-bold shadow-md shadow-indigo-500/20">
                  📐
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Rumus Titik Impas (*Break-Even Point*)</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Perhitungan Matematis Balik Modal Operasional Resto</p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center p-2.5 rounded-xl bg-white/50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Beban Biaya Tetap Bulanan (*Fixed Cost*)</span>
                  <span className="font-bold text-slate-900 dark:text-white"><SmoothNumber value={bep.monthly_fixed_cost} format="idr" /></span>
                </div>
                <div className="flex justify-between items-center p-2.5 rounded-xl bg-white/50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Rasio Margin Kontribusi (*1 - COGS%*)</span>
                  <span className="font-bold text-slate-900 dark:text-white"><SmoothNumber value={bep.contribution_margin_ratio * 100} format="percent" decimals={1} /></span>
                </div>
                <div className="flex justify-between items-center p-2.5 rounded-xl bg-white/50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Target BEP Bulanan (Total Omzet)</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400"><SmoothNumber value={bep.monthly_bep_amount} format="idr" /></span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-2xl bg-indigo-500/10 dark:bg-indigo-950/40 border border-indigo-500/30 dark:border-indigo-700/60 shadow-xs">
                  <div>
                    <span className="font-bold text-indigo-950 dark:text-indigo-200 block">TARGET BEP HARIAN RESTO</span>
                    <span className="text-[10px] text-indigo-700 dark:text-indigo-400">Omzet minimum harian toko</span>
                  </div>
                  <span className="font-black text-indigo-900 dark:text-indigo-300 text-base">
                    <SmoothNumber value={bep.daily_bep_amount} format="idr" /> / hari
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Artinya, kasir Tropical F&amp;B harus mengumpulkan minimal <strong><SmoothNumber value={bep.daily_bep_amount} format="idr" /></strong> setiap harinya agar restoran tidak merugi. Penjualan di atas angka tersebut menghasilkan Laba Bersih murni.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CATAT PENGELUARAN BARU */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl shadow-2xl border border-white/20 dark:border-slate-700/80 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 backdrop-blur-md flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-500/20">
                  +
                </span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Catat Pengeluaran Operasional (OPEX)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="p-5 space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Judul / Keperluan Pengeluaran *</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Pembelian 2 Tabung Gas LPG 50kg Dapur Steak"
                  value={expenseForm.title}
                  onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:outline-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kategori Biaya *</label>
                  <select
                    value={expenseForm.category_id}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category_id: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:outline-emerald-600"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tanggal Transaksi *</label>
                  <input
                    type="date"
                    required
                    value={expenseForm.expense_date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:outline-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nominal Biaya (Rp) *</label>
                  <NumberInput
                    value={expenseForm.amount}
                    onChange={(val) => setExpenseForm({ ...expenseForm, amount: val })}
                    min={0}
                    step={1000}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-bold text-slate-900 focus:outline-emerald-600"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Metode Pembayaran</label>
                  <select
                    value={expenseForm.payment_method}
                    onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:outline-emerald-600"
                  >
                    <option value="PETTY_CASH">Kas Kecil (Petty Cash Kasir)</option>
                    <option value="BANK_TRANSFER">Transfer Bank Rekening Resto</option>
                    <option value="CORPORATE_CARD">Kartu Perusahaan (Corporate Card)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Nomor Kwitansi / Nota Fisik</label>
                <input
                  type="text"
                  placeholder="Misal: INV-PLN-991204 / KW-NOTA-881"
                  value={expenseForm.receipt_ref}
                  onChange={(e) => setExpenseForm({ ...expenseForm, receipt_ref: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:outline-emerald-600"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Catatan Tambahan</label>
                <textarea
                  rows={2}
                  placeholder="Catatan keperluan operasional atau nama vendor/toko..."
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:outline-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExpense}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingExpense ? 'Menyimpan...' : 'Simpan Pengeluaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageTransition>
  )
}
