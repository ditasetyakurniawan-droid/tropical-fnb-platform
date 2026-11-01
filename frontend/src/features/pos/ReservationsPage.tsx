import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  Users,
  Search,
  Plus,
  Clock,
  Phone,
  Building,
  X,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  UtensilsCrossed,
  MessageSquare,
  CheckCircle2,
  Copy,
  ExternalLink,
  Flame,
  ChefHat,
  Sparkles,
  Layers,
} from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth-store';
import { PageTransition } from '@/shared/components/transitions/PageTransition';
import { Button } from '@/shared/ui/Button';
import { NumberInput } from '@/shared/ui/NumberInput';
import { SmoothNumber } from '@/shared/ui/SmoothNumber';
import { formatIDR } from '@/shared/utils/currency';
import {
  EventReservationIcon,
  CheckInBadgeIcon,
} from '@/shared/components/icons/EnterpriseIcons';
import type {
  Reservation,
  EventType,
  CreateReservationPayload,
  BanquetPackage,
  CreateReservationPreorderPayload,
} from './types';
import {
  fetchReservations,
  createReservation,
  checkInReservation,
  fetchTables,
  fetchBanquetPackages,
  createBanquetPackage,
  fetchReservationPreorders,
  addReservationPreorder,
  updateReservationPrepStatus,
  sendReservationWAReminder,
} from './pos-api';
import { fetchCustomers } from '@/features/crm/crm-api';

type TabType = 'reservations' | 'banquet';

