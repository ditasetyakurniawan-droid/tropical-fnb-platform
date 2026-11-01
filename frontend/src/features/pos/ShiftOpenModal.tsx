import React, { useState } from 'react';
import { NumberInput } from '@/shared/ui/NumberInput';
import { formatIDR } from '@/shared/utils/currency';
import type { ShiftName, OpenShiftPayload } from './types';
import type { Outlet } from '@/features/auth/types';

interface ShiftOpenModalProps {
  isOpen: boolean;
  outletId: string;
  outletName: string;
  accessibleOutlets?: Outlet[];
  defaultOpeningCash?: number;
  onClose: () => void;
  onSuccess: (payload: OpenShiftPayload) => Promise<void>;
}

export const ShiftOpenModal: React.FC<ShiftOpenModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <ShiftOpenModalContent key={props.outletId} {...props} />;
};

const ShiftOpenModalContent: React.FC<ShiftOpenModalProps> = ({
  outletId,
  outletName,
  accessibleOutlets,
  defaultOpeningCash = 250000,
  onClose,
  onSuccess,
}) => {
  const [selectedOutletId, setSelectedOutletId] = useState<string>(() => {
    if (outletId && outletId !== 'ALL') return outletId;
    if (accessibleOutlets && accessibleOutlets.length > 0) {
      return accessibleOutlets.find(o => o.code === 'TSH-01')?.id || accessibleOutlets[0]?.id || '';
    }
    return '';
  });
  const [shiftName, setShiftName] = useState<ShiftName>('SHIFT_PAGI');
  const [openingCash, setOpeningCash] = useState<number>(defaultOpeningCash);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const presets = [100000, 200000, 250000, 300000, 500000];

  const currentOutletDisplayName = 
    accessibleOutlets?.find(o => o.id === selectedOutletId)?.name || outletName || 'Tropical F&B';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOutletId || selectedOutletId === 'ALL') {
      setErrorMsg('Harap pilih salah satu cabang restoran untuk membuka shift kasir');
      return;
    }
    if (openingCash < 0) {
      setErrorMsg('Modal awal tidak boleh bernilai negatif');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSuccess({
        outlet_id: selectedOutletId,
        shift_name: shiftName,
        opening_cash: openingCash,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuka shift kasir');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 bg-emerald-600 text-white flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>🔓</span> Buka Shift Kasir Baru
            </h2>
            <p className="text-xs text-emerald-100 font-medium mt-0.5">{currentOutletDisplayName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-emerald-100 hover:text-white text-xl font-bold p-1 rounded-md"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-300 font-medium">
              ⚠️ {errorMsg}
            </div>
          )}

          {accessibleOutlets && accessibleOutlets.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                Cabang / Outlet Kasir
              </label>
              <select
                value={selectedOutletId}
                onChange={(e) => setSelectedOutletId(e.target.value)}
                className="w-full text-xs font-bold p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
              >
                {accessibleOutlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              Pilihan Shift Kerja
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'SHIFT_PAGI', label: 'Shift Pagi', time: '06:30 - 14:00' },
                  { id: 'SHIFT_SORE', label: 'Shift Sore', time: '14:00 - 21:30' },
                  { id: 'SHIFT_FULL', label: 'Full Day', time: '06:30 - 21:30' },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setShiftName(s.id)}
                  className={`py-2 px-2.5 rounded-lg border text-center transition-all ${
                    shiftName === s.id
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold ring-2 ring-emerald-500/30'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  <div className="text-xs">{s.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{s.time}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              Modal Uang Kembalian Awal Laci
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-sm font-bold text-gray-400">
                Rp
              </span>
              <NumberInput
                min={0}
                allowDecimal={false}
                value={openingCash}
                onChange={setOpeningCash}
                aria-label="Modal Uang Kembalian Awal Laci"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg text-base font-bold text-gray-800 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                placeholder="250000"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {presets.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setOpeningCash(amt)}
                  className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                    openingCash === amt
                      ? 'bg-emerald-600 text-white border-emerald-600 font-semibold'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {formatIDR(amt)}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
              * Uang pecahan kecil untuk kembalian pelanggan saat awal shift.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              Catatan Pembukaan (Opsional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-800 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              placeholder="Contoh: Uang kembalian pecahan 5rb (20 lbr) dan 2rb (50 lbr)..."
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Membuka Shift...</span>
              ) : (
                <>
                  <span>🔓</span>
                  <span>Buka Shift Sekarang</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
