import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  Users,
  Search,
  RefreshCw,
  Clock,
  Layers,
  ArrowRight,
  CheckCircle2,
  Trash2,
  Printer,
  ChefHat,
  AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth-store';
import { PageTransition } from '@/shared/components/transitions/PageTransition';
import { Button } from '@/shared/ui/Button';
import { SmoothNumber } from '@/shared/ui/SmoothNumber';
import { formatIDR } from '@/shared/utils/currency';
import {
  FloorPlanIcon,
  GazeboIcon,
  SteakHouseIcon,
  DiningTableIcon,
  SplitBillIcon,
} from '@/shared/components/icons/EnterpriseIcons';
import type { DiningTable, Order, TableStatus } from './types';
import { fetchTables, updateTableStatus, fetchOrderDetail } from './pos-api';
import { SplitBillModal } from './SplitBillModal';
import { ReceiptModal } from './ReceiptModal';

export const TableFloorPlanPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeOutletId, accessibleOutlets, isGlobalAllOutlets } = useAuthStore();

  const currentOutlet = accessibleOutlets.find(o => o.id === activeOutletId);
  const isSteakOutlet = currentOutlet?.code === 'TSH-01' || (!currentOutlet && activeOutletId.includes('TSH'));
  const isGardenOutlet = currentOutlet?.code === 'TGR-01' || (!currentOutlet && activeOutletId.includes('TGR'));
  const isConsolidated = isGlobalAllOutlets && activeOutletId === 'ALL';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Selected Order for Split Bill Modal
  const [activeSplitOrder, setActiveSplitOrder] = useState<Order | null>(null);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  // Receipt Modal State
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  const {
    data: tables = [],
    isLoading,
    isError,
    error,
    refetch: loadTables,
  } = useQuery({
    queryKey: ['dining-tables', activeOutletId],
    queryFn: () => fetchTables(activeOutletId || undefined),
  });

  // Clean dirty table action
  const handleMarkClean = async (tableId: string) => {
    setIsActionLoading(tableId);
    try {
      await updateTableStatus(tableId, 'AVAILABLE');
      await loadTables();
    } catch (err) {
      console.error('Failed to clean table:', err);
    } finally {
      setIsActionLoading(null);
    }
  };

  // Open split bill or order detail
  const handleOpenBill = async (table: DiningTable) => {
    if (!table.active_order_id) return;
    setIsActionLoading(table.id);
    try {
      const ord = await fetchOrderDetail(table.active_order_id);
      setActiveSplitOrder(ord);
      setIsSplitModalOpen(true);
    } catch (err) {
      console.error('Failed to load order for split:', err);
    } finally {
      setIsActionLoading(null);
    }
  };

  // Open pro-forma bill receipt
  const handlePrintProForma = async (table: DiningTable) => {
    if (!table.active_order_id) return;
    setIsActionLoading(table.id);
    try {
      const ord = await fetchOrderDetail(table.active_order_id);
      setReceiptOrder(ord);
      setIsReceiptOpen(true);
    } catch (err) {
      console.error('Failed to load order for receipt:', err);
    } finally {
      setIsActionLoading(null);
    }
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const total = tables.length;
    const available = tables.filter(t => t.status === 'AVAILABLE').length;
    const occupied = tables.filter(t => t.status === 'OCCUPIED').length;
    const reserved = tables.filter(t => t.status === 'RESERVED').length;
    const dirty = tables.filter(t => t.status === 'DIRTY').length;
    return { total, available, occupied, reserved, dirty };
  }, [tables]);

  // Filtered tables
  const availableSections = useMemo(() => {
    return Array.from(new Set(tables.map(t => t.section)));
  }, [tables]);

  const filteredTables = useMemo(() => {
    return tables.filter(t => {
      const matchesSearch =
        t.table_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.active_customer_name && t.active_customer_name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesSection = selectedSection === 'ALL' || t.section === selectedSection;
      const matchesStatus = selectedStatus === 'ALL' || t.status === selectedStatus;
      return matchesSearch && matchesSection && matchesStatus;
    });
  }, [tables, searchQuery, selectedSection, selectedStatus]);

  const getStatusBadge = (status: TableStatus) => {
    switch (status) {
      case 'AVAILABLE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-950 border border-emerald-300 shadow-2xs whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            Tersedia
          </span>
        );
      case 'OCCUPIED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500 text-white shadow-xs whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            Terisi
          </span>
        );
      case 'RESERVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-700 text-white shadow-xs whitespace-nowrap">
            <Clock className="w-3 h-3 text-purple-200" />
            Reservasi
          </span>
        );
      case 'DIRTY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white shadow-xs whitespace-nowrap">
            <Trash2 className="w-3 h-3 text-rose-200" />
            Perlu Bersih
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 whitespace-nowrap">
            {status}
          </span>
        );
    }
  };

  const bannerBadge = isSteakOutlet
    ? 'Denah Meja • Tropical Steak House'
    : isGardenOutlet
      ? 'Denah Meja & Gazebo • Tropical Garden Resto'
      : 'Sistem Denah Meja & Gazebo Dual-Resto';

  const bannerTitle = isSteakOutlet
    ? 'Denah Meja Indoor & VIP Room'
    : isGardenOutlet
      ? 'Denah Gazebo Lesehan & Aula Joglo'
      : 'Denah Meja Indoor & Gazebo Outdoor';

  const bannerSubtitle = isSteakOutlet
    ? 'Manajemen visual live status: Meja Dining Room Indoor AC & VIP Lounge Tropical Steak House Manding.'
    : isGardenOutlet
      ? 'Manajemen visual live status: Gazebo Lesehan Outdoor & Aula Joglo Utama Tropical Garden Resto Temanggung.'
      : 'Manajemen visual live status: Meja Indoor Steak House Manding vs Gazebo Lesehan & Aula Joglo Tropical Garden Resto Temanggung.';

  return (
    <PageTransition>
      <div className="tropical-glass space-y-6 max-w-7xl mx-auto pb-12">
        {/* Tropical Header Banner */}
        <div data-spot="hero" className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-950 via-teal-900 to-amber-950 text-white p-6 sm:p-8 shadow-xl border border-emerald-800/40">
          <div className="absolute -top-12 -right-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-400/30 text-emerald-300 text-xs font-semibold tracking-wide uppercase">
                <FloorPlanIcon className="w-4 h-4 text-emerald-400 animate-tropical-breeze" />
                {bannerBadge}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                {bannerTitle}
              </h1>
              <p className="text-sm text-emerald-100/90 max-w-2xl leading-relaxed">
                {bannerSubtitle}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadTables()}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md font-bold"
              >
                <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
                Muat Ulang
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate('/pos/kds')}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md font-bold flex items-center gap-1.5"
              >
                <ChefHat className="w-4 h-4 text-emerald-300" />
                Layar Dapur (KDS)
              </Button>
              <Button
                size="sm"
                onClick={() => navigate('/pos/cashier')}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/30"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                Buka Layar Kasir POS
              </Button>
            </div>
          </div>

          {/* 4 KPI Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-white/15">
            <div data-spot="stat" className="animate-glass-card stagger-1 p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/15 transition-all">
              <div className="text-xs text-emerald-200 font-semibold">Tersedia (Ready)</div>
              <div className="text-2xl font-black text-white mt-1">
                <SmoothNumber value={stats.available} format="number" />
              </div>
              <div className="text-[11px] text-emerald-200/80 font-medium">Siap menerima tamu</div>
            </div>
            <div data-spot="stat" className="animate-glass-card stagger-2 p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/15 transition-all">
              <div className="text-xs text-amber-200 font-semibold">Terisi (Dine-In)</div>
              <div className="text-2xl font-black text-amber-300 mt-1">
                <SmoothNumber value={stats.occupied} format="number" />
              </div>
              <div className="text-[11px] text-amber-200/80 font-medium">Sedang bersantap</div>
            </div>
            <div data-spot="stat" className="animate-glass-card stagger-3 p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/15 transition-all">
              <div className="text-xs text-purple-200 font-semibold">Reservasi Event</div>
              <div className="text-2xl font-black text-purple-300 mt-1">
                <SmoothNumber value={stats.reserved} format="number" />
              </div>
              <div className="text-[11px] text-purple-200/80 font-medium">Gathering &amp; Dinner</div>
            </div>
            <div data-spot="stat" className="animate-glass-card stagger-4 p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/15 transition-all">
              <div className="text-xs text-rose-200 font-semibold">Perlu Dibersihkan</div>
              <div className="text-2xl font-black text-rose-300 mt-1">
                <SmoothNumber value={stats.dirty} format="number" />
              </div>
              <div className="text-[11px] text-rose-200/80 font-medium">Meja kotor selesai makan</div>
            </div>
          </div>
        </div>

        {/* Unified Filter Controls */}
        <div data-spot="toolbar" className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* Section Selector */}
          <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
            <button
              onClick={() => setSelectedSection('ALL')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                selectedSection === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Semua Area ({tables.length})
            </button>
            {(isConsolidated || isSteakOutlet || availableSections.includes('INDOOR_MAIN')) && (
              <button
                onClick={() => setSelectedSection('INDOOR_MAIN')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                  selectedSection === 'INDOOR_MAIN'
                    ? 'bg-amber-600 text-white'
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                }`}
              >
                <SteakHouseIcon className="w-3.5 h-3.5 text-amber-500" />
                Steak House Indoor
              </button>
            )}
            {(isConsolidated || isGardenOutlet || availableSections.includes('OUTDOOR_GAZEBO')) && (
              <button
                onClick={() => setSelectedSection('OUTDOOR_GAZEBO')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                  selectedSection === 'OUTDOOR_GAZEBO'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                }`}
              >
                <GazeboIcon className="w-3.5 h-3.5 text-emerald-500" />
                Gazebo Manding
              </button>
            )}
            {(isConsolidated || isGardenOutlet || availableSections.includes('OUTDOOR_JOGLO')) && (
              <button
                onClick={() => setSelectedSection('OUTDOOR_JOGLO')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                  selectedSection === 'OUTDOOR_JOGLO'
                    ? 'bg-purple-700 text-white'
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-purple-500" />
                Aula Joglo Utama (Event)
              </button>
            )}
          </div>

          {/* Search Bar */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Cari meja atau nama tamu..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
            />
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-700 font-bold whitespace-nowrap">Filter Status:</span>
          {['ALL', 'AVAILABLE', 'OCCUPIED', 'RESERVED', 'DIRTY'].map(st => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={`px-3.5 py-1.5 rounded-full font-bold transition whitespace-nowrap shadow-2xs ${
                selectedStatus === st
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-800 hover:bg-slate-100 border border-slate-300'
              }`}
            >
              {st === 'ALL' && 'Semua Status'}
              {st === 'AVAILABLE' && `🟢 Tersedia (${stats.available})`}
              {st === 'OCCUPIED' && `🟠 Terisi (${stats.occupied})`}
              {st === 'RESERVED' && `🟣 Reservasi (${stats.reserved})`}
              {st === 'DIRTY' && `🔴 Kotor (${stats.dirty})`}
            </button>
          ))}
        </div>

        {/* Table / Gazebo Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredTables.map(t => {
            const isGazebo = t.shape === 'GAZEBO_OCTAGON' || t.section.includes('GAZEBO');
            const isJoglo = t.section === 'OUTDOOR_JOGLO';

            return (
              <div
                key={t.id}
                data-spot="card"
                className={`relative rounded-3xl p-5 border-2 transition-all duration-200 shadow-sm flex flex-col justify-between ${
                  t.status === 'AVAILABLE'
                    ? 'bg-white border-emerald-300 hover:border-emerald-500 hover:shadow-lg'
                    : t.status === 'OCCUPIED'
                    ? 'bg-amber-50/80 border-amber-400 shadow-md'
                    : t.status === 'RESERVED'
                    ? 'bg-purple-50/80 border-purple-400 shadow-md'
                    : 'bg-rose-50/80 border-rose-300 shadow-md'
                }`}
              >
                {/* Header: Table Number & Status with Strict Non-Wrapping Layout */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center shadow-xs border ${
                          isGazebo
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : isJoglo
                            ? 'bg-purple-100 text-purple-800 border-purple-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}
                      >
                        {isGazebo ? (
                          <GazeboIcon className="w-5 h-5" />
                        ) : isJoglo ? (
                          <Users className="w-4 h-4" />
                        ) : (
                          <DiningTableIcon className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-black text-slate-950 tracking-tight whitespace-nowrap">
                          {t.table_number}
                        </h3>
                        <p className="text-[11px] text-slate-600 font-bold flex items-center gap-1 whitespace-nowrap">
                          <span className="text-slate-800">
                            {isGazebo ? 'Gazebo' : isJoglo ? 'Aula' : 'Indoor'}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-emerald-700 font-black">{t.capacity} Tamu</span>
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {getStatusBadge(t.status)}
                    </div>
                  </div>

                  {/* Occupied / Active Order Details */}
                  {t.status === 'OCCUPIED' && t.active_order_id && (
                    <div className="p-3.5 rounded-2xl bg-slate-900 text-white shadow-md space-y-2 my-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-semibold">Tamu:</span>
                        <strong className="text-white font-bold truncate max-w-[140px]">
                          {t.active_customer_name || 'Pelanggan Dine-in'}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-semibold">Order:</span>
                        <span className="font-mono text-emerald-300 font-bold">
                          {t.active_order_number}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                        <span className="font-bold text-slate-200">Total Tagihan:</span>
                        <span className="font-mono font-black text-amber-400 text-sm">
                          {formatIDR(t.active_order_total || 0)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Available Information Panel (Eliminates Awkward Empty Whitespace) */}
                  {t.status === 'AVAILABLE' && (
                    <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/90 text-xs my-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                          Meja Bersih &amp; Siap
                        </span>
                        <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-2 py-0.5 rounded-md">
                          Maks. {t.capacity} Tamu
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1.5 border-t border-emerald-200/70">
                        <span>Area Layanan:</span>
                        <strong className="text-slate-800 font-bold">
                          {isGazebo ? 'Gazebo Lesehan Manding' : isJoglo ? 'Aula Joglo Utama' : 'Indoor AC Steak House'}
                        </strong>
                      </div>
                    </div>
                  )}

                  {/* Reserved Note Panel */}
                  {t.status === 'RESERVED' && (
                    <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-300 text-xs text-purple-950 my-3 space-y-1.5">
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-purple-600" />
                          Terkunci untuk Reservasi
                        </span>
                        <span className="text-[11px] font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded-md">
                          Event Mendatang
                        </span>
                      </div>
                      <p className="text-[11px] text-purple-800">
                        Meja diblokir untuk booking gathering/event. Cek menu Reservasi untuk detail DP.
                      </p>
                    </div>
                  )}

                  {/* Dirty Note Panel */}
                  {t.status === 'DIRTY' && (
                    <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-xs text-rose-950 my-3 space-y-1.5">
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5">
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          Menunggu Pembersihan
                        </span>
                        <span className="text-[11px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-md">
                          Prioritas Runner
                        </span>
                      </div>
                      <p className="text-[11px] text-rose-800">
                        Tamu selesai makan. Mohon staf bersihkan meja dan perbarui status ke Tersedia.
                      </p>
                    </div>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className="pt-3 border-t border-slate-200/80">
                  {t.status === 'AVAILABLE' && (
                    <div className="grid grid-cols-5 gap-2">
                      <Button
                        size="sm"
                        onClick={() => navigate(`/pos/cashier?table_id=${t.id}`)}
                        className="col-span-3 text-xs font-black bg-brand-600 hover:bg-brand-700 text-white shadow-md shadow-brand-600/20 py-2.5"
                      >
                        Buka Kasir
                        <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/pos/reservations?table_number=${t.table_number}`)}
                        className="col-span-2 text-xs font-bold bg-white hover:bg-purple-50 text-purple-950 border-slate-300 py-2.5"
                      >
                        Reservasi
                      </Button>
                    </div>
                  )}

                  {t.status === 'OCCUPIED' && (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          loading={isActionLoading === t.id}
                          onClick={() => handleOpenBill(t)}
                          className="text-xs font-bold bg-white hover:bg-amber-100 text-amber-950 border-2 border-amber-400 shadow-2xs py-2"
                        >
                          <SplitBillIcon className="w-3.5 h-3.5 mr-1 text-amber-600" />
                          Split Bill
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => navigate(`/pos/cashier?table_id=${t.id}`)}
                          className="text-xs font-black bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 py-2"
                        >
                          Kasir / Bayar
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-0.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/pos/cashier?table_id=${t.id}`)}
                          className="text-[11px] font-bold text-slate-700 hover:text-emerald-800 hover:bg-emerald-50 py-1"
                        >
                          + Tambah Menu
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={isActionLoading === t.id}
                          onClick={() => void handlePrintProForma(t)}
                          className="text-[11px] font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 py-1 flex items-center justify-center gap-1"
                        >
                          <Printer className="w-3 h-3 text-slate-500" />
                          Cetak Bill
                        </Button>
                      </div>
                    </div>
                  )}

                  {t.status === 'DIRTY' && (
                    <Button
                      size="sm"
                      loading={isActionLoading === t.id}
                      onClick={() => handleMarkClean(t.id)}
                      className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 py-2.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      Tandai Meja Bersih &amp; Siap
                    </Button>
                  )}

                  {t.status === 'RESERVED' && (
                    <Button
                      size="sm"
                      onClick={() => navigate('/pos/reservations')}
                      className="w-full text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white shadow-md shadow-purple-700/20 py-2.5"
                    >
                      Lihat Detail Reservasi
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Error State Banner */}
        {isError && (
          <div className="p-8 text-center rounded-3xl bg-rose-50 border-2 border-rose-200 text-rose-800 space-y-3 shadow-xs">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-rose-900">Gagal Mengambil Data Meja &amp; Gazebo</h3>
            <p className="text-xs text-rose-600 max-w-md mx-auto">
              {error instanceof Error ? error.message : 'Terjadi kendala saat menyinkronkan status meja dari server. Sesi login Anda mungkin telah berakhir.'}
            </p>
            <Button
              size="sm"
              onClick={() => void loadTables()}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md shadow-rose-600/20"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Coba Muat Ulang
            </Button>
          </div>
        )}

        {/* Zero Results */}
        {filteredTables.length === 0 && !isLoading && !isError && (
          <div className="p-12 text-center rounded-3xl bg-white border-2 border-dashed border-slate-300 text-slate-600 space-y-3">
            <DiningTableIcon className="w-10 h-10 mx-auto text-slate-400" />
            <h3 className="font-bold text-base text-slate-800">Tidak ada meja atau gazebo yang sesuai filter.</h3>
            <p className="text-xs text-slate-500">Coba ubah kata kunci pencarian atau ganti filter area.</p>
          </div>
        )}

        {/* Split Bill Modal */}
        {activeSplitOrder && (
          <SplitBillModal
            order={activeSplitOrder}
            isOpen={isSplitModalOpen}
            onClose={() => setIsSplitModalOpen(false)}
            onOrderUpdated={async () => {
              await loadTables();
            }}
          />
        )}

        {/* Thermal Receipt Modal (Pro-Forma Bill) */}
        {receiptOrder && (
          <ReceiptModal
            order={receiptOrder}
            isOpen={isReceiptOpen}
            onClose={() => setIsReceiptOpen(false)}
            isProForma={receiptOrder.payment_status !== 'PAID'}
          />
        )}
      </div>
    </PageTransition>
  );
};
