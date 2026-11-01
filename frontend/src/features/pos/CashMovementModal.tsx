import React, { useState } from 'react';
import { NumberInput } from '@/shared/ui/NumberInput';
import { formatIDR } from '@/shared/utils/currency';
import type { CashMovementType, CashMovementPayload } from './types';

interface CashMovementModalProps {
  isOpen: boolean;
  shiftNumber: string;
  onClose: () => void;
  onSuccess: (payload: CashMovementPayload) => Promise<void>;
}

export const CashMovementModal: React.FC<CashMovementModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <CashMovementModalContent key={props.shiftNumber} {...props} />;
};

const CashMovementModalContent: React.FC<CashMovementModalProps> = ({
  shiftNumber,
  onClose,
  onSuccess,
}) => {
  const [movementType, setMovementType] = useState<CashMovementType>('PAID_OUT');
  const [amount, setAmount] = useState<number>(50000);
  const [reason, setReason] = useState<string>('');
  const [supervisorPin, setSupervisorPin] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const quickReasonsPaidOut = [
    'Beli es batu kristal darurat',
    'Beli air mineral galon',
    'Beli bumbu dapur darurat',
    'Refund / Ganti rugi komplain tamu',
    'Biaya operasional kasir kecil',
  ];

  const quickReasonsPaidIn = [
    'Penambahan uang modal kasir dari SPV',
    'Pengembalian uang sisa belanja darurat',
    'Setoran uang kembalian awal shift',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      setErrorMsg('Jumlah nominal harus lebih dari Rp 0');
      return;
    }
    if (!reason.trim()) {
      setErrorMsg('Alasan transaksi kas wajib diisi');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSuccess({
        movement_type: movementType,
        amount,
        reason: reason.trim(),
        supervisor_pin: supervisorPin.trim() ? supervisorPin.trim() : undefined,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan transaksi kas');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 bg-amber-600 text-white flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>💸</span> Catat Ambil / Tambah Uang Laci Kasir
            </h2>
            <p className="text-xs text-amber-100 font-medium mt-0.5">Shift: {shiftNumber}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-amber-100 hover:text-white text-xl font-bold p-1 rounded-md"
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

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              Jenis Transaksi Laci
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMovementType('PAID_OUT')}
                className={`py-2 px-3 rounded-lg border text-center transition-all flex items-center justify-center gap-2 ${
                  movementType === 'PAID_OUT'
                    ? 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-bold ring-2 ring-red-500/30'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                <span>📤</span>
                <span className="text-xs">Ambil Uang Laci</span>
              </button>
              <button
                type="button"
                onClick={() => setMovementType('PAID_IN')}
                className={`py-2 px-3 rounded-lg border text-center transition-all flex items-center justify-center gap-2 ${
                  movementType === 'PAID_IN'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold ring-2 ring-emerald-500/30'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                <span>📥</span>
                <span className="text-xs">Tambah Uang ke Laci</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              Nominal Uang
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-sm font-bold text-gray-400">
                Rp
              </span>
              <NumberInput
                min={0}
                allowDecimal={false}
                value={amount}
                onChange={setAmount}
                aria-label="Nominal Uang"
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg text-base font-bold text-gray-800 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                placeholder="50000"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
              Alasan / Keperluan Transaksi
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-800 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              placeholder="Contoh: Beli es batu kristal 2 karung darurat..."
              required
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(movementType === 'PAID_OUT' ? quickReasonsPaidOut : quickReasonsPaidIn).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className="text-[10px] px-2 py-0.5 rounded-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              🔑 PIN Supervisor / Otorisasi (Opsional)
            </label>
            <input
              type="password"
              maxLength={8}
              value={supervisorPin}
              onChange={(e) => setSupervisorPin(e.target.value)}
              className="w-full px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-xs tracking-widest text-center text-gray-800 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              placeholder="••••••"
            />
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
              Masukkan PIN supervisor untuk mencatat otorisasi resmi pengeluaran laci kasir.
            </p>
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
              className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Menyimpan...</span>
              ) : (
                <>
                  <span>💾</span>
                  <span>Simpan Transaksi Kas ({formatIDR(amount)})</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
