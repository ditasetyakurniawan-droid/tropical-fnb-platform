import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Search,
  Plus,
  Gift,
  Tag,
  Award,
  Sparkles,
  Phone,
  Copy,
  Check,
  AlertCircle,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink,
  Calculator,
  RefreshCw,
  X,
  RotateCcw,
  Mail,
  Utensils,
  AlertTriangle,
  Eye,
  Calendar,
  TrendingUp,
  Receipt,
  ShoppingBag,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react';
import { PageTransition } from '@/shared/components/transitions/PageTransition';
import { NumberInput } from '@/shared/ui/NumberInput';
import { SmoothNumber } from '@/shared/ui/SmoothNumber';
import { cn } from '@/shared/lib/cn';
import { formatIDR } from '@/shared/utils/currency';
import type {
  Customer,
  MembershipTier,
  CreateCustomerPayload,
  CreateVoucherPayload,
  ValidateVoucherPayload,
  ValidateVoucherResponse,
} from './types';
import {
  fetchCustomers,
  fetchCustomerDetail,
  createCustomer,
  fetchVouchers,
  createVoucher,
  fetchPointsLedger,
  adjustCustomerPoints,
  validateVoucher,
} from './crm-api';

export const LoyaltyVouchersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'customers' | 'vouchers' | 'ledger'>('customers');
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Modals state
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedDetailCustomerId, setSelectedDetailCustomerId] = useState<string | null>(null);

  // New Customer Form State
  const [formCustName, setFormCustName] = useState('');
  const [formCustPhone, setFormCustPhone] = useState('');
  const [formCustEmail, setFormCustEmail] = useState('');
  const [formCustBirthday, setFormCustBirthday] = useState('');
  const [formCustDietary, setFormCustDietary] = useState('');
  const [formCustPreferences, setFormCustPreferences] = useState('');

  // New Voucher Form State
  const [formVoucherCode, setFormVoucherCode] = useState('');
  const [formVoucherTitle, setFormVoucherTitle] = useState('');
  const [formVoucherDesc, setFormVoucherDesc] = useState('');
  const [formVoucherType, setFormVoucherType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [formVoucherValue, setFormVoucherValue] = useState(15);
  const [formVoucherMaxDiscount, setFormVoucherMaxDiscount] = useState<number | undefined>(150000);
  const [formVoucherMinPurchase, setFormVoucherMinPurchase] = useState(300000);
  const [formVoucherTier, setFormVoucherTier] = useState<string>('ALL');
  const [formVoucherQuota, setFormVoucherQuota] = useState(50);
  const [formVoucherValidFrom, setFormVoucherValidFrom] = useState(() => new Date().toISOString().split('T')[0] || '');
  const [formVoucherValidUntil, setFormVoucherValidUntil] = useState(
    () => new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] || ''
  );

  // Points Adjustment Form State
  const [pointsAdjType, setPointsAdjType] = useState<'EARN' | 'REDEEM' | 'ADJUSTMENT'>('EARN');
  const [pointsAdjAmount, setPointsAdjAmount] = useState(50);
  const [pointsAdjDesc, setPointsAdjDesc] = useState('');

  // Voucher Simulator State
  const [simCode, setSimCode] = useState('TROPICALVIP');
  const [simSubtotal, setSimSubtotal] = useState(600000);
  const [simCustomerId, setSimCustomerId] = useState('');
  const [simResult, setSimResult] = useState<ValidateVoucherResponse | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Queries
  // 1. Global summary query: ALWAYS fetches all customers for accurate tenant KPIs & liabilities
  const { data: allCustomers = [], refetch: refetchAllCustomers } = useQuery({
    queryKey: ['crm-customers-summary'],
    queryFn: () => fetchCustomers('', 'ALL'),
  });

  // 2. Table query: reflects active search filter and tier selection
  const { data: customers = [], isLoading: isLoadingCustomers, refetch: refetchCustomers } = useQuery({
    queryKey: ['crm-customers', searchQuery, selectedTier],
    queryFn: () => fetchCustomers(searchQuery, selectedTier),
  });

  // 3. Customer detail query (loads individual customer profile + complete points audit history)
  const { data: customerDetail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['crm-customer-detail', selectedDetailCustomerId],
    queryFn: () => (selectedDetailCustomerId ? fetchCustomerDetail(selectedDetailCustomerId) : null),
    enabled: !!selectedDetailCustomerId && isDetailModalOpen,
  });

  const { data: vouchers = [], isLoading: isLoadingVouchers, refetch: refetchVouchers } = useQuery({
    queryKey: ['crm-vouchers'],
    queryFn: () => fetchVouchers(),
  });

  const { data: ledger = [], isLoading: isLoadingLedger, refetch: refetchLedger } = useQuery({
    queryKey: ['crm-points-ledger'],
    queryFn: () => fetchPointsLedger(undefined, 50),
  });

  const handleOpenDetailModal = (cust: Customer) => {
    setSelectedDetailCustomerId(cust.id);
    setSelectedCustomer(cust);
    setIsDetailModalOpen(true);
  };

  // Mutations
  const createCustomerMutation = useMutation({
    mutationFn: (payload: CreateCustomerPayload) => createCustomer(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm-customers'] });
      void queryClient.invalidateQueries({ queryKey: ['crm-customers-summary'] });
      setIsCustomerModalOpen(false);
      setFormCustName('');
      setFormCustPhone('');
      setFormCustEmail('');
      setFormCustBirthday('');
      setFormCustDietary('');
      setFormCustPreferences('');
    },
  });

  const createVoucherMutation = useMutation({
    mutationFn: (payload: CreateVoucherPayload) => createVoucher(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm-vouchers'] });
      setIsVoucherModalOpen(false);
      setFormVoucherCode('');
      setFormVoucherTitle('');
      setFormVoucherDesc('');
    },
  });

  const adjustPointsMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { tx_type: 'EARN' | 'REDEEM' | 'ADJUSTMENT'; points: number; description: string } }) =>
      adjustCustomerPoints(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm-customers'] });
      void queryClient.invalidateQueries({ queryKey: ['crm-customers-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['crm-points-ledger'] });
      setIsPointsModalOpen(false);
      setSelectedCustomer(null);
      setPointsAdjAmount(50);
      setPointsAdjDesc('');
    },
  });

  // KPI Metrics (Accurately reflects the whole database, immune to local table filters)
  const stats = useMemo(() => {
    const dataSource = allCustomers.length > 0 ? allCustomers : customers;
    const totalCustomers = dataSource.length;
    const vipGoldCount = dataSource.filter(c => c.membership_tier === 'TROPICAL_VIP' || c.membership_tier === 'GOLD').length;
    const totalPointsLiability = dataSource.reduce((acc, c) => acc + c.points_balance, 0);
    const activeVouchersCount = vouchers.filter(v => v.is_active).length;
    const totalVoucherRedemptions = vouchers.reduce((acc, v) => acc + v.usage_count, 0);
    return {
      totalCustomers,
      vipGoldCount,
      totalPointsLiability,
      activeVouchersCount,
      totalVoucherRedemptions,
    };
  }, [allCustomers, customers, vouchers]);

  // Handle Voucher Copy
  const handleCopyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Run Voucher Simulation
  const handleRunSimulation = async () => {
    setIsSimulating(true);
    setSimResult(null);
    try {
      const payload: ValidateVoucherPayload = {
        code: simCode,
        subtotal: simSubtotal,
        customer_id: simCustomerId || undefined,
      };
      const res = await validateVoucher(payload);
      setSimResult(res);
    } catch (err: unknown) {
      setSimResult({
        valid: false,
        discount_amount: 0,
        message: err instanceof Error ? err.message : 'Gagal memvalidasi voucher',
      });
    } finally {
      setIsSimulating(false);
    }
  };

  // Tier Badge Styling
  const renderTierBadge = (tier: MembershipTier) => {
    switch (tier) {
      case 'TROPICAL_VIP':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider uppercase bg-purple-100 border border-purple-300 text-purple-900 shadow-2xs">
            <Sparkles className="size-3 text-purple-600 animate-pulse" />
            TROPICAL VIP
          </span>
        );
      case 'GOLD':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider uppercase bg-amber-100 border border-amber-300 text-amber-900 shadow-2xs">
            <Award className="size-3 text-amber-600" />
            GOLD TIER
          </span>
        );
      case 'SILVER':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider uppercase bg-slate-100 border border-slate-300 text-slate-800 shadow-2xs">
            <Award className="size-3 text-slate-600" />
            SILVER TIER
          </span>
        );
      case 'BRONZE':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase bg-orange-100 border border-orange-300 text-orange-900 shadow-2xs">
            BRONZE MEMBER
          </span>
        );
    }
  };

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto space-y-6 pb-24 text-slate-800 tropical-glass">
        {/* Header Cockpit Banner - Warm Sage Frosted Glass */}
        <div data-spot="panel" className="bg-white/95 rounded-3xl p-6 shadow-sm border border-slate-200/90 transition-all text-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold tracking-wide uppercase shadow-2xs">
                  <Gift className="size-4 text-emerald-600" />
                  CRM &amp; Engine Loyalitas Tamu F&amp;B
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold tracking-wide uppercase shadow-2xs">
                  <Award className="size-3.5 text-amber-600" />
                  Database Tamu VIP &amp; Gold
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-800 text-xs font-bold tracking-wide uppercase shadow-2xs">
                  <Tag className="size-3.5 text-purple-600" />
                  Poin Reward &amp; Voucher Kasir
                </div>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                Manajemen Pelanggan, Poin &amp; Voucher Promo
              </h1>
              <p className="text-sm text-slate-600 font-medium max-w-2xl leading-relaxed">
                Database terpadu member setia Tropical Group Temanggung, penyesuaian poin otomatis, serta engine validasi voucher fleksibel dengan batasan tier dan kuota belanja.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  void refetchAllCustomers();
                  void refetchCustomers();
                  void refetchVouchers();
                  void refetchLedger();
                }}
                disabled={isLoadingCustomers || isLoadingVouchers || isLoadingLedger}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                title="Segarkan Data Realtime"
              >
                <RefreshCw className={cn('size-3.5 text-emerald-600', (isLoadingCustomers || isLoadingVouchers || isLoadingLedger) && 'animate-spin')} />
                <span>Segarkan</span>
              </button>
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
              >
                <Plus className="size-4" />
                <span>Tambah Member</span>
              </button>
              <button
                type="button"
                onClick={() => setIsVoucherModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-purple-600/20 active:scale-95 transition-all cursor-pointer"
              >
                <Tag className="size-4" />
                <span>Buat Promo Voucher</span>
              </button>
            </div>
          </div>

          {/* KPI Metrics - Clean Frosted Cards with Smooth Rolling Numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-slate-200/80">
            <div data-spot="stat" className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
              <div className="text-xs text-slate-600 font-bold flex items-center gap-1.5">
                <div className="p-1 rounded-lg bg-emerald-100 text-emerald-800">
                  <Users className="size-3.5" />
                </div>
                Total Pelanggan Terdaftar
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                <SmoothNumber value={stats.totalCustomers} format="number" />
              </div>
              <div className="text-[11px] text-slate-500 font-semibold mt-0.5">100% database terverifikasi</div>
            </div>

            <div data-spot="stat" className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
              <div className="text-xs text-slate-600 font-bold flex items-center gap-1.5">
                <div className="p-1 rounded-lg bg-amber-100 text-amber-800">
                  <Award className="size-3.5" />
                </div>
                Tamu VIP &amp; Gold
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                <SmoothNumber value={stats.vipGoldCount} format="number" />
              </div>
              <div className="text-[11px] text-slate-500 font-semibold mt-0.5">Prioritas reservasi &amp; meja khusus</div>
            </div>

            <div data-spot="stat" className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
              <div className="text-xs text-slate-600 font-bold flex items-center gap-1.5">
                <div className="p-1 rounded-lg bg-purple-100 text-purple-800">
                  <Sparkles className="size-3.5" />
                </div>
                Total Poin Loyalitas Beredar
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                <SmoothNumber value={stats.totalPointsLiability} format="number" suffix=" pts" />
              </div>
              <div className="text-[11px] text-slate-500 font-semibold mt-0.5">Setara liabilitas {formatIDR(stats.totalPointsLiability * 100)}</div>
            </div>

            <div data-spot="stat" className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
              <div className="text-xs text-slate-600 font-bold flex items-center gap-1.5">
                <div className="p-1 rounded-lg bg-teal-100 text-teal-800">
                  <Tag className="size-3.5" />
                </div>
                Promo Voucher Aktif
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                <SmoothNumber value={stats.activeVouchersCount} format="number" suffix=" Promo" />
              </div>
              <div className="text-[11px] text-slate-500 font-semibold mt-0.5">{stats.totalVoucherRedemptions}x penukaran kasir</div>
            </div>
          </div>

          {/* 3 Navigation Command Cards */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Tab 1: Pelanggan & Member VIP */}
            <button
              type="button"
              onClick={() => setActiveTab('customers')}
              data-spot="workflow"
              data-active={activeTab === 'customers'}
              aria-pressed={activeTab === 'customers'}
              className={cn(
                'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
                activeTab === 'customers'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-400/40 border-amber-500'
                  : 'bg-white hover:bg-slate-50 border-slate-200/90 hover:border-amber-300 text-slate-800 shadow-2xs'
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={cn(
                    'p-1.5 rounded-lg',
                    activeTab === 'customers' ? 'bg-amber-500/50 text-white' : 'bg-amber-100 text-amber-800'
                  )}
                >
                  <Users className="size-4" />
                </div>
                <span
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-bold rounded-full',
                    activeTab === 'customers' ? 'bg-white text-amber-800' : 'bg-slate-100 text-slate-700 border border-slate-200'
                  )}
                >
                  <SmoothNumber value={allCustomers.length || customers.length} format="number" /> Member
                </span>
              </div>
              <div className="mt-2.5">
                <div className={cn('text-xs font-bold', activeTab === 'customers' ? 'text-white' : 'text-slate-900')}>
                  1. Pelanggan &amp; Member VIP
                </div>
                <div className={cn('text-[11px] font-semibold', activeTab === 'customers' ? 'text-amber-100' : 'text-slate-500')}>
                  Database Tamu &amp; Riwayat Belanja
                </div>
              </div>
            </button>

            {/* Tab 2: Promo & Voucher Diskon */}
            <button
              type="button"
              onClick={() => setActiveTab('vouchers')}
              data-spot="workflow"
              data-active={activeTab === 'vouchers'}
              aria-pressed={activeTab === 'vouchers'}
              className={cn(
                'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
                activeTab === 'vouchers'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-400/40 border-amber-500'
                  : 'bg-white hover:bg-slate-50 border-slate-200/90 hover:border-amber-300 text-slate-800 shadow-2xs'
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={cn(
                    'p-1.5 rounded-lg',
                    activeTab === 'vouchers' ? 'bg-amber-500/50 text-white' : 'bg-purple-100 text-purple-800'
                  )}
                >
                  <Tag className="size-4" />
                </div>
                <span
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-bold rounded-full',
                    activeTab === 'vouchers' ? 'bg-white text-amber-800' : 'bg-slate-100 text-slate-700 border border-slate-200'
                  )}
                >
                  <SmoothNumber value={vouchers.length} format="number" /> Promo
                </span>
              </div>
              <div className="mt-2.5">
                <div className={cn('text-xs font-bold', activeTab === 'vouchers' ? 'text-white' : 'text-slate-900')}>
                  2. Promo &amp; Voucher Diskon
                </div>
                <div className={cn('text-[11px] font-semibold', activeTab === 'vouchers' ? 'text-amber-100' : 'text-slate-500')}>
                  Kupon Kasir &amp; Validasi Diskon
                </div>
              </div>
            </button>

            {/* Tab 3: Buku Besar Poin Reward */}
            <button
              type="button"
              onClick={() => setActiveTab('ledger')}
              data-spot="workflow"
              data-active={activeTab === 'ledger'}
              aria-pressed={activeTab === 'ledger'}
              className={cn(
                'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
                activeTab === 'ledger'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-400/40 border-amber-500'
                  : 'bg-white hover:bg-slate-50 border-slate-200/90 hover:border-amber-300 text-slate-800 shadow-2xs'
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={cn(
                    'p-1.5 rounded-lg',
                    activeTab === 'ledger' ? 'bg-amber-500/50 text-white' : 'bg-teal-100 text-teal-800'
                  )}
                >
                  <Clock className="size-4" />
                </div>
                <span
                  className={cn(
                    'px-2 py-0.5 text-[10px] font-bold rounded-full',
                    activeTab === 'ledger' ? 'bg-white text-amber-800' : 'bg-slate-100 text-slate-700 border border-slate-200'
                  )}
                >
                  <SmoothNumber value={ledger.length} format="number" /> Audit
                </span>
              </div>
              <div className="mt-2.5">
                <div className={cn('text-xs font-bold', activeTab === 'ledger' ? 'text-white' : 'text-slate-900')}>
                  3. Buku Besar Poin Reward
                </div>
                <div className={cn('text-[11px] font-semibold', activeTab === 'ledger' ? 'text-amber-100' : 'text-slate-500')}>
                  Riwayat Akumulasi &amp; Tukar Poin
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* TAB 1: CUSTOMERS & MEMBERSHIP VIP */}
        {activeTab === 'customers' && (
          <div className="space-y-4">
            {/* Filter & Search Bar */}
            <div data-spot="toolbar" className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white/95 p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari pelanggan berdasarkan nama, nomor WhatsApp..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 font-medium placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Tier Filters */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <span className="text-xs font-bold text-slate-600 mr-1 flex items-center gap-1">
                  <Filter className="size-3 text-slate-400" /> Tier:
                </span>
                {['ALL', 'TROPICAL_VIP', 'GOLD', 'SILVER', 'BRONZE'].map(tier => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setSelectedTier(tier)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedTier === tier
                        ? 'bg-emerald-800 text-white shadow-xs border border-emerald-900'
                        : 'bg-slate-100 text-slate-700 hover:text-slate-900 hover:bg-slate-200 border border-slate-200/80'
                    }`}
                  >
                    {tier === 'ALL' ? 'Semua' : tier.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Active Filter Counter Banner */}
            {(selectedTier !== 'ALL' || searchQuery.trim() !== '') && (
              <div className="flex items-center justify-between bg-emerald-50/80 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs shadow-2xs">
                <span className="text-emerald-950 font-medium">
                  Menampilkan <strong className="text-slate-900 font-black">{customers.length}</strong> dari{' '}
                  <strong className="text-slate-900 font-black">{allCustomers.length}</strong> total pelanggan terdaftar
                  {selectedTier !== 'ALL' && (
                    <span className="ml-1 text-emerald-800">
                      (Filter Tier: <strong className="text-amber-800">{selectedTier.replace('_', ' ')}</strong>)
                    </span>
                  )}
                  {searchQuery.trim() && (
                    <span className="ml-1 text-emerald-800">
                      (Pencarian: <strong className="text-slate-900">&ldquo;{searchQuery}&rdquo;</strong>)
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTier('ALL');
                    setSearchQuery('');
                  }}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 underline flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="size-3" />
                  Tampilkan Semua ({allCustomers.length})
                </button>
              </div>
            )}

            {/* Customers Table */}
            <div data-spot="table" className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm">
              {isLoadingCustomers ? (
                <div className="p-12 text-center text-slate-500">
                  <RefreshCw className="size-6 mx-auto mb-2 animate-spin text-emerald-600" />
                  Memuat data pelanggan CRM...
                </div>
              ) : customers.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <AlertCircle className="size-8 mx-auto mb-2 text-amber-500" />
                  Tidak ditemukan pelanggan yang cocok dengan filter.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/90 text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-3">Pelanggan &amp; WhatsApp</th>
                        <th className="px-3 py-3">Membership Tier</th>
                        <th className="px-3 py-3">Saldo Poin</th>
                        <th className="px-3 py-3">Total Belanja &amp; Kunjungan</th>
                        <th className="px-3 py-3">Catatan &amp; Preferensi</th>
                        <th className="px-3 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customers.map(c => (
                        <tr
                          key={c.id}
                          onClick={() => handleOpenDetailModal(c)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                          title="Klik baris untuk membuka popup detail & riwayat pelanggan"
                        >
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <div className="font-extrabold text-slate-900 text-sm group-hover:text-emerald-700 transition-colors">
                                {c.name}
                              </div>
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                                <Eye className="size-2.5 text-emerald-600" /> Buka Detail
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-slate-600 font-mono font-bold flex items-center gap-1">
                                <Phone className="size-3 text-slate-400 shrink-0" />
                                {c.phone}
                              </span>
                              <a
                                href={`https://wa.me/62${c.phone.replace(/^0/, '')}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded-full border border-emerald-300"
                              >
                                Hubungi WA
                                <ExternalLink className="size-2.5" />
                              </a>
                            </div>
                            {c.email && (
                              <div className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                                <Mail className="size-3 text-slate-400 shrink-0" />
                                {c.email}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {renderTierBadge(c.membership_tier)}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1 text-sm font-black text-amber-700">
                              <Sparkles className="size-3.5 text-amber-600" />
                              {c.points_balance.toLocaleString('id-ID')}
                              <span className="text-xs font-bold text-amber-700">pts</span>
                            </div>
                            <div className="text-xs text-slate-500 font-semibold mt-0.5">
                              Potongan {formatIDR(c.points_balance * 100)}
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="font-extrabold text-slate-900 text-sm">{formatIDR(c.lifetime_spend)}</div>
                            <div className="text-xs text-slate-500 font-semibold mt-0.5">{c.visit_count} kali kunjungan</div>
                          </td>
                          <td className="px-3 py-3 max-w-[170px]">
                            <div className="flex flex-col gap-1.5">
                              {c.dietary_notes && (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-rose-50 border border-rose-200 text-rose-800 truncate"
                                  title={c.dietary_notes}
                                >
                                  <AlertTriangle className="size-3 shrink-0 text-rose-500" />
                                  <span className="truncate">{c.dietary_notes}</span>
                                </span>
                              )}
                              {c.preferences && (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-teal-50 border border-teal-200 text-teal-800 truncate"
                                  title={c.preferences}
                                >
                                  <Utensils className="size-3 shrink-0 text-teal-600" />
                                  <span className="truncate">{c.preferences}</span>
                                </span>
                              )}
                              {!c.dietary_notes && !c.preferences && (
                                <span className="text-xs text-slate-400 italic">Standar / Tanpa pantangan</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right whitespace-nowrap space-x-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDetailModal(c);
                              }}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer"
                            >
                              <Eye className="size-3.5 mr-0.5 text-emerald-600" />
                              Detail
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCustomer(c);
                                setIsPointsModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 text-xs font-bold text-amber-900 shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer"
                            >
                              <Gift className="size-3.5 mr-0.5 text-amber-600" />
                              Poin
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: PROMO & VOUCHER DISKON */}
        {activeTab === 'vouchers' && (
          <div className="space-y-6">
            {/* Catalog of Active Vouchers */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
              {isLoadingVouchers ? (
                <div className="col-span-full p-12 text-center text-slate-500">
                  <RefreshCw className="size-6 mx-auto mb-2 animate-spin text-emerald-600" />
                  Memuat data promo voucher...
                </div>
              ) : vouchers.map(v => (
                <div
                  key={v.id}
                  data-spot="card"
                  className="relative overflow-hidden rounded-3xl bg-white/95 border border-slate-200/90 p-5 shadow-sm transition-all hover:shadow-md hover:border-emerald-300"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black uppercase bg-purple-50 border border-purple-200 text-purple-800 mb-2">
                        <Tag className="size-3 text-purple-600" />
                        {v.discount_type === 'PERCENTAGE'
                          ? `DISKON ${v.discount_value}%`
                          : `POTONGAN ${formatIDR(v.discount_value)}`}
                      </div>
                      <h3 className="text-lg font-black text-slate-900">{v.title}</h3>
                      <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">{v.description}</p>
                    </div>

                    <div className="text-right">
                      {v.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-800">
                          <CheckCircle2 className="size-3 text-emerald-600" />
                          AKTIF
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 border border-rose-200 text-rose-800">
                          NONAKTIF
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Coupon Code Pill */}
                  <div className="mt-4 p-3 rounded-2xl bg-slate-50 border border-dashed border-emerald-300 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">KODE VOUCHER KASIR</div>
                      <div className="text-xl font-black tracking-widest text-emerald-800 font-mono mt-0.5">{v.code}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(v.code)}
                      className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer"
                    >
                      {copiedCode === v.code ? (
                        <>
                          <Check className="size-3 mr-0.5 text-emerald-600" /> Tersalin!
                        </>
                      ) : (
                        <>
                          <Copy className="size-3 mr-0.5 text-emerald-600" /> Salin Kode
                        </>
                      )}
                    </button>
                  </div>

                  {/* Requirements & Quota */}
                  <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-slate-500 font-bold">Min. Belanja:</div>
                      <div className="font-black text-slate-900 text-sm">{formatIDR(v.min_purchase_amount)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold">Syarat Tier:</div>
                      <div className="font-black text-sm">
                        {v.min_membership_tier ? (
                          <span className="text-amber-800 font-bold">Tier {v.min_membership_tier} Ke Atas</span>
                        ) : (
                          <span className="text-emerald-700 font-bold">Semua Member</span>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2 mt-1">
                      <div className="flex items-center justify-between text-xs text-slate-600 font-bold mb-1">
                        <span>Kuota Terpakai</span>
                        <span className="font-black text-slate-900">
                          {v.usage_count} / {v.usage_limit_total} Kupon
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                          style={{ width: `${Math.min(100, (v.usage_count / v.usage_limit_total) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="col-span-2 text-xs text-slate-500 font-bold mt-2 flex items-center justify-between">
                      <span>Masa Berlaku:</span>
                      <span className="font-mono font-bold text-slate-700">
                        {v.valid_from} s/d {v.valid_until}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Interactive Voucher Simulator */}
            <div data-spot="panel" className="rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-sm">
              <div className="flex items-center gap-2 text-slate-900 font-black text-base mb-1">
                <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                  <Calculator className="size-4.5" />
                </div>
                Simulator Validasi Voucher Kasir POS (Real-Time Engine Test)
              </div>
              <p className="text-xs text-slate-600 font-medium mb-4 leading-relaxed">
                Uji langsung apakah voucher berlaku untuk subtotal belanja tertentu dan tier member pelanggan tanpa perlu membuka transaksi kasir sungguhan.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kode Voucher</label>
                  <input
                    type="text"
                    value={simCode}
                    onChange={e => setSimCode(e.target.value.toUpperCase())}
                    placeholder="Contoh: TROPICALVIP"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-mono uppercase font-bold focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Subtotal Belanja (IDR)</label>
                  <NumberInput
                    value={simSubtotal}
                    onChange={val => setSimSubtotal(val)}
                    min={0}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-bold focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Member (Opsional)</label>
                  <select
                    value={simCustomerId}
                    onChange={e => setSimCustomerId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-bold focus:bg-white focus:border-emerald-500 focus:outline-hidden cursor-pointer"
                  >
                    <option value="">-- Tamu Reguler (Non-Member) --</option>
                    {(allCustomers.length > 0 ? allCustomers : customers).map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.membership_tier})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void handleRunSimulation()}
                  disabled={isSimulating}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Calculator className="size-4 mr-0.5" />
                  {isSimulating ? 'Menguji...' : 'Uji Validasi Diskon'}
                </button>

                {simResult && (
                  <div
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border ${
                      simResult.valid
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : 'bg-rose-50 border-rose-300 text-rose-900'
                    }`}
                  >
                    {simResult.valid ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertCircle className="size-4 text-rose-600" />}
                    <span>{simResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: POINTS AUDIT LEDGER */}
        {activeTab === 'ledger' && (
          <div data-spot="table" className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm">
            {isLoadingLedger ? (
              <div className="p-12 text-center text-slate-500">
                <RefreshCw className="size-6 mx-auto mb-2 animate-spin text-emerald-600" />
                Memuat riwayat transaksi poin...
              </div>
            ) : ledger.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <AlertCircle className="size-8 mx-auto mb-2 text-amber-500" />
                Belum ada transaksi poin yang tercatat.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50/90 text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-4">Waktu &amp; Tanggal</th>
                      <th className="px-5 py-4">Pelanggan Member</th>
                      <th className="px-5 py-4">Tipe Transaksi</th>
                      <th className="px-5 py-4">Perubahan Poin</th>
                      <th className="px-5 py-4">Saldo Akhir</th>
                      <th className="px-5 py-4">Keterangan / Ref Order</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledger.map(entry => (
                      <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-600 font-mono font-bold">
                          {new Date(entry.created_at).toLocaleString('id-ID', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-extrabold text-slate-900 text-sm">{entry.customer_name}</div>
                          <div className="text-xs text-slate-500 font-mono font-bold mt-0.5">{entry.customer_phone}</div>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {entry.tx_type === 'EARN' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-50 border border-emerald-200 text-emerald-800">
                              + DAPAT POIN
                            </span>
                          )}
                          {entry.tx_type === 'REDEEM' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-50 border border-rose-200 text-rose-800">
                              - REDEEM KASIR
                            </span>
                          )}
                          {entry.tx_type === 'ADJUSTMENT' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-50 border border-blue-200 text-blue-800">
                              PENYESUAIAN
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span
                            className={`font-black text-base ${
                              entry.points >= 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {entry.points > 0 ? `+${entry.points}` : entry.points} pts
                          </span>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className="font-mono font-black text-amber-700 text-base">{entry.balance_after} pts</span>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-600 font-medium max-w-md leading-relaxed">{entry.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* MODAL 1: TAMBAH PELANGGAN BARU */}
        {isCustomerModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative text-slate-800">
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Tutup"
              >
                <X className="size-5" />
              </button>

              <div className="flex items-center gap-2 text-slate-900 font-bold text-lg mb-1">
                <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                  <Users className="size-4.5" />
                </div>
                Tambah Member Pelanggan Baru
              </div>
              <p className="text-xs text-slate-500 mb-6">
                Daftarkan nomor WhatsApp dan nama tamu untuk mulai mengakumulasi poin loyalitas otomatis.
              </p>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  createCustomerMutation.mutate({
                    name: formCustName,
                    phone: formCustPhone,
                    email: formCustEmail || undefined,
                    birthday: formCustBirthday || undefined,
                    dietary_notes: formCustDietary || undefined,
                    preferences: formCustPreferences || undefined,
                  });
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap Tamu *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: dr. Farhan Syahputra"
                    value={formCustName}
                    onChange={e => setFormCustName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor WhatsApp Aktif *</label>
                  <input
                    type="tel"
                    required
                    placeholder="Contoh: 085711223344"
                    value={formCustPhone}
                    onChange={e => setFormCustPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Email (Opsional)</label>
                    <input
                      type="email"
                      placeholder="email@tamu.id"
                      value={formCustEmail}
                      onChange={e => setFormCustEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Ulang Tahun</label>
                    <input
                      type="date"
                      value={formCustBirthday}
                      onChange={e => setFormCustBirthday(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Alergi &amp; Pantangan Makanan</label>
                  <input
                    type="text"
                    placeholder="Contoh: Alergi udang, tingkat kematangan medium-rare"
                    value={formCustDietary}
                    onChange={e => setFormCustDietary(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Preferensi Meja &amp; Ruangan</label>
                  <input
                    type="text"
                    placeholder="Contoh: Suka Gazebo Lesehan pinggir kolam koi, AC dingin"
                    value={formCustPreferences}
                    onChange={e => setFormCustPreferences(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsCustomerModalOpen(false)}
                    className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={createCustomerMutation.isPending}
                    className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {createCustomerMutation.isPending ? 'Menyimpan...' : 'Simpan Member'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: PENYESUAIAN POIN LOYALITAS */}
        {isPointsModalOpen && selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative text-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsPointsModalOpen(false);
                  setSelectedCustomer(null);
                }}
                className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Tutup"
              >
                <X className="size-5" />
              </button>

              <div className="flex items-center gap-2 text-slate-900 font-bold text-lg mb-1">
                <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
                  <Gift className="size-4.5" />
                </div>
                Penyesuaian Poin Loyalitas
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Pelanggan: <strong className="text-slate-900">{selectedCustomer.name}</strong> ({selectedCustomer.phone})
              </p>

              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 mb-4 flex items-center justify-between">
                <span className="text-xs text-amber-900 font-semibold">Saldo Poin Saat Ini:</span>
                <span className="text-lg font-black text-amber-900">{selectedCustomer.points_balance} pts</span>
              </div>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  adjustPointsMutation.mutate({
                    id: selectedCustomer.id,
                    payload: {
                      tx_type: pointsAdjType,
                      points: pointsAdjAmount,
                      description: pointsAdjDesc || 'Penyesuaian manual kasir/supervisor',
                    },
                  });
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tipe Penyesuaian</label>
                  <select
                    value={pointsAdjType}
                    onChange={e => setPointsAdjType(e.target.value as 'EARN' | 'REDEEM' | 'ADJUSTMENT')}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="EARN">+ Tambah Poin Reward (EARN)</option>
                    <option value="REDEEM">- Potong Poin Kasir (REDEEM)</option>
                    <option value="ADJUSTMENT">Koreksi Saldo Poin (ADJUSTMENT)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Jumlah Poin</label>
                  <NumberInput
                    value={pointsAdjAmount}
                    onChange={val => setPointsAdjAmount(val)}
                    min={1}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-bold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                  <div className="text-[11px] text-slate-500 font-medium mt-1">
                    Nilai moneter: {formatIDR(pointsAdjAmount * 100)}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Keterangan / Alasan</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Reward perayaan ulang tahun atau kompensasi"
                    value={pointsAdjDesc}
                    onChange={e => setPointsAdjDesc(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPointsModalOpen(false);
                      setSelectedCustomer(null);
                    }}
                    className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={adjustPointsMutation.isPending}
                    className="rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 px-4 py-2 text-xs font-bold text-white shadow-md shadow-amber-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {adjustPointsMutation.isPending ? 'Menyimpan...' : 'Terapkan Poin'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 3: BUAT VOUCHER PROMO BARU */}
        {isVoucherModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto text-slate-800">
              <button
                type="button"
                onClick={() => setIsVoucherModalOpen(false)}
                className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Tutup"
              >
                <X className="size-5" />
              </button>

              <div className="flex items-center gap-2 text-slate-900 font-bold text-lg mb-1">
                <div className="p-1.5 rounded-lg bg-purple-100 text-purple-800">
                  <Tag className="size-4.5" />
                </div>
                Buat Promo Voucher Baru
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Konfigurasi kupon diskon dengan batasan nominal, tier minimal, dan kuota pemakaian.
              </p>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  createVoucherMutation.mutate({
                    code: formVoucherCode.toUpperCase(),
                    title: formVoucherTitle,
                    description: formVoucherDesc || undefined,
                    discount_type: formVoucherType,
                    discount_value: formVoucherValue,
                    max_discount_amount: formVoucherType === 'PERCENTAGE' ? formVoucherMaxDiscount : undefined,
                    min_purchase_amount: formVoucherMinPurchase,
                    min_membership_tier: formVoucherTier !== 'ALL' ? (formVoucherTier as MembershipTier) : undefined,
                    usage_limit_total: formVoucherQuota,
                    valid_from: formVoucherValidFrom,
                    valid_until: formVoucherValidUntil,
                  });
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Kode Voucher *</label>
                    <input
                      type="text"
                      required
                      placeholder="CONTOH: GAZEBO20"
                      value={formVoucherCode}
                      onChange={e => setFormVoucherCode(e.target.value.toUpperCase())}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-purple-900 font-mono font-bold uppercase focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tipe Diskon *</label>
                    <select
                      value={formVoucherType}
                      onChange={e => setFormVoucherType(e.target.value as 'PERCENTAGE' | 'FIXED_AMOUNT')}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
                    >
                      <option value="PERCENTAGE">Persentase (%)</option>
                      <option value="FIXED_AMOUNT">Potongan Tetap (IDR)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Judul Promo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Diskon Spesial Gazebo Manding 20%"
                    value={formVoucherTitle}
                    onChange={e => setFormVoucherTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {formVoucherType === 'PERCENTAGE' ? 'Nilai Persen (%)' : 'Nominal Potongan (IDR)'} *
                    </label>
                    <NumberInput
                      value={formVoucherValue}
                      onChange={val => setFormVoucherValue(val)}
                      min={1}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  {formVoucherType === 'PERCENTAGE' ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Maks. Potongan (IDR)</label>
                      <NumberInput
                        value={formVoucherMaxDiscount ?? 0}
                        onChange={val => setFormVoucherMaxDiscount(val > 0 ? val : undefined)}
                        min={0}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Batas Kuota Pemakaian</label>
                      <NumberInput
                        value={formVoucherQuota}
                        onChange={val => setFormVoucherQuota(val)}
                        min={1}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Min. Belanja (IDR)</label>
                    <NumberInput
                      value={formVoucherMinPurchase}
                      onChange={val => setFormVoucherMinPurchase(val)}
                      min={0}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Syarat Tier Member</label>
                    <select
                      value={formVoucherTier}
                      onChange={e => setFormVoucherTier(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500 cursor-pointer"
                    >
                      <option value="ALL">Semua Pelanggan</option>
                      <option value="SILVER">Khusus SILVER Ke Atas</option>
                      <option value="GOLD">Khusus GOLD Ke Atas</option>
                      <option value="TROPICAL_VIP">Khusus TROPICAL VIP Saja</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Berlaku Dari</label>
                    <input
                      type="date"
                      required
                      value={formVoucherValidFrom}
                      onChange={e => setFormVoucherValidFrom(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Berlaku Sampai</label>
                    <input
                      type="date"
                      required
                      value={formVoucherValidUntil}
                      onChange={e => setFormVoucherValidUntil(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsVoucherModalOpen(false)}
                    className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={createVoucherMutation.isPending}
                    className="rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-purple-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {createVoucherMutation.isPending ? 'Menyimpan...' : 'Terbitkan Voucher'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 4: CUSTOMER DETAIL & AUDIT HISTORY POPUP */}
        {isDetailModalOpen && (selectedCustomer || customerDetail) && createPortal((() => {
          const cust = customerDetail || selectedCustomer!;
          const ledgerList = customerDetail?.recent_points || [];
          const aov = cust.visit_count > 0 ? Math.round(cust.lifetime_spend / cust.visit_count) : 0;
          const cleanPhone = cust.phone.replace(/^0/, '');

          return (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
              <div className="bg-white border border-slate-200/90 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden my-6 max-h-[92vh] flex flex-col text-slate-800">
                {/* Modal Header Banner */}
                <div className="relative bg-slate-50/90 p-6 border-b border-slate-200 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="size-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white text-2xl font-black shadow-md border-2 border-emerald-400 shrink-0">
                      {cust.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{cust.name}</h2>
                        {renderTierBadge(cust.membership_tier)}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-600">
                        <a
                          href={`https://wa.me/62${cleanPhone}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-emerald-800 hover:text-emerald-950 font-mono font-bold bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-300 transition-colors"
                        >
                          <Phone className="size-3.5 text-emerald-600" />
                          <span>{cust.phone} (WhatsApp)</span>
                          <ExternalLink className="size-3 text-emerald-600" />
                        </a>
                        {cust.email && (
                          <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium">
                            <Mail className="size-3.5 text-slate-400" />
                            {cust.email}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                          <Calendar className="size-3.5 text-slate-400" />
                          Terdaftar: {new Date(cust.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      setSelectedDetailCustomerId(null);
                    }}
                    className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer border border-slate-200"
                    aria-label="Tutup Detail"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                {/* Modal Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Financial & Loyalty Highlights Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Card 1: Poin */}
                    <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/90 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider">
                        <span>Saldo Poin</span>
                        <Sparkles className="size-4 text-purple-600" />
                      </div>
                      <div className="text-2xl font-black text-slate-900 mt-2">
                        {cust.points_balance.toLocaleString('id-ID')} <span className="text-xs font-bold text-purple-700">pts</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-1">
                        Nilai tukar: {formatIDR(cust.points_balance * 100)}
                      </div>
                    </div>

                    {/* Card 2: LTV Spend */}
                    <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/90 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider">
                        <span>Lifetime Spend</span>
                        <Receipt className="size-4 text-emerald-600" />
                      </div>
                      <div className="text-lg sm:text-xl font-black text-slate-900 mt-2 tracking-tight">
                        {formatIDR(cust.lifetime_spend)}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-1">
                        Akumulasi pesanan resto
                      </div>
                    </div>

                    {/* Card 3: Visit Count */}
                    <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/90 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider">
                        <span>Kunjungan Resto</span>
                        <ShoppingBag className="size-4 text-teal-600" />
                      </div>
                      <div className="text-2xl font-black text-slate-900 mt-2">
                        {cust.visit_count} <span className="text-xs font-bold text-teal-700">Kunjungan</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-1">
                        Dine-in / Takeaway tercatat
                      </div>
                    </div>

                    {/* Card 4: AOV */}
                    <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/90 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider">
                        <span>Rata-rata (AOV)</span>
                        <TrendingUp className="size-4 text-amber-600" />
                      </div>
                      <div className="text-lg sm:text-xl font-black text-slate-900 mt-2 tracking-tight">
                        {formatIDR(aov)}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-1">
                        Rata-rata belanja per bill
                      </div>
                    </div>
                  </div>

                  {/* F&B Operational Preferences & Dietary Restrictions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Dietary Restrictions */}
                    <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200 shadow-2xs">
                      <div className="flex items-center gap-2 text-xs font-black text-rose-800 uppercase tracking-wider mb-2">
                        <AlertTriangle className="size-4 text-rose-500 shrink-0" />
                        <span>Pantangan / Alergi Makanan</span>
                      </div>
                      {cust.dietary_notes ? (
                        <div className="text-sm font-semibold text-rose-900 bg-white/80 p-3 rounded-xl border border-rose-200 leading-relaxed">
                          {cust.dietary_notes}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic py-2">
                          Tidak ada catatan pantangan / alergi spesifik untuk tamu ini.
                        </div>
                      )}
                    </div>

                    {/* Table & Food Preferences */}
                    <div className="p-4 rounded-2xl bg-teal-50/60 border border-teal-200 shadow-2xs">
                      <div className="flex items-center gap-2 text-xs font-black text-teal-800 uppercase tracking-wider mb-2">
                        <Utensils className="size-4 text-teal-600 shrink-0" />
                        <span>Meja &amp; Menu Favorit Tamu</span>
                      </div>
                      {cust.preferences ? (
                        <div className="text-sm font-semibold text-teal-900 bg-white/80 p-3 rounded-xl border border-teal-200 leading-relaxed">
                          {cust.preferences}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic py-2">
                          Belum ada preferensi meja atau menu favorit yang dicatat.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Points & Transaction History Audit Trail */}
                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="size-4 text-emerald-600" />
                        <h3 className="text-sm font-black text-slate-900">Riwayat Mutasi Poin &amp; Transaksi Pelanggan</h3>
                      </div>
                      <span className="text-xs font-bold text-slate-600 bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
                        {isLoadingDetail ? 'Memuat...' : `${ledgerList.length} Mutasi Terakhir`}
                      </span>
                    </div>

                    {isLoadingDetail ? (
                      <div className="p-8 text-center text-slate-500">
                        <RefreshCw className="size-6 mx-auto mb-2 animate-spin text-emerald-600" />
                        Memuat riwayat transaksi mutasi poin...
                      </div>
                    ) : ledgerList.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs">
                        <AlertCircle className="size-6 mx-auto mb-2 text-slate-400" />
                        Belum ada mutasi poin tercatat untuk pelanggan ini. Poin akan tercatat otomatis saat kasir menyelesaikan pesanan.
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-64 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50/90 text-[11px] font-bold text-slate-600 uppercase tracking-wider sticky top-0 border-b border-slate-200">
                            <tr>
                              <th className="px-4 py-3">Waktu</th>
                              <th className="px-4 py-3">Tipe</th>
                              <th className="px-4 py-3">Perubahan Poin</th>
                              <th className="px-4 py-3">Saldo Setelah</th>
                              <th className="px-4 py-3">Keterangan / Order</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium">
                            {ledgerList.map(entry => (
                              <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                                  {new Date(entry.created_at).toLocaleString('id-ID', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                  {entry.tx_type === 'EARN' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                                      <ArrowDownRight className="size-3 text-emerald-600" />
                                      EARN (DAPAT)
                                    </span>
                                  )}
                                  {entry.tx_type === 'REDEEM' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-300">
                                      <ArrowUpRight className="size-3 text-rose-600" />
                                      REDEEM (PAKAI)
                                    </span>
                                  )}
                                  {entry.tx_type === 'ADJUSTMENT' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-300">
                                      ADJUSTMENT
                                    </span>
                                  )}
                                  {entry.tx_type === 'EXPIRED' && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                                      EXPIRED
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 font-bold font-mono whitespace-nowrap">
                                  {entry.points > 0 ? (
                                    <span className="text-emerald-700">+{entry.points.toLocaleString('id-ID')} pts</span>
                                  ) : (
                                    <span className="text-rose-700">{entry.points.toLocaleString('id-ID')} pts</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 font-mono text-slate-900 font-bold whitespace-nowrap">
                                  {entry.balance_after.toLocaleString('id-ID')} pts
                                </td>
                                <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate" title={entry.description}>
                                  {entry.description}
                                  {entry.order_id && (
                                    <span className="ml-1 text-[10px] font-mono text-teal-800 bg-teal-50 px-1 py-0.5 rounded border border-teal-200">
                                      Ref #{entry.order_id.slice(0, 8)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Modal Footer Actions */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsDetailModalOpen(false);
                        setSelectedCustomer(cust);
                        setIsPointsModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3.5 py-2 text-xs font-bold text-amber-900 shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer"
                    >
                      <Gift className="size-3.5 mr-0.5 text-amber-600" />
                      Sesuaikan Poin Manual
                    </button>
                    <a
                      href={`https://wa.me/62${cleanPhone}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-3.5 py-2 rounded-xl shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
                    >
                      <Phone className="size-3.5 mr-0.5" />
                      Chat WhatsApp
                    </a>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      setSelectedDetailCustomerId(null);
                    }}
                    className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold px-6 py-2 cursor-pointer shadow-2xs hover:shadow-xs text-xs active:scale-95 transition-all"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          );
        })(), document.body)}
      </div>
    </PageTransition>
  );
};
