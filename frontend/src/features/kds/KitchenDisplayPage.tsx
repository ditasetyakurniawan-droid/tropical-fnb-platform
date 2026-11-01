import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  RotateCcw,
  RefreshCw,
  Search,
  Sparkles,
  Check,
  Bell,
  Printer,
  Lock,
} from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth-store';
import { PageTransition } from '@/shared/components/transitions/PageTransition';
import { Button } from '@/shared/ui/Button';
import { SmoothNumber } from '@/shared/ui/SmoothNumber';
import {
  fetchKitchenTickets,
  updateOrderItemStatus,
  updateOrderStatus,
  bumpTicket,
} from './kds-api';
import type { KitchenTicketItem, ItemStatus } from './types';
import { printKitchenTicket } from '@/features/pos/thermal-printer';

// Audio chime using Web Audio API (zero external assets needed)
function playKitchenChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Audio context not allowed or not supported; ignore gracefully
  }
}

export const KitchenDisplayPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeOutletId, accessibleOutlets, isGlobalAllOutlets } = useAuthStore();

  // Selected Restaurant Screen for KDS
  // Strict isolation: non-global staff is locked to their assigned outlet, only Owner can switch
  const currentOutlet = accessibleOutlets.find(o => o.id === activeOutletId);
  const isLockedGarden = currentOutlet?.code === 'TGR-01' || (!currentOutlet && activeOutletId.includes('TGR'));
  const defaultResto = isLockedGarden ? 'GARDEN' : 'STEAK';
  const [manualResto, setManualResto] = useState<string | null>(null);
  const selectedRestoOutletId = isGlobalAllOutlets ? (manualResto ?? defaultResto) : defaultResto;

  const [selectedStation, setSelectedStation] = useState<string>('ALL');
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Resolve actual outlet ID for API
  const steakOutlet = accessibleOutlets.find(o => o.code === 'TSH-01');
  const gardenOutlet = accessibleOutlets.find(o => o.code === 'TGR-01');

  const resolvedOutletId = useMemo(() => {
    if (selectedRestoOutletId === 'STEAK') return steakOutlet?.id;
    if (selectedRestoOutletId === 'GARDEN') return gardenOutlet?.id;
    return undefined;
  }, [selectedRestoOutletId, steakOutlet, gardenOutlet]);

  // Station definitions tailored to the active restaurant
  const isSteakResto = selectedRestoOutletId === 'STEAK';

  const stations = useMemo(() => {
    if (isSteakResto) {
      return [
        { id: 'ALL', label: 'Semua Stasiun Steak', icon: '🥩' },
        { id: 'GRILL_STEAK', label: 'Grill & Steak (Kematangan)', icon: '🔥' },
        { id: 'SIDES_PANTRY', label: 'Sides & Saus (Fries/Salad)', icon: '🍟' },
        { id: 'BEVERAGE_BAR', label: 'Bar Minuman Steak', icon: '🍹' },
        { id: 'EXPEDITER', label: 'Checker / Runner Meja', icon: '🛎️' },
      ];
    }
    return [
      { id: 'ALL', label: 'Semua Stasiun Garden', icon: '🌿' },
      { id: 'BAKARAN_GORENG', label: 'Bakaran & Goreng (Ayam/Ikan)', icon: '🔥' },
      { id: 'DAPUR_NUSANTARA', label: 'Dapur Nusantara & Kuah', icon: '🍲' },
      { id: 'BAR_TRADISIONAL', label: 'Bar Kelapa & Kopi Joglo', icon: '🥥' },
      { id: 'EXPEDITER', label: 'Checker / Runner Gazebo', icon: '🛎️' },
    ];
  }, [isSteakResto]);

  // Query kitchen tickets (auto refetch every 6 seconds)
  const {
    data: tickets = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['kds-tickets', resolvedOutletId, selectedStation, showHistory],
    queryFn: () => fetchKitchenTickets(resolvedOutletId, selectedStation, showHistory),
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
  });

  // Sound chime and optionally auto-print ONLY when a genuine new ticket or item arrives after initial load
  const isInitializedRef = useRef(false);
  const knownTicketIdsRef = useRef<Set<string>>(new Set());
  const knownItemIdsRef = useRef<Set<string>>(new Set());
  const [autoPrintKDS, setAutoPrintKDS] = useState<boolean>(() => {
    return localStorage.getItem('kds_auto_print_kitchen') === 'true';
  });

  const toggleAutoPrintKDS = () => {
    setAutoPrintKDS(prev => {
      const next = !prev;
      localStorage.setItem('kds_auto_print_kitchen', String(next));
      return next;
    });
  };

  // Reset initialization flag whenever outlet or station filter changes so existing tickets aren't re-printed
  useEffect(() => {
    isInitializedRef.current = false;
  }, [resolvedOutletId, selectedStation, showHistory]);

  useEffect(() => {
    if (isLoading) return;

    const currentTicketIds = new Set(tickets.map(t => t.id || t.order_number));
    const currentItemIds = new Set<string>();
    tickets.forEach(t => {
      (t.items || []).forEach(it => {
        if (it.id) currentItemIds.add(it.id);
      });
    });

    // First load / mount: silently remember existing tickets & items without chiming or printing
    if (!isInitializedRef.current) {
      knownTicketIdsRef.current = currentTicketIds;
      knownItemIdsRef.current = currentItemIds;
      isInitializedRef.current = true;
      return;
    }

    if (!showHistory) {
      let hasAnyNewItems = false;

      tickets.forEach(ticket => {
        const stationItems = (ticket.items || []).filter(it => {
          if (!selectedStation || selectedStation === 'ALL') return true;
          return it.station === selectedStation;
        });

        // Detect items not yet known to this station
        const newStationItems = stationItems.filter(it => !knownItemIdsRef.current.has(it.id));

        if (newStationItems.length > 0) {
          hasAnyNewItems = true;
          const isAddition = knownTicketIdsRef.current.has(ticket.id || ticket.order_number);

          if (autoPrintKDS) {
            printKitchenTicket(
              {
                ...ticket,
                items: newStationItems,
                isAddition,
              },
              {
                paperWidth: '80mm',
                stationFilter: selectedStation,
                isAddition,
              }
            );
          }
        }
      });

      if (hasAnyNewItems) {
        playKitchenChime();
      }
    }

    knownTicketIdsRef.current = currentTicketIds;
    knownItemIdsRef.current = currentItemIds;
  }, [tickets, isLoading, showHistory, autoPrintKDS, selectedStation]);

  // Mutations
  const itemStatusMutation = useMutation({
    mutationFn: ({ orderId, itemId, status }: { orderId: string; itemId: string; status: string }) =>
      updateOrderItemStatus(orderId, itemId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kds-tickets'] }),
  });

  const bumpMutation = useMutation({
    mutationFn: ({ orderId, targetStatus }: { orderId: string; targetStatus: string }) =>
      bumpTicket(orderId, targetStatus),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kds-tickets'] }),
  });

  const orderStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      updateOrderStatus(orderId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kds-tickets'] }),
  });

  // Cycle item status: ORDERED -> COOKING -> READY -> SERVED
  const handleCycleItemStatus = async (orderId: string, item: KitchenTicketItem) => {
    let nextStatus: ItemStatus = 'COOKING';
    if (item.status === 'ORDERED') nextStatus = 'COOKING';
    else if (item.status === 'COOKING') nextStatus = 'READY';
    else if (item.status === 'READY') nextStatus = 'SERVED';
    else if (item.status === 'SERVED') nextStatus = 'COOKING';

    await itemStatusMutation.mutateAsync({ orderId, itemId: item.id, status: nextStatus });
  };

  // Bump all items to READY
  const handleMarkTicketReady = async (orderId: string) => {
    setActionLoadingId(orderId);
    try {
      await bumpMutation.mutateAsync({ orderId, targetStatus: 'READY' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Complete / Serve entire ticket
  const handleMarkTicketServed = async (orderId: string) => {
    setActionLoadingId(orderId);
    try {
      await bumpMutation.mutateAsync({ orderId, targetStatus: 'SERVED' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Recall / Undo served order
  const handleRecallOrder = async (orderId: string) => {
    setActionLoadingId(orderId);
    try {
      await orderStatusMutation.mutateAsync({ orderId, status: 'IN_KITCHEN' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filter tickets by search query
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const matchSearch =
        t.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.table_number && t.table_number.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchSearch;
    });
  }, [tickets, searchQuery]);

  // Live timer tick every 10 seconds to recalculate elapsed time
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Helper to format elapsed kitchen cook time cleanly
  const formatCookTime = (elapsedMinutes: number, elapsedSeconds: number) => {
    if (elapsedMinutes >= 1440) {
      const days = Math.floor(elapsedMinutes / 1440);
      const remHours = Math.floor((elapsedMinutes % 1440) / 60);
      return `>${days}h ${remHours}m`;
    }
    if (elapsedMinutes >= 60) {
      const hours = Math.floor(elapsedMinutes / 60);
      const remMinutes = elapsedMinutes % 60;
      return `${hours}j ${remMinutes}m`;
    }
    return `${String(elapsedMinutes).padStart(2, '0')}:${String(elapsedSeconds).padStart(2, '0')}`;
  };

  // Helper to parse steak doneness tag
  const parseDonenessBadge = (notes?: string | null) => {
    if (!notes) return null;
    const upper = notes.toUpperCase();
    if (upper.includes('WELL DONE')) return 'Well Done';
    if (upper.includes('MEDIUM WELL')) return 'Medium Well';
    if (upper.includes('MEDIUM RARE')) return 'Medium Rare';
    if (upper.includes('MEDIUM')) return 'Medium';
    if (upper.includes('RARE')) return 'Rare';
    return null;
  };

  return (
    <PageTransition>
      <div className="tropical-glass max-w-7xl mx-auto space-y-6 pb-24">
        {/* Top Header Banner: Kitchen Mission Control */}
        <div data-spot="hero" className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950 text-white p-6 sm:p-7 shadow-xl border border-amber-900/40">
          <div className="absolute -top-12 -right-12 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 backdrop-blur-md border border-amber-400/30 text-amber-300 text-xs font-semibold uppercase tracking-wide">
                <ChefHat className="w-3.5 h-3.5 animate-pulse" />
                Kitchen Display System (KDS) &amp; Station Routing
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                Layar Dapur &amp; Station Masak
              </h1>
              <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                {isSteakResto
                  ? 'Antrean tiket pesanan terisolasi Dapur Tropical Steak House Manding dengan penunjuk durasi waktu masak grill dan pemecahan stasiun koki.'
                  : 'Antrean tiket pesanan terisolasi Dapur Tropical Garden Resto Manding dengan penunjuk durasi waktu masak bakaran dan pemecahan stasiun koki.'}
              </p>
            </div>

            {/* RESTAURANT ISOLATION: Switcher only for Global Owner, locked badge for Branch Staff */}
            {isGlobalAllOutlets ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 bg-black/40 p-2 rounded-2xl border border-white/10 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => {
                    setManualResto('STEAK');
                    setSelectedStation('ALL');
                  }}
                  className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-sm ${
                    selectedRestoOutletId === 'STEAK'
                      ? 'bg-amber-600 text-white border border-amber-400 ring-2 ring-amber-500/40'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span className="text-base">🥩</span>
                  <div className="text-left leading-tight">
                    <div className="font-black">Tropical Steak House</div>
                    <div className="text-[10px] text-amber-200/80 font-normal">Dapur Grill &amp; Western</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setManualResto('GARDEN');
                    setSelectedStation('ALL');
                  }}
                  className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-sm ${
                    selectedRestoOutletId === 'GARDEN'
                      ? 'bg-emerald-600 text-white border border-emerald-400 ring-2 ring-emerald-500/40'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span className="text-base">🌿</span>
                  <div className="text-left leading-tight">
                    <div className="font-black">Tropical Garden Resto</div>
                    <div className="text-[10px] text-emerald-200/80 font-normal">Dapur Bakaran &amp; Tradisional</div>
                  </div>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 bg-black/50 px-4 py-3 rounded-2xl border border-white/15 backdrop-blur-md shadow-inner">
                <span className="text-xl">{isSteakResto ? '🥩' : '🌿'}</span>
                <div className="text-left leading-tight">
                  <div className="text-xs font-black text-white flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    {isSteakResto ? 'Tropical Steak House' : 'Tropical Garden Resto'}
                  </div>
                  <div className="text-[10px] text-slate-300 font-semibold mt-0.5">
                    {isSteakResto ? 'Dapur Terisolasi Grill & Western' : 'Dapur Terisolasi Bakaran & Tradisional'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Operational Metrics Subbar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-white/15 text-xs">
            <div className="animate-glass-card stagger-1 p-3 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/15 transition-all">
              <span className="text-slate-300 font-semibold block">Tiket Dapur Aktif</span>
              <strong className="text-2xl font-black text-white mt-0.5 block">
                <SmoothNumber value={tickets.filter(t => t.status !== 'SERVED').length} format="number" suffix=" Tiket" />
              </strong>
              <span className="text-[10px] text-amber-300">Prioritas memasak</span>
            </div>

            <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15">
              <span className="text-slate-300 font-semibold block">Resto Terpilih</span>
              <strong className="text-lg font-black text-white mt-1 block truncate">
                {isSteakResto ? 'Tropical Steak House' : 'Tropical Garden Resto'}
              </strong>
              <span className="text-[10px] text-emerald-300">Pemisahan Alur 100% Terisolasi</span>
            </div>

            <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15">
              <span className="text-slate-300 font-semibold block">Target Waktu Saji</span>
              <strong className="text-2xl font-black text-emerald-300 mt-0.5 block">&lt; 15 Menit</strong>
              <span className="text-[10px] text-slate-300">SOP Standar Resto</span>
            </div>

            <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15">
              <span className="text-slate-300 font-semibold block">Auto-Sync Realtime</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <strong className="text-xs font-black text-white">Live 6 Detik</strong>
              </div>
              <span className="text-[10px] text-emerald-200/80">Koneksi KDS Aktif</span>
            </div>
          </div>
        </div>

        {/* Station Navigation & Operational Control Toolbar */}
        <div data-spot="toolbar" className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
          {/* Tier 1: Station Selector Tabs */}
          <div className="px-4 py-3 bg-slate-50/90 border-b border-slate-200/90 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mr-1">
                <ChefHat className="w-3.5 h-3.5 text-slate-400" />
                Stasiun Masak:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {stations.map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelectedStation(st.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs whitespace-nowrap ${
                      selectedStation === st.id
                        ? isSteakResto
                          ? 'bg-amber-600 text-white shadow-amber-600/30 ring-2 ring-amber-500/30'
                          : 'bg-emerald-700 text-white shadow-emerald-700/30 ring-2 ring-emerald-500/30'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <span>{st.icon}</span>
                    <span>{st.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] font-semibold text-slate-500 hidden xl:flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Tiket aktif otomatis tersinkronisasi</span>
            </div>
          </div>

          {/* Tier 2: Kitchen Control & Quick Action Tools */}
          <div className="p-3.5 flex flex-wrap items-center justify-between gap-3">
            {/* Left Tools: Search & History Recall */}
            <div className="flex items-center gap-2.5 flex-1 min-w-[280px] max-w-lg">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nomor order, meja, atau nama tamu..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
                />
              </div>

              <Button
                variant={showHistory ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="text-xs font-bold whitespace-nowrap shrink-0 px-3 py-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                {showHistory ? 'Tutup Riwayat' : 'Riwayat Tiket Selesai'}
              </Button>
            </div>

            {/* Right Tools: Navigation Links, Audio & Hardware Printer Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/pos/tables')}
                className="text-xs font-bold whitespace-nowrap px-3 py-1.5 shrink-0"
              >
                Denah Meja
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/pos/cashier')}
                className="text-xs font-bold whitespace-nowrap px-3 py-1.5 shrink-0 bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100"
              >
                Kasir POS
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => playKitchenChime()}
                title="Uji Bunyi Bell Dapur (Chime)"
                className="text-xs font-bold whitespace-nowrap px-3 py-1.5 shrink-0 text-amber-700 hover:text-amber-800 hover:bg-amber-50 border-amber-300"
              >
                <Bell className="w-3.5 h-3.5 mr-1 text-amber-600 shrink-0" />
                Tes Bell
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={toggleAutoPrintKDS}
                title="Cetak otomatis tiket fisik ke printer dapur setiap ada pesanan baru masuk"
                className={`text-xs font-bold whitespace-nowrap px-3 py-1.5 shrink-0 ${
                  autoPrintKDS
                    ? 'bg-amber-500/20 text-amber-900 border-amber-400 hover:bg-amber-500/30 ring-1 ring-amber-400'
                    : 'text-slate-600 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <Printer className={`w-3.5 h-3.5 mr-1.5 shrink-0 ${autoPrintKDS ? 'text-amber-700' : 'text-slate-400'}`} />
                <span>Auto-Print:</span>
                <span className={`ml-1 font-black px-1.5 py-0.5 rounded text-[10px] ${autoPrintKDS ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {autoPrintKDS ? 'ON' : 'OFF'}
                </span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
                className="text-xs font-bold px-2.5 py-1.5 shrink-0"
                title="Muat Ulang Tiket KDS"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* Empty State */}
        {filteredTickets.length === 0 && !isLoading && (
          <div className="p-12 text-center rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-2xl">
              🍳
            </div>
            <h3 className="text-base font-black text-slate-900">
              Tidak Ada Tiket Pesanan Aktif di Stasiun Ini
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Semua pesanan di {isSteakResto ? 'Tropical Steak House' : 'Tropical Garden Resto'} sudah selesai disajikan atau belum ada pesanan baru dari kasir POS.
            </p>
          </div>
        )}

        {/* Kitchen Ticket Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTickets.map(ticket => {
            // Elapsed time calculation
            const createdTime = new Date(ticket.created_at).getTime();
            const elapsedMinutes = Math.max(0, Math.floor((currentTime - createdTime) / 60000));
            const elapsedSeconds = Math.max(0, Math.floor(((currentTime - createdTime) % 60000) / 1000));
            const timeString = formatCookTime(elapsedMinutes, elapsedSeconds);

            // Urgency color coding
            const isCritical = elapsedMinutes >= 15;
            const isWarning = elapsedMinutes >= 8 && elapsedMinutes < 15;

            return (
              <div
                key={ticket.id}
                data-spot="card"
                className={`rounded-3xl p-5 border-2 shadow-lg flex flex-col justify-between transition-all duration-200 ${
                  ticket.status === 'SERVED'
                    ? 'bg-slate-900/90 border-slate-700 opacity-80'
                    : isCritical
                    ? 'bg-slate-950 border-rose-500 ring-2 ring-rose-500/50'
                    : isWarning
                    ? 'bg-slate-950 border-amber-400'
                    : 'bg-slate-950 border-slate-700'
                }`}
              >
                <div>
                  {/* Ticket Header */}
                  <div className="pb-3 border-b border-slate-800 space-y-2">
                    {/* Top Row: Order Number, Outlet, Cetak & Timer */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                          {ticket.order_number}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60 whitespace-nowrap">
                          {ticket.outlet_code}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          title="Cetak Bon Masak Dapur (Thermal 80mm/58mm)"
                          onClick={(e) => {
                            e.stopPropagation();
                            printKitchenTicket(ticket, {
                              paperWidth: '80mm',
                              stationFilter: selectedStation,
                            });
                          }}
                          className="p-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border border-slate-700 transition flex items-center gap-1 text-[10px] font-bold shadow-2xs whitespace-nowrap"
                        >
                          <Printer className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Cetak</span>
                        </button>

                        <div
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-mono font-black border shadow-xs whitespace-nowrap ${
                            isCritical
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500 animate-pulse'
                              : isWarning
                              ? 'bg-amber-500/20 text-amber-300 border-amber-400'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-400'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>{timeString}</span>
                        </div>
                      </div>
                    </div>

                    {/* Second Row: Table Number, Guest Name & Order Time */}
                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-1.5">
                          {ticket.table_number ? (
                            <span className="text-emerald-400">Meja {ticket.table_number}</span>
                          ) : (
                            <span className="text-amber-400">Bungkus (Takeaway)</span>
                          )}
                        </h3>
                        <p className="text-xs text-slate-400 font-semibold flex items-center gap-1.5 mt-0.5">
                          <span className="text-slate-200">{ticket.customer_name}</span>
                          <span>•</span>
                          <span className="text-slate-400">{ticket.pax_count} Tamu</span>
                        </p>
                      </div>

                      <span className="text-[11px] text-slate-500 font-mono shrink-0">
                        {new Date(ticket.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="py-3 space-y-2.5">
                    {ticket.items.map(item => {
                      const isReady = item.status === 'READY';
                      const isCooking = item.status === 'COOKING';
                      const isServed = item.status === 'SERVED';

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleCycleItemStatus(ticket.id, item)}
                          className={`p-3 rounded-2xl border transition cursor-pointer select-none ${
                            isReady || isServed
                              ? 'bg-emerald-950/40 border-emerald-600/60 opacity-90'
                              : isCooking
                              ? 'bg-amber-950/40 border-amber-500/60'
                              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5">
                              {/* Quantity Badge */}
                              <span
                                className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                                  isReady || isServed
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-amber-500 text-slate-950'
                                }`}
                              >
                                {item.quantity}x
                              </span>

                              <div>
                                <h4
                                  className={`text-sm font-bold leading-tight ${
                                    isReady || isServed
                                      ? 'text-emerald-200 line-through'
                                      : 'text-white'
                                  }`}
                                >
                                  {item.item_name}
                                </h4>

                                {/* Cooking Modifiers & Notes */}
                                {item.notes && (() => {
                                  const doneness = parseDonenessBadge(item.notes);
                                  return (
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                      {doneness && (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 border border-amber-400 shadow-2xs">
                                          🔥 {doneness}
                                        </span>
                                      )}
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-200 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-500/30">
                                        <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                                        <span>{item.notes}</span>
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Item Status Indicator */}
                            <span
                              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border shrink-0 ${
                                isReady
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400'
                                  : isCooking
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-400'
                                  : isServed
                                  ? 'bg-blue-500/20 text-blue-300 border-blue-400'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              {item.status === 'ORDERED' && 'Antre'}
                              {item.status === 'COOKING' && 'Dimasak'}
                              {item.status === 'READY' && 'Siap Saji'}
                              {item.status === 'SERVED' && 'Diantar'}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {ticket.items.length === 0 && (
                      <p className="text-xs text-slate-500 italic py-2 text-center">
                        Tidak ada item pesanan khusus untuk stasiun ini.
                      </p>
                    )}
                  </div>
                </div>

                {/* Ticket Actions */}
                <div className="pt-3 border-t border-slate-800 mt-2 space-y-2">
                  {ticket.status === 'SERVED' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={actionLoadingId === ticket.id}
                      onClick={() => handleRecallOrder(ticket.id)}
                      className="w-full text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border-slate-600 py-2.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1 text-amber-400" />
                      Panggil Balik Tiket (Undo Recall)
                    </Button>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        loading={actionLoadingId === ticket.id}
                        onClick={() => handleMarkTicketReady(ticket.id)}
                        className="text-xs font-black bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/50 py-2.5"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Semua Siap
                      </Button>

                      <Button
                        size="sm"
                        loading={actionLoadingId === ticket.id}
                        onClick={() => handleMarkTicketServed(ticket.id)}
                        className="text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 shadow-md shadow-emerald-600/30"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Selesai Antar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PageTransition>
  );
};
