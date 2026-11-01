import React, { useState } from 'react';
import { formatIDR } from '@/shared/utils/currency';
import { printThermalShiftReport } from './thermal-printer';
import type { ShiftReport } from './types';

interface ShiftReportModalProps {
  isOpen: boolean;
  report: ShiftReport | null;
  onClose: () => void;
}

export const ShiftReportModal: React.FC<ShiftReportModalProps> = ({
  isOpen,
  report,
  onClose,
}) => {
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');

  if (!isOpen || !report) return null;

  const isZ = report.report_type === 'Z_REPORT';
  const shift = report.shift;
  const diff = shift.cash_difference ?? 0;

  const handlePrint = () => {
    printThermalShiftReport(report, { paperWidth });
  };

  const is80 = paperWidth === '80mm';
  const fontBody = is80 ? 'text-[11px]' : 'text-[9.5px]';
  const fontHeader = is80 ? 'text-[11px]' : 'text-[10px]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-gray-700 my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className={`px-6 py-4 text-white flex justify-between items-center ${isZ ? 'bg-indigo-700' : 'bg-blue-600'}`}>
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>{isZ ? '📊' : '👁️'}</span>
              <span>{isZ ? 'Official Z-Report (Tutup Shift)' : 'Audit X-Report (Tengah Shift)'}</span>
            </h2>
            <p className="text-xs text-white/80 font-medium mt-0.5">
              {shift.shift_number} • {shift.outlet_name || shift.outlet_code}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white text-xl font-bold p-1 rounded-md"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Paper Width Selector & Actions */}
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <span className="font-semibold">Lebar Roll:</span>
            <button
              type="button"
              onClick={() => setPaperWidth('80mm')}
              className={`px-2 py-0.5 rounded-sm font-bold transition-colors ${
                paperWidth === '80mm'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300'
              }`}
            >
              80mm
            </button>
            <button
              type="button"
              onClick={() => setPaperWidth('58mm')}
              className={`px-2 py-0.5 rounded-sm font-bold transition-colors ${
                paperWidth === '58mm'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300'
              }`}
            >
              58mm
            </button>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-md shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <span>🖨️</span>
            <span>Cetak Struk ESC/POS</span>
          </button>
        </div>

        {/* Thermal Print Preview Container */}
        <div className="p-6 max-h-[70vh] overflow-y-auto bg-gray-100 dark:bg-gray-950 flex justify-center">
          <div
            className={`bg-white text-black p-4 shadow-md font-mono border border-gray-300 ${
              is80 ? 'text-xs w-[300px]' : 'text-[10px] w-[240px]'
            }`}
          >
            <div className="text-center font-bold text-sm">
              {(shift.outlet_code ?? '').toUpperCase().includes('TSH')
                ? 'TROPICAL STEAK HOUSE'
                : 'TROPICAL GARDEN RESTO'}
            </div>
            <div className="text-center text-[10px] text-gray-600">
              Kawasan Manding, Temanggung, Jateng
            </div>

            <div className="border-t border-dashed border-black my-2"></div>
            <div className="text-center font-bold">
              {isZ ? 'LAPORAN Z (PENUTUPAN SHIFT)' : 'LAPORAN X (AUDIT TENGAH SHIFT)'}
            </div>
            <div className="text-center text-[10px]">
              {isZ ? 'OFFICIAL CLOSING & RECONCILIATION' : 'MID-SHIFT AUDIT (NON-RESET)'}
            </div>
            <div className="border-t border-dashed border-black my-2"></div>

            <div className={`space-y-0.5 ${fontBody}`}>
              <div className="flex justify-between items-center gap-1">
                <span>No. Shift:</span>
                <span className="font-bold tracking-tight">{shift.shift_number}</span>
              </div>
              <div className="flex justify-between">
                <span>Shift Kerja:</span>
                <span>{shift.shift_name}</span>
              </div>
              <div className="flex justify-between">
                <span>Kasir:</span>
                <span className="font-bold">{shift.cashier_name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span>SPV:</span>
                <span>{shift.supervisor_name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span>Buka:</span>
                <span>
                  {new Date(shift.opened_at).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Tutup:</span>
                <span>
                  {shift.closed_at
                    ? new Date(shift.closed_at).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'OPEN'}
                </span>
              </div>
            </div>

            <div className="border-t border-dashed border-black my-2"></div>
            <div className={`text-center font-bold ${fontHeader}`}>RINGKASAN PENJUALAN</div>
            <div className="border-t border-dashed border-black my-1"></div>

            <div className={`space-y-0.5 ${fontBody}`}>
              <div className="flex justify-between">
                <span>Total Bill:</span>
                <span className="font-bold">{shift.total_transactions} Trx</span>
              </div>
              <div className="flex justify-between">
                <span>Penjualan Kotor:</span>
                <span>{formatIDR(shift.gross_sales)}</span>
              </div>
              <div className="flex justify-between">
                <span>Diskon:</span>
                <span>-{formatIDR(shift.discounts)}</span>
              </div>
              <div className="flex justify-between">
                <span>PB1 (10%):</span>
                <span>{formatIDR(shift.tax_pb1)}</span>
              </div>
              <div className="border-t-2 border-black my-1"></div>
              <div className={`flex justify-between font-bold ${is80 ? 'text-xs' : 'text-[10.5px]'}`}>
                <span>PENJUALAN BERSIH:</span>
                <span>{formatIDR(shift.net_sales)}</span>
              </div>
              <div className="border-t-2 border-black my-1"></div>
            </div>

            <div className={`text-center font-bold ${fontHeader} mt-2`}>METODE PEMBAYARAN</div>
            <div className="border-t border-dashed border-black my-1"></div>
            <div className={`space-y-0.5 ${fontBody}`}>
              <div className="flex justify-between font-bold">
                <span>Tunai (Cash):</span>
                <span>{formatIDR(shift.payment_cash)}</span>
              </div>
              <div className="flex justify-between">
                <span>QRIS:</span>
                <span>{formatIDR(shift.payment_qris)}</span>
              </div>
              <div className="flex justify-between">
                <span>EDC Debit/Card:</span>
                <span>{formatIDR(shift.payment_card)}</span>
              </div>
              <div className="flex justify-between">
                <span>Transfer:</span>
                <span>{formatIDR(shift.payment_transfer)}</span>
              </div>
            </div>

            <div className="border-t border-dashed border-black my-2"></div>
            <div className={`text-center font-bold ${fontHeader}`}>AUDIT LACI UANG (DRAWER)</div>
            <div className="border-t border-dashed border-black my-1"></div>
            <div className={`space-y-0.5 ${fontBody}`}>
              <div className="flex justify-between">
                <span>Modal Awal (Float):</span>
                <span>{formatIDR(shift.opening_cash)}</span>
              </div>
              <div className="flex justify-between">
                <span>(+) Penjualan Tunai:</span>
                <span>{formatIDR(shift.payment_cash)}</span>
              </div>
              <div className="flex justify-between">
                <span>(+) Kas Masuk:</span>
                <span>{formatIDR(shift.total_paid_in)}</span>
              </div>
              <div className="flex justify-between">
                <span>(-) Kas Keluar:</span>
                <span>-{formatIDR(shift.total_paid_out)}</span>
              </div>
              <div className="border-t border-dashed border-black my-1"></div>
              <div className="flex justify-between font-bold">
                <span>Kas Seharusnya:</span>
                <span>{formatIDR(shift.expected_cash)}</span>
              </div>

              {isZ && (
                <>
                  <div className="flex justify-between font-bold">
                    <span>Fisik Kas Dihitung:</span>
                    <span>{formatIDR(shift.actual_cash ?? 0)}</span>
                  </div>
                  <div
                    className={`flex justify-between font-bold ${
                      diff === 0 ? 'text-black' : diff < 0 ? 'text-red-600' : 'text-amber-600'
                    }`}
                  >
                    <span>Selisih (Diff):</span>
                    <span>{diff > 0 ? `+${formatIDR(diff)}` : formatIDR(diff)}</span>
                  </div>
                </>
              )}
            </div>

            {report.movements && report.movements.length > 0 && (
              <div className="mt-2 border-t border-dashed border-black pt-1">
                <div className="font-bold text-[10px] text-center mb-1">RINCIAN MUTASI KAS</div>
                {report.movements.map((m) => (
                  <div key={m.id} className="flex justify-between text-[10px] mb-0.5">
                    <span className="truncate max-w-[150px]">
                      [{m.movement_type === 'PAID_IN' ? 'IN' : 'OUT'}] {m.reason}
                    </span>
                    <span className="font-bold">
                      {m.movement_type === 'PAID_IN' ? '+' : '-'}
                      {formatIDR(m.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {isZ && (
              <div className="border-t border-dashed border-black mt-3 pt-2 text-[10px]">
                <div className="flex justify-between text-center">
                  <div className="w-[45%]">
                    <div>Kasir</div>
                    <div className="h-6"></div>
                    <div className="border-t border-black">{shift.cashier_name || 'Kasir'}</div>
                  </div>
                  <div className="w-[45%]">
                    <div>Supervisor</div>
                    <div className="h-6"></div>
                    <div className="border-t border-black">{shift.supervisor_name || 'SPV'}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="border-t border-dashed border-black mt-2 pt-1 text-center text-[9px] text-gray-500">
              Dicetak: {new Date(report.generated_at).toLocaleTimeString('id-ID')} ({report.generated_by})
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
