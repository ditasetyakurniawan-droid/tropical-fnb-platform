import React, { useState } from 'react';
import { X, Check, Users, Utensils, AlertCircle } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { formatIDR, distributeSplitEvenly, calculateTaxPB1 } from '@/shared/utils/currency';
import { SplitBillIcon, QRISBadgeIcon, CashDrawerIcon } from '@/shared/components/icons/EnterpriseIcons';
import type { Order, SplitBill } from './types';
import { paySplitBill, splitBillEvenly, splitBillByItems } from './pos-api';

interface SplitBillModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated: (updatedOrder: Order) => void;
}

export const SplitBillModal: React.FC<SplitBillModalProps> = ({
  order,
  isOpen,
  onClose,
  onOrderUpdated,
}) => {
  const [mode, setMode] = useState<'EVENLY' | 'BY_ITEMS'>('EVENLY');
  const [numPersons, setNumPersons] = useState<number>(order.pax_count > 1 ? order.pax_count : 2);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [splits, setSplits] = useState<SplitBill[]>(order.split_bills || []);
  const [payingSplitId, setPayingSplitId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Real-time zero-leak calculations for EVENLY preview
  const liveEvenSplits = distributeSplitEvenly(order.final_total, numPersons);
  const liveEvenSum = liveEvenSplits.reduce((a, b) => a + b, 0);
  const isZeroLeak = liveEvenSum === Math.round(order.final_total);

  const handleGenerateEvenSplits = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const generated = await splitBillEvenly(order.id, { num_persons: numPersons });
      setSplits(generated);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat split bill');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaySplit = async (splitId: string, method: 'CASH' | 'QRIS' | 'DEBIT_CARD', amount: number) => {
    setPayingSplitId(splitId);
    setErrorMsg(null);
    try {
      const res = await paySplitBill(order.id, splitId, {
        payment_method: method,
        amount,
      });
      // Update local splits
      setSplits(prev => prev.map(s => (s.id === splitId ? res.split_bill : s)));
      onOrderUpdated(res.order);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses pembayaran split');
    } finally {
      setPayingSplitId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center border border-brand-200 shadow-xs">
              <SplitBillIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-950 flex items-center gap-2">
                Split Bill / Bagi Tagihan
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-800">
                  #{order.order_number}
                </span>
              </h3>
              <p className="text-xs text-slate-600 font-semibold">
                Total Tagihan: <span className="font-black text-slate-950">{formatIDR(order.final_total)}</span> • Termasuk Pajak PB1 10%
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50/50">
          <button
            onClick={() => setMode('EVENLY')}
            className={`flex items-center gap-2 py-3 px-4 text-sm font-bold border-b-2 transition ${
              mode === 'EVENLY'
                ? 'border-brand-600 text-brand-800 bg-brand-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-950'
            }`}
          >
            <Users className="w-4 h-4" />
            Bagi Rata (Equal Split)
          </button>
          <button
            onClick={() => setMode('BY_ITEMS')}
            className={`flex items-center gap-2 py-3 px-4 text-sm font-bold border-b-2 transition ${
              mode === 'BY_ITEMS'
                ? 'border-brand-600 text-brand-800 bg-brand-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-950'
            }`}
          >
            <Utensils className="w-4 h-4" />
            Bagi Per Item Menu
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center gap-2 font-bold">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {mode === 'EVENLY' ? (
            <div className="space-y-4">
              {/* Persons Stepper */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div>
                  <div className="text-sm font-black text-slate-950">Jumlah Orang Pemisah</div>
                  <div className="text-xs text-slate-600 font-semibold">
                    Membagi tagihan Rp {formatIDR(order.final_total)} secara proporsional presisi
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={numPersons <= 2}
                    onClick={() => setNumPersons(n => Math.max(2, n - 1))}
                    className="w-10 h-10 rounded-xl border border-slate-300 bg-white text-slate-900 font-black hover:bg-slate-100 disabled:opacity-40 transition shadow-2xs"
                  >
                    -
                  </button>
                  <span className="text-xl font-black font-mono text-slate-950 min-w-8 text-center">
                    {numPersons}
                  </span>
                  <button
                    type="button"
                    disabled={numPersons >= 20}
                    onClick={() => setNumPersons(n => Math.min(20, n + 1))}
                    className="w-10 h-10 rounded-xl border border-slate-300 bg-white text-slate-900 font-black hover:bg-slate-100 disabled:opacity-40 transition shadow-2xs"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Zero-Leak Indicator */}
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-slate-600 font-semibold">
                  Total Simulasi: <strong className="text-slate-950 font-bold">{formatIDR(liveEvenSum)}</strong>
                </span>
                {isZeroLeak ? (
                  <span className="flex items-center gap-1 font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1 rounded-full text-xs">
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    Presisi Akuntansi 100% (Zero-Leak Rupiah)
                  </span>
                ) : (
                  <span className="text-rose-700 font-bold">Terjadi selisih pembagian</span>
                )}
              </div>

              {/* Unsaved / Live Preview List */}
              {splits.length === 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Pratinjau Pembagian per Orang
                  </div>
                  <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 overflow-hidden">
                    {liveEvenSplits.map((amt, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3.5 bg-white text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-800 border border-slate-200">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-900">Tamu #{idx + 1}</span>
                          {idx === 0 && liveEvenSplits[0] !== liveEvenSplits[liveEvenSplits.length - 1] && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              Alokasi Presisi +Rp1
                            </span>
                          )}
                        </div>
                        <span className="font-mono font-black text-slate-950">{formatIDR(amt)}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={handleGenerateEvenSplits}
                    loading={isSubmitting}
                    className="w-full mt-3 font-black py-3 rounded-2xl shadow-md"
                  >
                    Konfirmasi Pembagian Tagihan ({numPersons} Orang)
                  </Button>
                </div>
              ) : (
                /* Generated Splits with Tender Buttons */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Tagihan Terbagi Siap Bayar
                    </span>
                    <button
                      onClick={() => setSplits([])}
                      className="text-xs text-brand-700 font-bold hover:underline"
                    >
                      Hitung Ulang
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {splits.map((s) => (
                      <div
                        key={s.id}
                        className={`p-4 rounded-2xl border-2 transition ${
                          s.is_paid
                            ? 'bg-emerald-50/80 border-emerald-300'
                            : 'bg-white border-amber-300 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-950">{s.payer_name}</span>
                            {s.is_paid ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-full bg-emerald-200 text-emerald-950 border border-emerald-300">
                                <Check className="w-3 h-3" /> Lunas ({s.payment_method})
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300">
                                Belum Dibayar
                              </span>
                            )}
                          </div>
                          <span className="font-mono font-black text-base text-slate-950">
                            {formatIDR(s.final_amount)}
                          </span>
                        </div>

                        {!s.is_paid && (
                          <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                            <span className="text-xs text-slate-600 font-bold">Bayar dengan:</span>
                            <button
                              disabled={payingSplitId === s.id}
                              onClick={() => handlePaySplit(s.id, 'CASH', s.final_amount)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 flex items-center gap-1.5 transition shadow-2xs"
                            >
                              <CashDrawerIcon className="w-3.5 h-3.5" />
                              Tunai
                            </button>
                            <button
                              disabled={payingSplitId === s.id}
                              onClick={() => handlePaySplit(s.id, 'QRIS', s.final_amount)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-950 border border-emerald-300 flex items-center gap-1.5 transition shadow-2xs"
                            >
                              <QRISBadgeIcon className="w-3.5 h-3.5" />
                              QRIS
                            </button>
                            <button
                              disabled={payingSplitId === s.id}
                              onClick={() => handlePaySplit(s.id, 'DEBIT_CARD', s.final_amount)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-100 hover:bg-blue-200 text-blue-950 border border-blue-300 transition shadow-2xs"
                            >
                              Debit
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Mode BY_ITEMS */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-950">
                💡 <strong>Alokasi Proporsional Menu:</strong> Setiap orang menanggung menu pesanannya masing-masing. Pajak PB1 (10%) akan dialokasikan secara proporsional ke tiap menu tanpa pembulatan liar.
              </div>

              <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 overflow-hidden">
                {order.items?.map((it) => (
                  <div key={it.id} className="p-3.5 bg-white flex items-center justify-between text-sm">
                    <div>
                      <div className="font-bold text-slate-950">{it.item_name}</div>
                      <div className="text-xs text-slate-600 font-mono font-semibold">
                        {it.quantity}x @ {formatIDR(it.unit_price)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-black text-slate-950">{formatIDR(it.subtotal)}</div>
                      <div className="text-[11px] text-slate-500 font-medium">+PB1 {formatIDR(calculateTaxPB1(it.subtotal))}</div>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                onClick={async () => {
                  if (!order.items || order.items.length === 0) return;
                  setIsSubmitting(true);
                  try {
                    // Split half items to Tamu 1 and half to Tamu 2 as standard allocation
                    const half = Math.ceil(order.items.length / 2);
                    const p1Items = order.items.slice(0, half).map(i => ({ order_item_id: i.id, quantity: i.quantity }));
                    const p2Items = order.items.slice(half).map(i => ({ order_item_id: i.id, quantity: i.quantity }));

                    const res = await splitBillByItems(order.id, {
                      payers: [
                        { payer_name: 'Tamu 1 (Steak/Utama)', assignments: p1Items },
                        { payer_name: 'Tamu 2 (Pendamping)', assignments: p2Items },
                      ],
                    });
                    setSplits(res);
                  } catch (err: unknown) {
                    setErrorMsg(err instanceof Error ? err.message : 'Gagal split per item');
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                loading={isSubmitting}
                className="w-full font-black py-3 rounded-2xl shadow-md"
              >
                Buat Split Bill Otomatis per Item
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition shadow-2xs"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
