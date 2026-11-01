import React, { useState } from 'react';
import { NumberInput } from '@/shared/ui/NumberInput';
import { formatIDR } from '@/shared/utils/currency';
import type { CashierShift, CloseShiftPayload } from './types';

interface ShiftCloseModalProps {
  isOpen: boolean;
  shift: CashierShift;
  onClose: () => void;
  onConfirmClose: (payload: CloseShiftPayload) => Promise<void>;
}

export const ShiftCloseModal: React.FC<ShiftCloseModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <ShiftCloseModalContent key={`${props.shift.id}-${props.shift.expected_cash}`} {...props} />;
};

const ShiftCloseModalContent: React.FC<ShiftCloseModalProps> = ({
  shift,
  onClose,
  onConfirmClose,
}) => {
  const [actualCash, setActualCash] = useState<number>(shift.expected_cash || 0);
  const [supervisorPin, setSupervisorPin] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Denominations breakdown helper
  const [useBreakdown, setUseBreakdown] = useState<boolean>(false);
  const [denomCounts, setDenomCounts] = useState<{ [denom: number]: number }>({
    100000: 0,
    50000: 0,
    20000: 0,
    10000: 0,
    5000: 0,
    2000: 0,
    1000: 0,
    500: 0,
  });

  const expectedCash = shift.expected_cash;
  const difference = actualCash - expectedCash;

  const handleDenomChange = (denom: number, count: number) => {
    const updated = { ...denomCounts, [denom]: Math.max(0, count) };
    setDenomCounts(updated);
    const total = Object.entries(updated).reduce((acc, [d, c]) => acc + Number(d) * c, 0);
    setActualCash(total);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actualCash < 0) {
      setErrorMsg('Hitungan fisik kas tidak boleh bernilai negatif');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onConfirmClose({
        actual_cash: actualCash,
        supervisor_pin: supervisorPin.trim() ? supervisorPin.trim() : undefined,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menutup shift kasir');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-gray-700 my-8 animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 bg-indigo-700 text-white flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>🔒</span> Tutup Shift & Rekonsiliasi Kas (Z-Report)
            </h2>
            <p className="text-xs text-indigo-200 font-medium mt-0.5">
              Shift: {shift.shift_number} ({shift.shift_name})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-indigo-200 hover:text-white text-xl font-bold p-1 rounded-md"
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

          {/* Cockpit ringkasan shift saat ini */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
            <div>
              <div className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400">Modal Awal</div>
              <div className="text-xs font-bold text-gray-800 dark:text-white mt-0.5">
                {formatIDR(shift.opening_cash)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400">Penjualan Tunai</div>
              <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                +{formatIDR(shift.payment_cash)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400">Kas Masuk/Keluar</div>
              <div className="text-xs font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {formatIDR(shift.total_paid_in - shift.total_paid_out)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400">
                Hitungan Sistem
              </div>
              <div className="text-xs font-black text-indigo-700 dark:text-indigo-300 mt-0.5">
                {formatIDR(expectedCash)}
              </div>
            </div>
          </div>

          {/* Toggle Denominations Counter */}
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Hitungan Uang Fisik di Laci Kasir
            </span>
            <button
              type="button"
              onClick={() => setUseBreakdown(!useBreakdown)}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
            >
              {useBreakdown ? 'Ketik Total Langsung' : 'Hitung per Lembar Pecahan'}
            </button>
          </div>

          {useBreakdown ? (
            <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[100000, 50000, 20000, 10000, 5000, 2000, 1000, 500].map((denom) => (
                  <div key={denom} className="flex items-center justify-between gap-1 bg-white dark:bg-gray-800 p-1.5 rounded-md border border-gray-200 dark:border-gray-700">
                    <span className="font-semibold text-gray-700 dark:text-gray-300 text-[11px]">
                      {denom >= 1000 ? `${denom / 1000}rb` : `${denom}`}
                    </span>
                    <NumberInput
                      min={0}
                      allowDecimal={false}
                      value={denomCounts[denom] ?? 0}
                      onChange={(val) => handleDenomChange(denom, val)}
                      aria-label={`Jumlah lembar pecahan ${denom}`}
                      className="w-16 px-1.5 py-0.5 text-right font-bold bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs text-gray-800 dark:text-white focus:outline-hidden"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Input Total Fisik */}
          <div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-base font-bold text-gray-400">
                Rp
              </span>
              <NumberInput
                min={0}
                allowDecimal={false}
                value={actualCash}
                onChange={setActualCash}
                aria-label="Total uang nyata di laci"
                className="w-full pl-12 pr-4 py-2.5 bg-white dark:bg-gray-700 border-2 border-indigo-400 dark:border-indigo-500 rounded-lg text-lg font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                placeholder="Masukkan total uang nyata di laci"
              />
            </div>
          </div>

          {/* Variance Status Cockpit */}
          <div
            className={`p-3 rounded-lg border flex items-center justify-between ${
              difference === 0
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : difference < 0
                  ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider">
                {difference === 0
                  ? 'Status: UANG PAS / SESUAI SISTEM'
                  : difference < 0
                    ? 'Status: UANG KURANG (SELISIH KURANG)'
                    : 'Status: UANG LEBIH (SELISIH LEBIH)'}
              </div>
              <div className="text-xs mt-0.5">
                {difference === 0
                  ? 'Hitungan uang fisik tepat sama dengan pencatatan sistem.'
                  : difference < 0
                    ? 'Uang fisik di laci kurang dari pencatatan sistem kasir.'
                    : 'Uang fisik di laci melebihi pencatatan sistem kasir.'}
              </div>
            </div>
            <div className="text-base font-black">
              {difference > 0 ? `+${formatIDR(difference)}` : formatIDR(difference)}
            </div>
          </div>

          {/* Supervisor PIN Verification */}
          <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              🔑 PIN Supervisor / Manager (Otorisasi Tutup Shift)
            </label>
            <input
              type="password"
              maxLength={8}
              value={supervisorPin}
              onChange={(e) => setSupervisorPin(e.target.value)}
              className="w-full px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-xs tracking-widest text-center text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              placeholder="••••••"
            />
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
              Masukkan PIN supervisor (default seed: 123456) sebagai saksi penutupan shift kasir.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
              Catatan Penutupan Shift
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              placeholder={
                difference !== 0
                  ? 'Jelaskan alasan selisih kas (misal: uang tip pelanggan belum terpisah, salah kembalian)...'
                  : 'Catatan serah terima kasir shift berikutnya...'
              }
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
              className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 active:bg-indigo-900 rounded-lg shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Menutup Shift...</span>
              ) : (
                <>
                  <span>🔒</span>
                  <span>Tutup Shift & Finalkan Z-Report</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
