import React, { useState } from 'react';
import { X, Printer, Check, ChefHat, Receipt } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { formatIDR } from '@/shared/utils/currency';
import type { Order } from './types';
import { printThermalReceipt, printKitchenTicket } from './thermal-printer';

interface ReceiptModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  isProForma?: boolean;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  order,
  isOpen,
  onClose,
  isProForma = false,
}) => {
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [docType, setDocType] = useState<'RECEIPT' | 'KITCHEN'>('RECEIPT');

  if (!isOpen) return null;

  const isSteak = (order.outlet_code ?? '').toUpperCase().includes('TSH');
  const restaurantName = isSteak ? 'TROPICAL STEAK HOUSE' : 'TROPICAL GARDEN RESTO';
  const restaurantTagline = isSteak
    ? 'Spesialis Meltique Steak, Ribeye & BBQ Manding'
    : 'Kuliner Tradisional, Ikan Bakar & Gazebo Manding';
  const restaurantAddress = 'Kawasan Wisata Manding, Temanggung, Jawa Tengah';
  const restaurantPhone = 'Telp/WA: +62 812-3456-7890';

  const isPaid = order.payment_status === 'PAID';
  const latestPayment = order.payments && order.payments.length > 0 ? order.payments[order.payments.length - 1] : null;

  const handlePrint = () => {
    if (docType === 'KITCHEN') {
      printKitchenTicket(order, { paperWidth });
    } else {
      printThermalReceipt(order, { isProForma, paperWidth });
    }
  };

  const formattedDate = new Date(order.created_at).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className={`w-full ${paperWidth === '80mm' ? 'max-w-sm' : 'max-w-xs'} bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto transition-all duration-200`}>
        {/* Modal Toolbar (Screen Only) */}
        <div className="flex flex-col gap-2.5 p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-black text-slate-900">
                {docType === 'KITCHEN'
                  ? 'Tiket Dapur (Bon Masak)'
                  : isProForma
                  ? 'Pratinjau Tagihan Meja'
                  : 'Struk Pembayaran Kasir'}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mode Switch: Struk Tamu vs Bon Dapur */}
          <div className="grid grid-cols-2 gap-1.5 bg-slate-200/80 p-1 rounded-xl text-xs font-black">
            <button
              type="button"
              onClick={() => setDocType('RECEIPT')}
              className={`py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
                docType === 'RECEIPT'
                  ? 'bg-white text-emerald-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5 text-emerald-600" />
              <span>Struk Tagihan</span>
            </button>
            <button
              type="button"
              onClick={() => setDocType('KITCHEN')}
              className={`py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
                docType === 'KITCHEN'
                  ? 'bg-white text-amber-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ChefHat className="w-3.5 h-3.5 text-amber-600" />
              <span>Bon Masak Dapur</span>
            </button>
          </div>

          {/* Paper Roll Width Selector (80mm vs 58mm) */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-200/80 text-[11px]">
            <span className="text-slate-500 font-semibold">Ukuran Kertas Roll:</span>
            <div className="inline-flex rounded-lg bg-slate-200 p-0.5 font-bold">
              <button
                type="button"
                onClick={() => setPaperWidth('80mm')}
                className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${
                  paperWidth === '80mm'
                    ? 'bg-white text-emerald-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {paperWidth === '80mm' && <Check className="w-3 h-3 text-emerald-600" />}
                80mm (Standar)
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth('58mm')}
                className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${
                  paperWidth === '58mm'
                    ? 'bg-white text-emerald-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {paperWidth === '58mm' && <Check className="w-3 h-3 text-emerald-600" />}
                58mm (Mini)
              </button>
            </div>
          </div>
        </div>

        {/* Conditional Paper Preview (58mm/80mm style) */}
        {docType === 'KITCHEN' ? (
          /* Kitchen Order Ticket (Bon Masak) Preview */
          <div
            id="printable-thermal-receipt"
            className="p-6 font-mono text-xs text-slate-900 bg-white space-y-3 leading-relaxed print:p-0 print:m-0 print:w-full"
          >
            <div className="text-center space-y-1 pb-2 border-b-2 border-dashed border-slate-300">
              <span className="text-[11px] font-black tracking-wide text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                *** PESANAN DAPUR / BON MASAK ***
              </span>
              <h2 className="text-sm font-black text-slate-950 mt-1">{restaurantName}</h2>
            </div>

            {/* Giant Table Badge */}
            <div className="border-2 border-slate-950 p-2 text-center rounded-xl bg-slate-50">
              <span className="text-xs text-slate-500 font-bold block">Tujuan Meja:</span>
              <strong className="text-xl font-black text-slate-950 uppercase tracking-tight">
                {order.table_number ? `MEJA ${order.table_number}` : 'BUNGKUS (TAKEAWAY)'}
              </strong>
            </div>

            {/* Order Info */}
            <div className="text-[11px] space-y-1 pb-2 border-b border-dashed border-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-600">No. Order:</span>
                <strong className="text-slate-950">{order.order_number}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Tamu / Pax:</span>
                <span className="font-semibold text-slate-900">{order.customer_name} ({order.pax_count} Pax)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Waktu Masuk:</span>
                <span className="text-slate-700">{formattedDate}</span>
              </div>
            </div>

            {/* Items (No Prices, Clear Quantities & Notes) */}
            <div className="space-y-2 py-2 border-b-2 border-dashed border-slate-400">
              {order.items && order.items.length > 0 ? (
                order.items.map((it) => (
                  <div key={it.id} className="pb-1.5 border-b border-dotted border-slate-200 last:border-0">
                    <div className="flex items-start gap-2">
                      <span className="font-black text-sm text-slate-950 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300">
                        {it.quantity}x
                      </span>
                      <span className="font-black text-xs text-slate-900 leading-tight pt-0.5">
                        {it.item_name}
                      </span>
                    </div>
                    {it.notes && (
                      <div className="mt-1 ml-7 text-[10px] font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        * {it.notes}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-2 text-slate-400 italic">Tidak ada item pesanan</div>
              )}
            </div>

            {/* Footer Notice */}
            <div className="text-center pt-2 text-[10px] text-slate-600 font-semibold space-y-0.5">
              <div>*** MOHON SEGERA DIPROSES ***</div>
              <div className="text-[9px] text-slate-500">SOP Target Saji: &lt; 15 Menit</div>
            </div>
          </div>
        ) : (
          /* Customer Receipt (Struk Tagihan) Preview */
          <div
            id="printable-thermal-receipt"
            className="p-6 font-mono text-xs text-slate-900 bg-white space-y-3 leading-relaxed print:p-0 print:m-0 print:w-full"
          >
            {/* Header */}
            <div className="text-center space-y-1 pb-2 border-b-2 border-dashed border-slate-300">
              <h2 className="text-base font-black tracking-tight text-slate-950">{restaurantName}</h2>
              <p className="text-[10px] text-slate-600 font-semibold">{restaurantTagline}</p>
              <p className="text-[9px] text-slate-500">{restaurantAddress}</p>
              <p className="text-[9px] text-slate-500">{restaurantPhone}</p>
              <div className="pt-1">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-black uppercase ${
                    isPaid
                      ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                      : 'bg-amber-100 text-amber-950 border border-amber-300'
                  }`}
                >
                  {isPaid ? 'BUKTI PEMBAYARAN LUNAS' : 'TAGIHAN SEMENTARA (PRO-FORMA)'}
                </span>
              </div>
            </div>

            {/* Meta Information */}
            <div className="text-[11px] space-y-1 pb-2 border-b border-dashed border-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-600">No. Order:</span>
                <strong className="text-slate-950">{order.order_number}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Meja:</span>
                <strong className="text-slate-950">{order.table_number || 'Takeaway / Counter'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Pelanggan:</span>
                <span className="font-semibold text-slate-900">
                  {order.customer_name} ({order.pax_count} Pax)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Waktu:</span>
                <span className="text-slate-700">{formattedDate}</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="space-y-2 py-1 border-b border-dashed border-slate-300">
              {order.items && order.items.length > 0 ? (
                order.items.map((it) => (
                  <div key={it.id} className="space-y-0.5">
                    <div className="flex justify-between font-bold text-slate-950">
                      <span className="truncate pr-2">{it.item_name}</span>
                      <span className="shrink-0">{formatIDR(it.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-600">
                      <span>
                        {it.quantity} x {formatIDR(it.unit_price)}
                      </span>
                      {it.notes && <span className="italic text-slate-500">({it.notes})</span>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-2 text-slate-400 italic">Tidak ada item pesanan</div>
              )}
            </div>

            {/* Financial Calculation Breakdown */}
            <div className="space-y-1.5 pt-1 text-xs">
              <div className="flex justify-between text-slate-700 font-semibold">
                <span>Subtotal:</span>
                <span className="font-bold text-slate-950">{formatIDR(order.subtotal)}</span>
              </div>
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-rose-700 font-semibold">
                  <span>Diskon Promo:</span>
                  <span>-{formatIDR(order.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-700 font-semibold">
                <span>Pajak Resto (PB1 10%):</span>
                <span className="font-bold text-slate-950">{formatIDR(order.tax_pb1_amount)}</span>
              </div>
              {order.service_charge_amount > 0 && (
                <div className="flex justify-between text-slate-700 font-semibold">
                  <span>Biaya Layanan:</span>
                  <span className="font-bold text-slate-950">{formatIDR(order.service_charge_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black pt-2 border-t-2 border-dashed border-slate-400 text-slate-950">
                <span>TOTAL TAGIHAN:</span>
                <span className="text-emerald-800 font-black">{formatIDR(order.final_total)}</span>
              </div>
            </div>

            {/* Tender Settlement Details */}
            {isPaid && (
              <div className="space-y-1 pt-2 border-t border-dashed border-slate-300 text-[11px] bg-slate-50 p-2.5 rounded-xl">
                <div className="flex justify-between text-slate-700">
                  <span>Metode Bayar:</span>
                  <strong className="text-slate-950 uppercase">{latestPayment?.payment_method || 'TUNAI'}</strong>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Jumlah Bayar:</span>
                  <span className="font-bold text-slate-950">
                    {formatIDR(latestPayment?.amount || order.paid_amount || order.final_total)}
                  </span>
                </div>
                {order.change_amount > 0 && (
                  <div className="flex justify-between text-emerald-800 font-bold">
                    <span>Kembalian:</span>
                    <span>{formatIDR(order.change_amount)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Receipt Footer Message */}
            <div className="text-center pt-3 pb-1 border-t-2 border-dashed border-slate-300 text-[10px] text-slate-500 space-y-1">
              <p className="font-bold text-slate-800">Terima kasih atas kunjungan Anda!</p>
              <p>Password WiFi: <strong className="text-slate-900">tropical2026</strong></p>
              <p className="text-[9px] text-slate-400">Harga sudah termasuk PB1 10% • Struk ini sah sebagai bukti pembayaran.</p>
            </div>
          </div>
        )}

        {/* Modal Action Buttons (Screen Only) */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="w-1/2 text-xs font-bold"
          >
            Tutup
          </Button>
          <Button
            size="sm"
            onClick={handlePrint}
            className={`w-1/2 text-xs font-black text-white shadow-md flex items-center justify-center gap-1.5 ${
              docType === 'KITCHEN'
                ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/25'
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'
            }`}
          >
            <Printer className="w-4 h-4" />
            {docType === 'KITCHEN' ? `Cetak Bon Dapur (${paperWidth})` : `Cetak Struk (${paperWidth})`}
          </Button>
        </div>
      </div>
    </div>
  );
};
