import React from 'react';
import { formatIDR } from '@/shared/utils/currency';
import type { CashierShift } from './types';
import type { Outlet } from '@/features/auth/types';

interface ShiftStatusWidgetProps {
  shift: CashierShift | null;
  isOpen: boolean;
  isLoading: boolean;
  activeOutletId?: string;
  accessibleOutlets?: Outlet[];
  onSelectOutlet?: (outletId: string) => void;
  onOpenShiftClick: () => void;
  onCloseShiftClick: () => void;
  onCashMovementClick: () => void;
  onXReportClick: () => void;
}

export const ShiftStatusWidget: React.FC<ShiftStatusWidgetProps> = ({
  shift,
  isOpen,
  isLoading,
  activeOutletId,
  accessibleOutlets,
  onSelectOutlet,
  onOpenShiftClick,
  onCloseShiftClick,
  onCashMovementClick,
  onXReportClick,
}) => {
  if (isLoading) {
    return (
      <div className="bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl h-14 flex items-center px-4 border border-gray-200 dark:border-gray-700">
        <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/3"></div>
      </div>
    );
  }

  if (activeOutletId === 'ALL') {
    return (
      <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🏢</span>
          <div>
            <div className="text-xs font-bold text-blue-900 dark:text-blue-200 uppercase tracking-wide">
              Mode Konsolidasi Semua Resto Aktif
            </div>
            <div className="text-[11px] text-blue-700 dark:text-blue-300">
              Laci kasir fisik terikat pada cabang tertentu. Pilih cabang restoran untuk mengoperasikan kasir dan laci uang:
            </div>
          </div>
        </div>
        {accessibleOutlets && accessibleOutlets.length > 0 && onSelectOutlet ? (
          <div className="flex items-center gap-2">
            {accessibleOutlets.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onSelectOutlet(o.id)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              >
                <span>Buka Kasir {o.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenShiftClick}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm"
          >
            <span>🔓 Buka Shift Kasir</span>
          </button>
        )}
      </div>
    );
  }

  if (!isOpen || !shift) {
    return (
      <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">⚠️</span>
          <div>
            <div className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wide">
              Shift Kasir Belum Dibuka
            </div>
            <div className="text-[11px] text-amber-700 dark:text-amber-300">
              Laci kasir belum aktif. Buka shift kasir dan masukkan modal awal (float) untuk memulai transaksi kasir.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenShiftClick}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
        >
          <span>🔓</span>
          <span>Buka Shift Kasir Baru</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
      {/* Left: Shift Meta & Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-md text-xs font-black tracking-wide border border-emerald-300 dark:border-emerald-800">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>{shift.shift_name.replace('_', ' ')}</span>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-900 dark:text-white">
              {shift.shift_number}
            </span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              • Kasir: <strong className="text-gray-700 dark:text-gray-300">{shift.cashier_name || 'Kasir'}</strong>
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            <span>
              Modal: <strong className="text-gray-700 dark:text-gray-200">{formatIDR(shift.opening_cash)}</strong>
            </span>
            <span>•</span>
            <span>
              Kas Laci: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{formatIDR(shift.expected_cash)}</strong>
            </span>
            <span>•</span>
            <span>
              Trx: <strong className="text-gray-700 dark:text-gray-200">{shift.total_transactions} Bill</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Right: Operational Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onXReportClick}
          className="px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
          title="Audit penjualan & laci uang berjalan tanpa menutup shift"
        >
          <span>👁️</span>
          <span>Audit X-Report</span>
        </button>

        <button
          type="button"
          onClick={onCashMovementClick}
          className="px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
          title="Catat pengeluaran belanja darurat atau penambahan kas kecil"
        >
          <span>💸</span>
          <span>Kas Masuk / Keluar</span>
        </button>

        <button
          type="button"
          onClick={onCloseShiftClick}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
          title="Tutup shift, hitung fisik uang kas laci dan cetak Z-Report"
        >
          <span>🔒</span>
          <span>Tutup Shift (Z-Report)</span>
        </button>
      </div>
    </div>
  );
};