export const ReservationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeOutletId, accessibleOutlets, isGlobalAllOutlets } = useAuthStore();

  const currentOutlet = accessibleOutlets.find(o => o.id === activeOutletId);
  const isSteakRes = currentOutlet?.code === 'TSH-01' || (!currentOutlet && activeOutletId.includes('TSH'));
  const isGardenRes = currentOutlet?.code === 'TGR-01' || (!currentOutlet && activeOutletId.includes('TGR'));
  const isConsolidated = isGlobalAllOutlets && activeOutletId === 'ALL';

  const [activeTab, setActiveTab] = useState<TabType>('reservations');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Pre-Order Modal State
  const [preorderModalRes, setPreorderModalRes] = useState<Reservation | null>(null);
  const [isAddingPreorder, setIsAddingPreorder] = useState(false);
  const [newPreorderItem, setNewPreorderItem] = useState<CreateReservationPreorderPayload>({
    item_name: '',
    quantity: 10,
    unit_price: 35000,
    serving_stage: 'BUFFET_MAIN',
    kitchen_prep_station: 'KITCHEN',
    special_notes: '',
  });

  // WhatsApp Reminder Modal State
  const [waModalRes, setWaModalRes] = useState<Reservation | null>(null);
  const [copiedWA, setCopiedWA] = useState(false);

  // New Banquet Package Modal State
  const [isNewPackageModalOpen, setIsNewPackageModalOpen] = useState(false);
  const [packageSubmitting, setPackageSubmitting] = useState(false);
  const [newPackageForm, setNewPackageForm] = useState({
    code: '',
    name: '',
    description: '',
    min_pax: 30,
    price_per_pax: 85000,
    category: 'BUFFET_PRASMANAN' as BanquetPackage['category'],
  });

  // New reservation form state
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formCustomerPhone, setFormCustomerPhone] = useState('');
  const [formEventType, setFormEventType] = useState<EventType>('CORPORATE_EVENT');
  const [formPaxCount, setFormPaxCount] = useState(25);
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0] || '');
  const [formStartTime, setFormStartTime] = useState('12:00');
  const [formEndTime, setFormEndTime] = useState('15:00');
  const [formTableId, setFormTableId] = useState('');
  const [formBanquetPkgId, setFormBanquetPkgId] = useState('');
  const [formMinSpend, setFormMinSpend] = useState(2500000);
  const [formDepositAmount, setFormDepositAmount] = useState(1000000);
  const [formDepositPaid, setFormDepositPaid] = useState(true);
  const [formDpReceiptRef, setFormDpReceiptRef] = useState('TRF-BCA-992110');
  const [formLayoutNotes, setFormLayoutNotes] = useState('Meja Prasmanan Tengah + Kursi U-Shape');
  const [formSpecialRequests, setFormSpecialRequests] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Queries
  const {
    data: reservations = [],
    isLoading,
    refetch: loadData,
  } = useQuery({
    queryKey: ['reservations', activeOutletId],
    queryFn: () => fetchReservations(activeOutletId || undefined),
  });

  const {
    data: banquetPackages = [],
    isLoading: isBanquetLoading,
    refetch: loadBanquetData,
  } = useQuery({
    queryKey: ['banquet-packages', activeOutletId],
    queryFn: () => fetchBanquetPackages(activeOutletId || undefined),
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['dining-tables', activeOutletId],
    queryFn: () => fetchTables(activeOutletId || undefined),
  });

  const { data: crmCustomers = [] } = useQuery({
    queryKey: ['crm-customers-list'],
    queryFn: () => fetchCustomers(),
  });

  // Pre-orders query for active modal
  const {
    data: currentPreorders = [],
    refetch: loadPreorders,
  } = useQuery({
    queryKey: ['reservation-preorders', preorderModalRes?.id],
    queryFn: () => (preorderModalRes ? fetchReservationPreorders(preorderModalRes.id) : Promise.resolve([])),
    enabled: !!preorderModalRes,
  });
  const preordersList = Array.isArray(currentPreorders) ? currentPreorders : [];

  // Check-In Action
  const handleCheckIn = async (res: Reservation) => {
    const tableId = res.assigned_table_id || (tables[0] ? tables[0].id : '');
    if (!tableId) {
      alert('Pilih meja terlebih dahulu untuk check-in!');
      return;
    }

    setActionLoadingId(res.id);
    try {
      const order = await checkInReservation(res.id, tableId);
      navigate(`/pos/cashier?table_id=${tableId}&order_id=${order.id}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal check-in tamu');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Kitchen Prep Status Update
  const handleUpdatePrepStatus = async (resId: string, status: 'IN_PREP' | 'READY_FOR_EVENT') => {
    setActionLoadingId(resId);
    try {
      await updateReservationPrepStatus(resId, status);
      await loadData();
      showToast(status === 'IN_PREP' ? '🔥 Pesanan jamuan dikirim ke Dapur KDS!' : '✅ Jamuan siap disajikan di meja!');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal memperbarui status dapur');
    } finally {
      setActionLoadingId(null);
    }
  };

  // WhatsApp Reminder Handler
  const handleSendWAReminder = async (res: Reservation) => {
    try {
      await sendReservationWAReminder(res.id);
      await loadData();
      showToast('Status pengingat WhatsApp berhasil diperbarui!');
    } catch (err: unknown) {
      console.error(err);
    }
  };

  // Submit New Reservation
  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    let outletId = activeOutletId;
    if (!outletId || outletId === 'ALL') {
      outletId = accessibleOutlets.length > 0 ? (accessibleOutlets[0]?.id ?? '') : '';
    }

    const payload: CreateReservationPayload = {
      outlet_id: outletId,
      customer_id: formCustomerId || undefined,
      customer_name: formCustomerName,
      customer_phone: formCustomerPhone,
      event_type: formEventType,
      pax_count: formPaxCount,
      reservation_date: formDate,
      start_time: formStartTime,
      min_spend: formMinSpend,
      deposit_amount: formDepositAmount,
      deposit_paid: formDepositPaid,
      ...(formEndTime ? { end_time: formEndTime } : {}),
      ...(formTableId ? { assigned_table_id: formTableId } : {}),
      ...(formBanquetPkgId ? { banquet_package_id: formBanquetPkgId } : {}),
      ...(formLayoutNotes ? { layout_setup_notes: formLayoutNotes } : {}),
      ...(formDepositPaid ? { deposit_payment_method: 'TRANSFER', dp_receipt_ref: formDpReceiptRef } : {}),
      ...(formSpecialRequests ? { special_requests: formSpecialRequests } : {}),
    };

    try {
      await createReservation(payload);
      setIsNewModalOpen(false);
      await loadData();
      showToast('🎉 Reservasi event berhasil dibuat!');
      // Reset form
      setFormCustomerName('');
      setFormCustomerPhone('');
      setFormSpecialRequests('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat reservasi');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit New Banquet Package
  const handleCreateBanquetPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    setPackageSubmitting(true);
    try {
      let outletId = activeOutletId;
      if (!outletId || outletId === 'ALL') {
        outletId = accessibleOutlets.length > 0 ? (accessibleOutlets[0]?.id ?? '') : '';
      }
      await createBanquetPackage({
        outlet_id: outletId,
        code: newPackageForm.code,
        name: newPackageForm.name,
        description: newPackageForm.description,
        min_pax: newPackageForm.min_pax,
        price_per_pax: newPackageForm.price_per_pax,
        category: newPackageForm.category,
        is_active: true,
      });
      setIsNewPackageModalOpen(false);
      await loadBanquetData();
      showToast('✨ Paket Prasmanan baru berhasil disimpan!');
      setNewPackageForm({
        code: '',
        name: '',
        description: '',
        min_pax: 30,
        price_per_pax: 85000,
        category: 'BUFFET_PRASMANAN',
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal membuat paket');
    } finally {
      setPackageSubmitting(false);
    }
  };

  // Add Preorder Item
  const handleAddPreorderItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preorderModalRes) return;
    setIsAddingPreorder(true);
    try {
      await addReservationPreorder(preorderModalRes.id, newPreorderItem);
      await loadPreorders();
      await loadData();
      showToast('Item jamuan pre-order berhasil ditambahkan!');
      setNewPreorderItem({
        item_name: '',
        quantity: 10,
        unit_price: 35000,
        serving_stage: 'BUFFET_MAIN',
        kitchen_prep_station: 'KITCHEN',
        special_notes: '',
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menambahkan pre-order');
    } finally {
      setIsAddingPreorder(false);
    }
  };

  // Generate WA text
  const generateWAMessage = (res: Reservation) => {
    const pkg = res.banquet_package_name ? `🍽️ *Paket Jamuan:* ${res.banquet_package_name}\n` : '';
    const dpInfo = res.deposit_paid
      ? `✅ *Status DP:* Lunas Rp ${res.deposit_amount.toLocaleString('id-ID')} (${res.dp_receipt_ref || 'TRF-BANK'})`
      : `⚠️ *Status DP:* Belum Bayar (Target Rp ${res.deposit_amount.toLocaleString('id-ID')})`;

    const restoName = isSteakRes ? 'Tropical Steak House' : isGardenRes ? 'Tropical Garden Resto' : 'Tropical F&B Group';
    const defaultArea = isSteakRes ? 'Dining Room Indoor AC / VIP' : isGardenRes ? 'Gazebo Utama Manding' : 'Area Meja Resto';
    const mapsUrl = isSteakRes
      ? 'https://maps.google.com/?q=Tropical+Steak+House+Manding+Temanggung'
      : 'https://maps.google.com/?q=Tropical+Garden+Resto+Temanggung';

    return `Halo Yth. *${res.customer_name}*,

Terima kasih atas reservasi Anda di *${restoName}*! Berikut rincian reservasi event Anda:

📌 *No. Booking:* ${res.reservation_number}
📅 *Tanggal:* ${res.reservation_date}
⏰ *Waktu:* ${res.start_time} - ${res.end_time || 'Selesai'} WIB
👥 *Kapasitas:* ${res.pax_count} Tamu (Pax)
📍 *Area / Meja:* ${res.assigned_table_number || defaultArea}
${pkg}${dpInfo}

💡 _Uang muka (DP) otomatis terpotong sebagai saldo kredit tagihan saat billing di kasir._
🗺️ *Petunjuk Arah Google Maps:* ${mapsUrl}

Mohon konfirmasi kedatangan minimal 30 menit sebelum acara dimulai. Sampai jumpa di ${restoName}!`;
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const total = reservations.length;
    const totalPax = reservations.reduce((a, b) => a + b.pax_count, 0);
    const totalDeposit = reservations.reduce(
      (a, b) => a + (b.deposit_paid ? b.deposit_amount : 0),
      0
    );
    const confirmed = reservations.filter(r => r.status === 'CONFIRMED').length;
    const inPrep = reservations.filter(r => r.kitchen_prep_status === 'IN_PREP').length;
    return { total, totalPax, totalDeposit, confirmed, inPrep };
  }, [reservations]);

  const filteredReservations = useMemo(() => {
    return reservations.filter(r => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        r.customer_name.toLowerCase().includes(q) ||
        r.customer_phone.toLowerCase().includes(q) ||
        r.reservation_number.toLowerCase().includes(q) ||
        (r.assigned_table_number && r.assigned_table_number.toLowerCase().includes(q)) ||
        (r.banquet_package_name && r.banquet_package_name.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === 'ALL' ||
        r.status === statusFilter ||
        (statusFilter === 'IN_PREP' && r.kitchen_prep_status === 'IN_PREP');

      return matchesSearch && matchesStatus;
    });
  }, [reservations, searchQuery, statusFilter]);

  return (
    <PageTransition>
      <div className="tropical-glass max-w-7xl mx-auto space-y-6 pb-24">
        {/* Toast Alert */}
        {toastMsg && (
          <div className="fixed top-5 right-5 z-50 p-4 rounded-2xl bg-emerald-950 text-white border-2 border-emerald-500 shadow-2xl flex items-center gap-3 animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-bold text-sm text-emerald-100">{toastMsg}</span>
          </div>
        )}

        {/* Tropical Header Banner */}
        <div data-spot="hero" className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-950 via-slate-900 to-emerald-950 text-white p-6 sm:p-8 shadow-xl border border-purple-800/40">
          <div className="absolute -top-12 -right-12 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 backdrop-blur-md border border-purple-400/30 text-purple-300 text-xs font-semibold tracking-wide uppercase">
                <EventReservationIcon className="w-4 h-4 text-purple-300 animate-tropical-breeze" />
                {isSteakRes
                  ? 'Manajemen Reservasi & VIP Dining • Tropical Steak House'
                  : isGardenRes
                    ? 'Manajemen Banquet, Prasmanan & Reservasi • Tropical Garden Resto'
                    : 'Manajemen Banquet, Prasmanan & Reservasi Event'}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                {isSteakRes
                  ? 'Reservasi Meja & Jamuan Steak House'
                  : isGardenRes
                    ? 'Gathering, Jamuan Prasmanan & Gazebo'
                    : 'Gathering, Jamuan Prasmanan & Reservasi'}
              </h1>
              <p className="text-sm text-purple-100/90 max-w-2xl leading-relaxed">
                {isSteakRes
                  ? 'Platform reservasi banquet & dining room Tropical Steak House Manding: paket set menu steak, jamuan privat AC & VIP Lounge, serta sinkronisasi klaim uang muka (DP) otomatis ke Kasir POS.'
                  : isGardenRes
                    ? 'Platform banquet lengkap: kelola paket prasmanan, saung gazebo & aula joglo Tropical Garden Resto, serta sinkronisasi klaim uang muka (DP) otomatis ke Kasir POS.'
                    : 'Platform banquet lengkap: kelola paket prasmanan, pre-order sajian koki dapur, notifikasi pengingat WhatsApp instan, serta sinkronisasi klaim uang muka (DP) otomatis ke Kasir POS.'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void loadData();
                  void loadBanquetData();
                }}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md font-bold"
              >
                <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading || isBanquetLoading ? 'animate-spin' : ''}`} />
                Muat Ulang
              </Button>
              {activeTab === 'reservations' ? (
                <Button
                  onClick={() => setIsNewModalOpen(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-lg shadow-purple-600/30"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Buat Reservasi Baru
                </Button>
              ) : (
                <Button
                  onClick={() => setIsNewPackageModalOpen(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-lg shadow-purple-600/30"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Tambah Paket Prasmanan
                </Button>
              )}
            </div>
          </div>

          {/* KPI Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-white/15">
            <div data-spot="stat" className="animate-glass-card stagger-1 p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/15 transition-all">
              <div className="text-xs text-purple-200 font-semibold">Total Acara / Event</div>
              <div className="text-2xl font-black text-white mt-1">
                <SmoothNumber value={stats.total} format="number" />
              </div>
              <div className="text-[11px] text-purple-200/80 font-medium">{stats.confirmed} Terkonfirmasi</div>
            </div>
            <div data-spot="stat" className="animate-glass-card stagger-2 p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/15 transition-all">
              <div className="text-xs text-emerald-200 font-semibold">Total Pax Terjadwal</div>
              <div className="text-2xl font-black text-emerald-300 mt-1">
                <SmoothNumber value={stats.totalPax} format="number" suffix=" Orang" />
              </div>
              <div className="text-[11px] text-emerald-200/80 font-medium">
                {isConsolidated ? 'Kapasitas Terjadwal Group' : isSteakRes ? 'Kapasitas Dining & VIP Room' : isGardenRes ? 'Kapasitas Gazebo Manding' : 'Kapasitas Terjadwal Resto'}
              </div>
            </div>
            <div data-spot="stat" className="animate-glass-card stagger-3 p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/15 transition-all">
              <div className="text-xs text-amber-200 font-semibold">Uang Muka (DP) Masuk</div>
              <div className="text-2xl font-black text-amber-300 mt-1">
                <SmoothNumber value={stats.totalDeposit} format="idr" />
              </div>
              <div className="text-[11px] text-amber-200/80 font-medium">Kredit bill saat check-in</div>
            </div>
            <div data-spot="stat" className="animate-glass-card stagger-4 p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/15 transition-all">
              <div className="text-xs text-rose-200 font-semibold">Kitchen Alert / Sedang Masak</div>
              <div className="text-2xl font-black text-rose-300 mt-1">
                <SmoothNumber value={stats.inPrep} format="number" suffix=" Event" />
              </div>
              <div className="text-[11px] text-rose-200/80 font-medium">KDS Dapur Utama Aktif</div>
            </div>
          </div>
        </div>

        {/* Enterprise Solid Dark Purple Navigation Tabs */}
        <div data-spot="toolbar" className="flex gap-2 p-1.5 rounded-2xl bg-[#0c081c] border-2 border-purple-900/60 w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('reservations')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTab === 'reservations'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-purple-200 hover:text-white hover:bg-purple-950/40 font-bold'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Jadwal & Reservasi Tamu ({reservations.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('banquet')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTab === 'banquet'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-purple-200 hover:text-white hover:bg-purple-950/40 font-bold'
            }`}
          >
            <UtensilsCrossed className="w-4 h-4" />
            Katalog Paket Prasmanan & Banquet ({banquetPackages.length})
          </button>
        </div>

        {/* TAB 1: RESERVATIONS LIST */}
        {activeTab === 'reservations' && (
          <div className="space-y-5">
            {/* Filter Bar */}
            <div data-spot="toolbar" className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="relative w-full md:max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nomor reservasi, nama pemesan, no telp, atau paket..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                <span className="text-xs font-bold text-slate-600 shrink-0">Filter Status:</span>
                {[
                  { id: 'ALL', label: 'Semua' },
                  { id: 'CONFIRMED', label: 'Terkonfirmasi' },
                  { id: 'IN_PREP', label: '🔥 Sedang Masak' },
                  { id: 'SEATED', label: 'Sudah Duduk' },
                  { id: 'PENDING_DEPOSIT', label: 'Belum DP' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                      statusFilter === tab.id
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reservation Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredReservations.map(res => (
                <div
                  key={res.id}
                  data-spot="card"
                  className="p-6 rounded-3xl bg-white border-2 border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                >
                  <div>
                    {/* Header Badge */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-200">
                            {res.reservation_number}
                          </span>
                          <span className="text-xs font-bold text-slate-500">
                            {res.outlet_code}
                          </span>
                        </div>
                        <h3 className="text-lg font-black text-slate-950 mt-1">
                          {res.customer_name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-600 font-semibold flex items-center gap-1 font-mono">
                            <Phone className="w-3.5 h-3.5 text-slate-500" />
                            {res.customer_phone}
                          </span>
                          <button
                            type="button"
                            onClick={() => setWaModalRes(res)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-0.5 rounded-full border border-emerald-300 transition-colors"
                          >
                            <MessageSquare className="w-3 h-3 text-emerald-700" />
                            Format WA
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-black shadow-2xs ${
                            res.status === 'CONFIRMED'
                              ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                              : res.status === 'SEATED'
                              ? 'bg-blue-100 text-blue-950 border border-blue-300'
                              : 'bg-amber-100 text-amber-950 border border-amber-300'
                          }`}
                        >
                          {res.status === 'CONFIRMED'
                            ? '🟢 Terkonfirmasi'
                            : res.status === 'SEATED'
                            ? '🔵 Sudah Check-In (Duduk)'
                            : '🟡 Menunggu Pembayaran DP'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                          {res.event_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Banquet Package Highlight (if booked) */}
                    {res.banquet_package_name && (
                      <div className="p-3 rounded-2xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 text-xs mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UtensilsCrossed className="w-4 h-4 text-purple-700 shrink-0" />
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-purple-700">Paket Jamuan Terpilih</div>
                            <div className="font-black text-slate-900">{res.banquet_package_name}</div>
                          </div>
                        </div>
                        <span className="px-2.5 py-0.5 text-[10px] font-black bg-purple-600 text-white rounded-lg">
                          BUFFET
                        </span>
                      </div>
                    )}

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs my-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-purple-600 shrink-0" />
                        <div>
                          <div className="text-[11px] text-slate-500 font-medium">Jadwal Acara</div>
                          <div className="font-bold text-slate-900">{res.reservation_date}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-purple-600 shrink-0" />
                        <div>
                          <div className="text-[11px] text-slate-500 font-medium">Waktu</div>
                          <div className="font-bold text-slate-900">
                            {res.start_time} - {res.end_time || 'Selesai'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <div className="text-[11px] text-slate-500 font-medium">Kapasitas</div>
                          <div className="font-bold text-slate-900">{res.pax_count} Tamu (Pax)</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-amber-600 shrink-0" />
                        <div>
                          <div className="text-[11px] text-slate-500 font-medium">Lokasi / Meja</div>
                          <div className="font-bold text-slate-900">
                            {res.assigned_table_number || 'Belum Diplot'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Pre-Orders & Kitchen Prep Status */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs my-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <ChefHat className="w-4 h-4 text-slate-600" />
                          Status Kesiapan Dapur (BOH):
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-black text-[11px] ${
                            res.kitchen_prep_status === 'READY_FOR_EVENT'
                              ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                              : res.kitchen_prep_status === 'IN_PREP'
                              ? 'bg-amber-100 text-amber-950 border border-amber-300 animate-pulse'
                              : 'bg-slate-200 text-slate-800 border border-slate-300'
                          }`}
                        >
                          {res.kitchen_prep_status === 'READY_FOR_EVENT'
                            ? '✅ Jamuan Siap di Meja'
                            : res.kitchen_prep_status === 'IN_PREP'
                            ? '🔥 Sedang Dimasak Dapur'
                            : '🟡 Menunggu Jadwal'}
                        </span>
                      </div>

                      {/* Preorders Summary */}
                      {res.preorders && res.preorders.length > 0 ? (
                        <div className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                            Pre-order Masuk ({res.preorders.length} Menu):
                          </div>
                          <div className="space-y-1">
                            {res.preorders.map((po) => (
                              <div key={po.id} className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-slate-800">{po.quantity}x {po.item_name}</span>
                                <span className="text-slate-500 font-mono text-[10px]">{po.kitchen_prep_station}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500 italic">
                          Belum ada item pre-order masakan khusus.
                        </div>
                      )}

                      {/* Prep Actions & Preorder button */}
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => setPreorderModalRes(res)}
                          className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 font-bold text-[11px] border border-purple-200 transition"
                        >
                          Kelola Pre-Order
                        </button>
                        {res.kitchen_prep_status === 'QUEUED' && (
                          <button
                            type="button"
                            disabled={actionLoadingId === res.id}
                            onClick={() => handleUpdatePrepStatus(res.id, 'IN_PREP')}
                            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-[11px] flex items-center gap-1 shadow-2xs transition"
                          >
                            <Flame className="w-3.5 h-3.5" />
                            Kirim Notif Masak ke KDS
                          </button>
                        )}
                        {res.kitchen_prep_status === 'IN_PREP' && (
                          <button
                            type="button"
                            disabled={actionLoadingId === res.id}
                            onClick={() => handleUpdatePrepStatus(res.id, 'READY_FOR_EVENT')}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] flex items-center gap-1 shadow-2xs transition"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Tandai Makanan Siap
                          </button>
                        )}
                      </div>
                    </div>

                    {/* DP & Min Spend Notice */}
                    <div
                      className={`p-3.5 rounded-2xl border text-xs space-y-1.5 my-3 ${
                        res.deposit_paid
                          ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                          : 'bg-amber-50/90 border-amber-300 text-amber-950'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-700">Uang Muka (DP):</span>
                        <strong
                          className={`font-mono text-sm font-black ${
                            res.deposit_paid ? 'text-emerald-800' : 'text-amber-800'
                          }`}
                        >
                          {formatIDR(res.deposit_amount)} ({res.deposit_paid ? 'LUNAS DP' : 'BELUM BAYAR'})
                        </strong>
                      </div>

                      {res.deposit_paid && (
                        <div className="flex items-center justify-between text-[11px] text-emerald-800 font-medium">
                          <span>Metode & Bukti:</span>
                          <span className="font-mono font-bold">
                            {res.deposit_payment_method || 'TRANSFER'}{' '}
                            {res.dp_receipt_ref ? `[Ref: ${res.dp_receipt_ref}]` : ''}
                          </span>
                        </div>
                      )}

                      {res.deposit_paid && (
                        <div className="text-[11px] text-emerald-700 font-semibold bg-emerald-100/70 px-2 py-1 rounded-lg border border-emerald-300/50">
                          ⚡ DP otomatis terpotong sebagai kredit tagihan saat check-in meja di Kasir!
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                        <span className="font-semibold text-slate-600">Target Minimum Spend:</span>
                        <span className="font-mono font-bold text-slate-900">{formatIDR(res.min_spend)}</span>
                      </div>

                      {res.layout_setup_notes && (
                        <div className="pt-1 text-[11px] text-indigo-900 font-semibold border-t border-slate-200/60">
                          📐 Layout: {res.layout_setup_notes}
                        </div>
                      )}

                      {res.special_requests && (
                        <div className="pt-1.5 text-[11px] text-slate-700 italic border-t border-slate-200/60">
                          &quot;{res.special_requests}&quot;
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Button: Check In or View Active Table */}
                  <div className="pt-3 border-t border-slate-200 space-y-2">
                    {res.status === 'SEATED' ? (
                      <Button
                        onClick={() => {
                          if (res.assigned_table_id) {
                            navigate(`/pos/cashier?table_id=${res.assigned_table_id}`);
                          } else {
                            navigate('/pos/tables');
                          }
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-2.5 text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20"
                      >
                        <span>Lihat Pesanan & Tagihan Meja ({res.assigned_table_number || 'Aktif'})</span>
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleCheckIn(res)}
                        loading={actionLoadingId === res.id}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                      >
                        <CheckInBadgeIcon className="w-4 h-4" />
                        Check-In Tamu & Buka Order Meja
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: BANQUET & PRASMANAN PACKAGES */}
        {activeTab === 'banquet' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-950 flex items-center gap-2">
                  <UtensilsCrossed className="w-5 h-5 text-purple-700" />
                  Katalog Paket Prasmanan & Jamuan Event
                </h2>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                  Standarisasi hidangan prasmanan, set menu VIP steak, dan paket arisan keluarga. Dirancang untuk efisiensi prep koki dapur, yield resep terukur, dan kepuasan tamu gathering.
                </p>
              </div>
              <Button
                onClick={() => setIsNewPackageModalOpen(true)}
                className="bg-purple-700 hover:bg-purple-800 text-white font-black px-5 py-2.5 rounded-xl text-xs shrink-0 shadow-md shadow-purple-700/20"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Tambah Paket Jamuan Baru
              </Button>
            </div>

            {/* Packages Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {banquetPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="rounded-3xl bg-white border-2 border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
                >
                  <div className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-purple-100 text-purple-900 border border-purple-200">
                        {pkg.code}
                      </span>
                      <span className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-emerald-100 text-emerald-900 border border-emerald-200">
                        {pkg.category.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-lg font-black text-slate-950">{pkg.name}</h3>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{pkg.description}</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200/80">
                      <div className="text-[11px] font-bold text-purple-900">Tarif Per Tamu (Pax):</div>
                      <div className="text-2xl font-black text-purple-950 font-mono mt-0.5">
                        {formatIDR(pkg.price_per_pax)}
                        <span className="text-xs text-purple-700 font-semibold font-sans"> / orang</span>
                      </div>
                      <div className="text-[11px] text-purple-800 mt-1">
                        Minimum Pesanan: <strong>{pkg.min_pax} Pax</strong> (Total min.{' '}
                        {formatIDR(pkg.price_per_pax * pkg.min_pax)})
                      </div>
                    </div>

                    {/* Courses Breakdown */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-purple-600" />
                        Susunan Menu Jamuan:
                      </div>
                      {pkg.items && pkg.items.length > 0 ? (
                        <div className="space-y-1.5">
                          {pkg.items.map((item) => (
                            <div
                              key={item.id}
                              className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between"
                            >
                              <div>
                                <span className="font-bold text-slate-900">{item.menu_item_name}</span>
                                {item.notes && <div className="text-[10px] text-slate-500 italic">{item.notes}</div>}
                              </div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                                {item.dish_course}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-xl">
                          Termasuk 4 varian lauk utama, sup jamuan, 2 sajian penutup, dan free flow es teh manis.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      Tersedia untuk Booking
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFormBanquetPkgId(pkg.id);
                        setFormMinSpend(pkg.price_per_pax * pkg.min_pax);
                        setIsNewModalOpen(true);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-2xs transition"
                    >
                      Pilih untuk Acara
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODAL: PRE-ORDER DISHES */}
        {preorderModalRes && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                <div>
                  <h3 className="font-black text-lg text-slate-950 flex items-center gap-2">
                    <ChefHat className="w-5 h-5 text-purple-700" />
                    Pre-Order Sajian Jamuan: {preorderModalRes.customer_name}
                  </h3>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    No: {preorderModalRes.reservation_number} | {preorderModalRes.pax_count} Pax | {preorderModalRes.reservation_date}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreorderModalRes(null)}
                  className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto">
                {/* Existing Pre-orders */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Daftar Sajian Terjadwal ({preordersList.length})
                  </h4>
                  {preordersList.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                      Belum ada sajian yang dijadwalkan secara spesifik.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {preordersList.map((po) => (
                        <div
                          key={po.id}
                          className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-black text-slate-900 text-sm">{po.item_name}</div>
                            <div className="text-slate-600 mt-0.5">
                              {po.quantity} porsi x {formatIDR(po.unit_price)} ={' '}
                              <strong className="text-purple-900 font-mono">{formatIDR(po.total_price)}</strong>
                            </div>
                            {po.special_notes && (
                              <div className="text-[11px] text-slate-500 italic mt-0.5">Note: {po.special_notes}</div>
                            )}
                          </div>
                          <div className="text-right space-y-1">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-900">
                              {po.serving_stage}
                            </span>
                            <div className="text-[10px] font-mono font-bold text-slate-600">
                              Stasiun: {po.kitchen_prep_station}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Form Add New Preorder */}
                <form onSubmit={handleAddPreorderItem} className="p-4 rounded-2xl bg-purple-50/50 border border-purple-200 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-purple-950 flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-purple-700" />
                    Tambah Sajian Pre-Order Baru
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase">Nama Menu / Paket</label>
                      <input
                        required
                        type="text"
                        value={newPreorderItem.item_name}
                        onChange={(e) => setNewPreorderItem({ ...newPreorderItem, item_name: e.target.value })}
                        placeholder="Cth: Ribeye Steak 200g (Medium)"
                        className="w-full mt-1 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase">Jumlah Porsi</label>
                      <div className="mt-1">
                        <NumberInput
                          min={1}
                          value={newPreorderItem.quantity}
                          onChange={(val) => setNewPreorderItem({ ...newPreorderItem, quantity: val || 1 })}
                          suffix="Porsi"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase">Harga Satuan (Rp)</label>
                      <div className="mt-1">
                        <NumberInput
                          min={0}
                          value={newPreorderItem.unit_price}
                          onChange={(val) => setNewPreorderItem({ ...newPreorderItem, unit_price: val || 0 })}
                          prefix="Rp"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase">Tahapan Sajian</label>
                      <select
                        value={newPreorderItem.serving_stage}
                        onChange={(e) => setNewPreorderItem({ ...newPreorderItem, serving_stage: e.target.value as CreateReservationPreorderPayload['serving_stage'] })}
                        className="w-full mt-1 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900"
                      >
                        <option value="WELCOME_DRINK">Welcome Drink</option>
                        <option value="STARTER">Starter / Pembuka</option>
                        <option value="BUFFET_MAIN">Buffet Main Dish</option>
                        <option value="CLOSING_DESSERT">Closing Dessert</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase">Stasiun Dapur</label>
                      <select
                        value={newPreorderItem.kitchen_prep_station}
                        onChange={(e) => setNewPreorderItem({ ...newPreorderItem, kitchen_prep_station: e.target.value as CreateReservationPreorderPayload['kitchen_prep_station'] })}
                        className="w-full mt-1 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900"
                      >
                        <option value="GRILL">Grill & Steak</option>
                        <option value="KITCHEN">Dapur Nusantara</option>
                        <option value="BAR">Bar Minuman</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase">Catatan Koki / Doneness</label>
                    <input
                      type="text"
                      value={newPreorderItem.special_notes || ''}
                      onChange={(e) => setNewPreorderItem({ ...newPreorderItem, special_notes: e.target.value })}
                      placeholder="Cth: Sambal matah dipisah, tanpa lada hitam"
                      className="w-full mt-1 px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-white text-slate-900"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      loading={isAddingPreorder}
                      className="bg-purple-700 hover:bg-purple-800 text-white font-black text-xs px-5 py-2 rounded-xl shadow-xs"
                    >
                      Tambahkan ke Jamuan
                    </Button>
                  </div>
                </form>
              </div>

              <div className="flex justify-end p-4 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setPreorderModalRes(null)}
                  className="px-6 py-2 rounded-xl text-xs font-black bg-slate-800 text-white border-2 border-slate-600 hover:bg-slate-700 transition"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: WHATSAPP REMINDER */}
        {waModalRes && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-950">
                      Pengingat & Konfirmasi WhatsApp
                    </h3>
                    <div className="text-xs text-slate-500 font-medium">
                      Penerima: {waModalRes.customer_name} ({waModalRes.customer_phone})
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setWaModalRes(null);
                    setCopiedWA(false);
                  }}
                  className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-300 text-xs text-emerald-950">
                  <span className="font-bold">Format Siap Kirim:</span> Pesan otomatis menyertakan nomor booking, jadwal acara, jumlah pax, rincian DP, dan peta Google Maps lokasi resto.
                </div>

                <div className="relative">
                  <textarea
                    readOnly
                    rows={10}
                    aria-label="Format Pesan WhatsApp"
                    value={generateWAMessage(waModalRes)}
                    className="w-full p-4 text-xs font-mono bg-slate-900 text-emerald-300 rounded-2xl border border-slate-700 focus:outline-none shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(generateWAMessage(waModalRes));
                      setCopiedWA(true);
                      setTimeout(() => setCopiedWA(false), 2000);
                    }}
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1 border border-slate-600 transition"
                  >
                    {copiedWA ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedWA ? 'Tersalin!' : 'Salin Pesan'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => {
                    setWaModalRes(null);
                    setCopiedWA(false);
                  }}
                  className="px-6 py-2.5 rounded-xl text-xs font-black bg-slate-800 text-white border-2 border-slate-600 hover:bg-slate-700 transition"
                >
                  Tutup
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleSendWAReminder(waModalRes)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 transition"
                  >
                    Tandai Sudah Terkirim
                  </button>
                  <a
                    href={`https://wa.me/62${waModalRes.customer_phone.replace(/^0/, '')}?text=${encodeURIComponent(
                      generateWAMessage(waModalRes)
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-6 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 shadow-md shadow-emerald-600/30 transition"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Kirim via WhatsApp Web/App
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: CREATE BANQUET PACKAGE */}
        {isNewPackageModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h3 className="font-black text-lg text-slate-950 flex items-center gap-2">
                  <UtensilsCrossed className="w-5 h-5 text-purple-700" />
                  Tambah Paket Jamuan / Prasmanan
                </h3>
                <button
                  type="button"
                  onClick={() => setIsNewPackageModalOpen(false)}
                  className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateBanquetPackage} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase">Kode Paket *</label>
                    <input
                      required
                      type="text"
                      value={newPackageForm.code}
                      onChange={(e) => setNewPackageForm({ ...newPackageForm, code: e.target.value.toUpperCase() })}
                      placeholder="PKG-VIP-50"
                      className="w-full mt-1 px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase">Kategori</label>
                    <select
                      value={newPackageForm.category}
                      onChange={(e) => setNewPackageForm({ ...newPackageForm, category: e.target.value as BanquetPackage['category'] })}
                      className="w-full mt-1 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900"
                    >
                      <option value="BUFFET_PRASMANAN">Buffet Prasmanan</option>
                      <option value="VIP_SET_MENU">VIP Set Menu</option>
                      <option value="COFFEE_BREAK">Coffee Break & Snack</option>
                      <option value="CUSTOM_BANQUET">Custom Banquet</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-800 uppercase">Nama Paket Jamuan *</label>
                  <input
                    required
                    type="text"
                    value={newPackageForm.name}
                    onChange={(e) => setNewPackageForm({ ...newPackageForm, name: e.target.value })}
                    placeholder="Cth: Paket Prasmanan Istimewa Manding"
                    className="w-full mt-1 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase">Harga Per Pax (Rp) *</label>
                    <div className="mt-1">
                      <NumberInput
                        min={0}
                        value={newPackageForm.price_per_pax}
                        onChange={(val) => setNewPackageForm({ ...newPackageForm, price_per_pax: val || 0 })}
                        prefix="Rp"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase">Min. Pemesanan Pax *</label>
                    <div className="mt-1">
                      <NumberInput
                        min={1}
                        value={newPackageForm.min_pax}
                        onChange={(val) => setNewPackageForm({ ...newPackageForm, min_pax: val || 1 })}
                        suffix="Pax"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-800 uppercase">Deskripsi & Detail Sajian</label>
                  <textarea
                    rows={3}
                    value={newPackageForm.description}
                    onChange={(e) => setNewPackageForm({ ...newPackageForm, description: e.target.value })}
                    placeholder="Sajian 5 menu utama, welcome drink kelapa muda, dan stall dessert..."
                    className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsNewPackageModalOpen(false)}
                    className="px-6 py-2.5 rounded-xl text-xs font-black bg-slate-800 text-white border-2 border-slate-600 hover:bg-slate-700 transition"
                  >
                    Batal
                  </button>
                  <Button
                    type="submit"
                    loading={packageSubmitting}
                    className="bg-purple-700 hover:bg-purple-800 text-white font-black px-6 py-2.5 rounded-xl text-xs shadow-md shadow-purple-700/20"
                  >
                    Simpan Paket Jamuan
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: NEW RESERVATION */}
        {isNewModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h3 className="font-black text-lg text-slate-950 flex items-center gap-2">
                  <EventReservationIcon className="w-5 h-5 text-purple-700" />
                  Buat Reservasi Event & Jamuan Baru
                </h3>
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateReservation} className="p-6 space-y-4 overflow-y-auto">
                {errorMsg && (
                  <div className="p-3 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span className="font-semibold">{errorMsg}</span>
                  </div>
                )}

                {crmCustomers.length > 0 && (
                  <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200">
                    <label className="text-xs font-bold text-purple-900 block mb-1">
                      Pilih dari Member Pelanggan Terdaftar (CRM)
                    </label>
                    <select
                      value={formCustomerId}
                      onChange={e => {
                        const cid = e.target.value;
                        setFormCustomerId(cid);
                        const found = crmCustomers.find(c => c.id === cid);
                        if (found) {
                          setFormCustomerName(found.name);
                          setFormCustomerPhone(found.phone);
                        }
                      }}
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-purple-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                    >
                      <option value="">-- Tamu Baru (Input Manual) --</option>
                      {crmCustomers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.membership_tier.replace('_', ' ')} - {c.phone})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Nama PIC Pemesan *
                    </label>
                    <input
                      required
                      type="text"
                      value={formCustomerName}
                      onChange={e => setFormCustomerName(e.target.value)}
                      placeholder="Cth: Bpk. Bambang Sutrisno"
                      className="w-full mt-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      No. WhatsApp / Telp *
                    </label>
                    <input
                      required
                      type="text"
                      value={formCustomerPhone}
                      onChange={e => setFormCustomerPhone(e.target.value)}
                      placeholder="08123456789"
                      className="w-full mt-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Tipe Acara
                    </label>
                    <select
                      value={formEventType}
                      onChange={e => setFormEventType(e.target.value as EventType)}
                      className="w-full mt-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                    >
                      <option value="CORPORATE_EVENT">Gathering Perusahaan / Paguyuban</option>
                      <option value="FAMILY_GATHERING">Arisan / Reuni Keluarga</option>
                      <option value="BIRTHDAY_PARTY">Ulang Tahun / Syukuran</option>
                      <option value="WEDDING_RECEPTION">Resepsi / Lamaran</option>
                      <option value="REGULAR_DINING">Makan Malam Biasa</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Jumlah Tamu (Pax) *
                    </label>
                    <div className="mt-1.5">
                      <NumberInput
                        min={1}
                        value={formPaxCount}
                        onChange={(val) => {
                          const p = val || 1;
                          setFormPaxCount(p);
                          // Auto calculate min spend if banquet package selected
                          const pkg = banquetPackages.find(b => b.id === formBanquetPkgId);
                          if (pkg) {
                            setFormMinSpend(pkg.price_per_pax * p);
                          }
                        }}
                        suffix="Pax"
                      />
                    </div>
                  </div>
                </div>

                {/* Banquet Package Selection */}
                <div className="p-3 rounded-2xl bg-purple-50/60 border border-purple-200">
                  <label className="text-xs font-bold text-purple-900 uppercase tracking-wide block mb-1">
                    Pilih Paket Prasmanan / Jamuan (Opsional)
                  </label>
                  <select
                    value={formBanquetPkgId}
                    onChange={e => {
                      const pid = e.target.value;
                      setFormBanquetPkgId(pid);
                      const pkg = banquetPackages.find(b => b.id === pid);
                      if (pkg) {
                        setFormMinSpend(pkg.price_per_pax * formPaxCount);
                        setFormDepositAmount(Math.round((pkg.price_per_pax * formPaxCount * 0.3) / 10000) * 10000);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-purple-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">-- Tanpa Paket (Ala Carte / Pre-order Lepas) --</option>
                    {banquetPackages.map(pkg => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} ({formatIDR(pkg.price_per_pax)}/pax - Min {pkg.min_pax} Pax)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Tanggal Acara
                    </label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={e => setFormDate(e.target.value)}
                      className="w-full mt-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Jam Mulai
                    </label>
                    <input
                      type="time"
                      value={formStartTime}
                      onChange={e => setFormStartTime(e.target.value)}
                      className="w-full mt-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Jam Selesai
                    </label>
                    <input
                      type="time"
                      value={formEndTime}
                      onChange={e => setFormEndTime(e.target.value)}
                      className="w-full mt-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Pilih Area / Meja
                    </label>
                    <select
                      value={formTableId}
                      onChange={e => setFormTableId(e.target.value)}
                      className="w-full mt-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                    >
                      <option value="">
                        {isSteakRes ? 'Pilih Meja / Ruang VIP...' : isGardenRes ? 'Pilih Area / Gazebo...' : 'Pilih Area / Meja...'}
                      </option>
                      {tables.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.table_number} ({t.capacity} Kursi)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Min. Spend Rp
                    </label>
                    <div className="mt-1.5">
                      <NumberInput
                        min={0}
                        step={50000}
                        value={formMinSpend}
                        onChange={(val) => setFormMinSpend(val)}
                        prefix="Rp"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      DP Uang Muka Rp
                    </label>
                    <div className="mt-1.5">
                      <NumberInput
                        min={0}
                        step={50000}
                        value={formDepositAmount}
                        onChange={(val) => setFormDepositAmount(val)}
                        prefix="Rp"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="dp_paid"
                    checked={formDepositPaid}
                    onChange={e => setFormDepositPaid(e.target.checked)}
                    className="size-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                  />
                  <label htmlFor="dp_paid" className="text-xs font-bold text-slate-800 cursor-pointer">
                    Uang Muka (DP) Sudah Dibayar via Transfer Bank / QRIS
                  </label>
                </div>

                {formDepositPaid && (
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Nomor Bukti Transfer / Kwitansi DP
                    </label>
                    <input
                      type="text"
                      value={formDpReceiptRef}
                      onChange={e => setFormDpReceiptRef(e.target.value)}
                      placeholder="Contoh: TRF-BCA-889123 / QRIS-99120"
                      className="w-full mt-1.5 px-3.5 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Catatan Tata Letak / Setup Meja
                  </label>
                  <input
                    type="text"
                    value={formLayoutNotes}
                    onChange={e => setFormLayoutNotes(e.target.value)}
                    placeholder={
                      isSteakRes
                        ? 'Susunan meja prasmanan VIP, set cutlery steak, projector...'
                        : 'Susunan kursi U-Shape, meja prasmanan di pinggir gazebo...'
                    }
                    className="w-full mt-1.5 px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Permintaan Khusus & Sound System
                  </label>
                  <textarea
                    rows={2}
                    value={formSpecialRequests}
                    onChange={e => setFormSpecialRequests(e.target.value)}
                    placeholder="Mic wireless 2 unit, dekorasi balon, sambal terpisah..."
                    className="w-full mt-1.5 px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsNewModalOpen(false)}
                    className="px-6 py-2.5 rounded-xl text-xs font-black bg-slate-800 text-white border-2 border-slate-600 hover:bg-slate-700 transition"
                  >
                    Batal
                  </button>
                  <Button
                    type="submit"
                    loading={isSubmitting}
                    className="bg-purple-700 hover:bg-purple-800 text-white font-black px-6 py-2.5 rounded-xl text-xs shadow-md shadow-purple-700/20"
                  >
                    Simpan Reservasi
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
};
