import { formatIDR } from '@/shared/utils/currency';
import type { Order, ShiftReport } from './types';

export interface ThermalPrintOptions {
  isProForma?: boolean;
  paperWidth?: '80mm' | '58mm';
}

/**
 * Escapes HTML characters to prevent layout breakage and XSS in print templates.
 */
export function escapeHtml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generates clean, high-contrast HTML strictly styled for ESC/POS thermal printers.
 * Supports standard 80mm (72mm printable) and compact 58mm (48mm printable) rolls.
 */
export function generateThermalReceiptHtml(
  order: Order,
  options: ThermalPrintOptions = {}
): string {
  const paperWidth = options.paperWidth || '80mm';
  const isSteak = (order.outlet_code ?? '').toUpperCase().includes('TSH');
  const restaurantName = isSteak ? 'TROPICAL STEAK HOUSE' : 'TROPICAL GARDEN RESTO';
  const restaurantTagline = isSteak
    ? 'Spesialis Meltique Steak, Ribeye & BBQ Manding'
    : 'Kuliner Tradisional, Ikan Bakar & Gazebo Manding';
  const restaurantAddress = 'Kawasan Wisata Manding, Temanggung, Jawa Tengah';
  const restaurantPhone = 'Telp/WA: +62 812-3456-7890';

  const isPaid = order.payment_status === 'PAID';
  const isProForma = options.isProForma ?? !isPaid;
  const latestPayment =
    order.payments && order.payments.length > 0 ? order.payments[order.payments.length - 1] : null;

  const formattedDate = new Date(order.created_at).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const is80mm = paperWidth === '80mm';
  const bodyWidth = is80mm ? '72mm' : '48mm';
  const baseFontSize = is80mm ? '12px' : '10px';
  const headerFontSize = is80mm ? '15px' : '12px';
  const totalFontSize = is80mm ? '14px' : '12px';

  const itemsHtml = (order.items || [])
    .map(
      (it) => `
    <div style="margin-bottom: 5px;">
      <div style="display: flex; justify-content: space-between; font-weight: bold;">
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 65%;">${escapeHtml(it.item_name)}</span>
        <span>${formatIDR(it.subtotal)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: ${is80mm ? '11px' : '9px'}; color: #333;">
        <span>${it.quantity} x ${formatIDR(it.unit_price)}</span>
        ${it.notes ? `<span style="font-style: italic; max-width: 50%; text-align: right;">(${escapeHtml(it.notes)})</span>` : ''}
      </div>
    </div>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${isProForma ? 'BILL' : 'STRUK'}-${order.order_number}</title>
  <style>
    @page {
      size: ${paperWidth} auto;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      width: ${bodyWidth};
      max-width: ${bodyWidth};
      margin: 0 auto;
      padding: 3mm 1mm;
      background: #ffffff;
      color: #000000;
      font-family: 'Courier New', Courier, monospace;
      font-size: ${baseFontSize};
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .dashed-line {
      border-top: 1px dashed #000000;
      margin: 6px 0;
    }
    .double-dashed-line {
      border-top: 2px dashed #000000;
      margin: 6px 0;
    }
    .flex-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 2px 0;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border: 1px solid #000000;
      font-weight: bold;
      font-size: ${is80mm ? '10px' : '9px'};
      text-transform: uppercase;
      margin-top: 3px;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="text-center" style="margin-bottom: 6px;">
    <div style="font-size: ${headerFontSize}; font-weight: 900; letter-spacing: -0.5px;">${restaurantName}</div>
    <div style="font-size: ${is80mm ? '10px' : '8px'}; margin-top: 2px;">${restaurantTagline}</div>
    <div style="font-size: ${is80mm ? '9px' : '8px'}; color: #222;">${restaurantAddress}</div>
    <div style="font-size: ${is80mm ? '9px' : '8px'}; color: #222;">${restaurantPhone}</div>
    <div>
      <span class="badge">
        ${isPaid ? 'BUKTI PEMBAYARAN LUNAS' : 'TAGIHAN SEMENTARA (PRO-FORMA)'}
      </span>
    </div>
  </div>

  <div class="dashed-line"></div>

  <!-- Order Metadata -->
  <div style="font-size: ${is80mm ? '11px' : '9px'};">
    <div class="flex-row">
      <span>No. Order:</span>
      <span class="bold">${order.order_number}</span>
    </div>
    <div class="flex-row">
      <span>Meja:</span>
      <span class="bold">${order.table_number ? escapeHtml(order.table_number) : 'Takeaway'}</span>
    </div>
    <div class="flex-row">
      <span>Pelanggan:</span>
      <span>${escapeHtml(order.customer_name)} (${order.pax_count} Pax)</span>
    </div>
    <div class="flex-row">
      <span>Waktu:</span>
      <span>${formattedDate}</span>
    </div>
    ${order.created_by_name ? `
    <div class="flex-row">
      <span>Kasir:</span>
      <span>${escapeHtml(order.created_by_name)}</span>
    </div>` : ''}
  </div>

  <div class="dashed-line"></div>

  <!-- Items -->
  <div>
    ${itemsHtml || '<div class="text-center">Tidak ada item pesanan</div>'}
  </div>

  <div class="dashed-line"></div>

  <!-- Financial Summary -->
  <div>
    <div class="flex-row">
      <span>Subtotal:</span>
      <span class="bold">${formatIDR(order.subtotal)}</span>
    </div>
    ${order.discount_amount > 0 ? `
    <div class="flex-row">
      <span>Diskon Promo:</span>
      <span>-${formatIDR(order.discount_amount)}</span>
    </div>` : ''}
    <div class="flex-row">
      <span>Pajak Resto (PB1 10%):</span>
      <span class="bold">${formatIDR(order.tax_pb1_amount)}</span>
    </div>
    ${order.service_charge_amount > 0 ? `
    <div class="flex-row">
      <span>Biaya Layanan:</span>
      <span class="bold">${formatIDR(order.service_charge_amount)}</span>
    </div>` : ''}
    
    <div class="double-dashed-line"></div>

    <div class="flex-row bold" style="font-size: ${totalFontSize};">
      <span>TOTAL TAGIHAN:</span>
      <span>${formatIDR(order.final_total)}</span>
    </div>
  </div>

  ${isPaid ? `
  <div class="dashed-line"></div>
  <div style="font-size: ${is80mm ? '11px' : '9px'}; background: #f9f9f9; padding: 4px;">
    <div class="flex-row">
      <span>Metode Bayar:</span>
      <span class="bold">${latestPayment?.payment_method || 'TUNAI'}</span>
    </div>
    <div class="flex-row">
      <span>Jumlah Bayar:</span>
      <span class="bold">${formatIDR(latestPayment?.amount || order.paid_amount || order.final_total)}</span>
    </div>
    ${order.change_amount > 0 ? `
    <div class="flex-row bold">
      <span>Kembalian:</span>
      <span>${formatIDR(order.change_amount)}</span>
    </div>` : ''}
  </div>` : ''}

  <div class="dashed-line"></div>

  <!-- Footer -->
  <div class="text-center" style="font-size: ${is80mm ? '10px' : '8px'}; color: #333; margin-top: 6px;">
    <div class="bold">Terima kasih atas kunjungan Anda!</div>
    <div style="margin-top: 2px;">Password WiFi: <span class="bold">tropical2026</span></div>
    <div style="font-size: ${is80mm ? '9px' : '7.5px'}; margin-top: 3px; color: #555;">
      Harga sudah termasuk PB1 10% • Struk ini sah sebagai bukti transaksi resto.
    </div>
  </div>

  <!-- Paper cut feed space for physical thermal printers -->
  <div style="height: 12mm;"></div>
</body>
</html>`;
}

export interface KitchenTicketData {
  order_number: string;
  outlet_code?: string | undefined;
  table_number?: string | undefined;
  customer_name: string;
  pax_count: number;
  created_at: string;
  order_type?: string | undefined;
  created_by_name?: string | undefined;
  isAddition?: boolean;
  items?: Array<{
    item_name: string;
    quantity: number;
    notes?: string | undefined;
    station?: string | undefined;
  }> | undefined;
}

export interface KitchenPrintOptions {
  paperWidth?: '80mm' | '58mm';
  stationFilter?: string;
  isAddition?: boolean;
}

/**
 * Generates high-visibility thermal ticket HTML specifically for kitchen cooks (Bon Masak).
 * Omits financial details, prioritizes Table Number, Item Quantities, and Modifiers/Notes.
 */
export function generateKitchenTicketHtml(
  ticket: KitchenTicketData,
  options: KitchenPrintOptions = {}
): string {
  const paperWidth = options.paperWidth || '80mm';
  const is80mm = paperWidth === '80mm';
  const bodyWidth = is80mm ? '72mm' : '48mm';
  const isSteak = (ticket.outlet_code ?? '').toUpperCase().includes('TSH');
  const restaurantName = isSteak ? 'TROPICAL STEAK HOUSE' : 'TROPICAL GARDEN RESTO';
  const isAddition = Boolean(options.isAddition || ticket.isAddition);

  const formattedDate = new Date(ticket.created_at).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const rawItems = ticket.items || [];
  const filteredItems = options.stationFilter && options.stationFilter !== 'ALL'
    ? rawItems.filter(it => it.station === options.stationFilter)
    : rawItems;

  const itemsHtml = filteredItems
    .map(
      (it) => `
    <div style="margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dotted #ccc;">
      <div style="display: flex; align-items: baseline; justify-content: space-between;">
        <span style="font-size: ${is80mm ? '15px' : '13px'}; font-weight: 900;">
          [ ${it.quantity}x ] ${escapeHtml(it.item_name)}
        </span>
      </div>
      ${it.notes ? `
        <div style="margin-top: 3px; font-size: ${is80mm ? '12px' : '10px'}; font-weight: bold; background: #e8e8e8; padding: 2px 5px; border-left: 3px solid #000;">
          * ${escapeHtml(it.notes)}
        </div>
      ` : ''}
    </div>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>BON-${isAddition ? 'TAMBAHAN' : 'DAPUR'}-${ticket.order_number}</title>
  <style>
    @page {
      size: ${paperWidth} auto;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      width: ${bodyWidth};
      max-width: ${bodyWidth};
      margin: 0 auto;
      padding: 3mm 1mm;
      background: #ffffff;
      color: #000000;
      font-family: 'Courier New', Courier, monospace;
      font-size: ${is80mm ? '12px' : '10px'};
      line-height: 1.3;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .text-center { text-align: center; }
    .bold { font-weight: bold; }
    .dashed-line {
      border-top: 2px dashed #000000;
      margin: 6px 0;
    }
    .flex-row {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
    }
    .table-banner {
      border: 3px solid #000000;
      padding: 4px 6px;
      margin: 6px 0;
      text-align: center;
      font-size: ${is80mm ? '20px' : '16px'};
      font-weight: 900;
      background: #ffffff;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .addition-badge {
      display: block;
      background: #000000;
      color: #ffffff;
      padding: 4px;
      margin: 4px 0;
      text-align: center;
      font-weight: 900;
      font-size: ${is80mm ? '13px' : '11px'};
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="text-center">
    <div style="font-size: ${is80mm ? '13px' : '11px'}; font-weight: bold;">
      ${isAddition ? '*** PESANAN TAMBAHAN (ADD-ON) ***' : '*** PESANAN DAPUR / ORDER TICKET ***'}
    </div>
    <div style="font-size: ${is80mm ? '11px' : '9px'}; margin-top: 1px;">${restaurantName}</div>
  </div>

  ${isAddition ? '<div class="addition-badge">⚠️ TAMBAHAN MENU KE MEJA ⚠️</div>' : ''}

  <!-- Giant Table Identifier -->
  <div class="table-banner">
    ${ticket.table_number ? `MEJA: ${escapeHtml(ticket.table_number)}` : 'TAKEAWAY (BUNGKUS)'}
  </div>

  <!-- Order Metadata -->
  <div style="font-size: ${is80mm ? '11px' : '9px'};">
    <div class="flex-row">
      <span>No. Order:</span>
      <span class="bold">${escapeHtml(ticket.order_number)}</span>
    </div>
    <div class="flex-row">
      <span>Tamu / Pax:</span>
      <span class="bold">${escapeHtml(ticket.customer_name)} (${ticket.pax_count} Pax)</span>
    </div>
    <div class="flex-row">
      <span>Waktu Masuk:</span>
      <span>${formattedDate}</span>
    </div>
    ${ticket.created_by_name ? `
    <div class="flex-row">
      <span>Waiter/Kasir:</span>
      <span>${escapeHtml(ticket.created_by_name)}</span>
    </div>` : ''}
    ${options.stationFilter && options.stationFilter !== 'ALL' ? `
    <div class="flex-row" style="background: #e0e0e0; padding: 1px 3px; font-weight: bold; margin-top: 2px;">
      <span>STASIUN:</span>
      <span>${escapeHtml(options.stationFilter)}</span>
    </div>` : ''}
  </div>

  <div class="dashed-line"></div>

  <!-- Items -->
  <div style="padding: 4px 0;">
    ${itemsHtml || '<div class="text-center" style="font-style: italic;">Tidak ada item untuk stasiun ini</div>'}
  </div>

  <div class="dashed-line"></div>

  <!-- Footer -->
  <div class="text-center" style="font-size: ${is80mm ? '10px' : '8px'}; font-weight: bold; margin-top: 4px;">
    <div>*** MOHON SEGERA DIPROSES ***</div>
    <div style="font-weight: normal; margin-top: 2px;">SOP Waktu Saji: &lt; 15 Menit</div>
  </div>

  <!-- Paper cut feed space -->
  <div style="height: 14mm;"></div>
</body>
</html>`;
}

interface PrintQueueItem {
  html: string;
  resolve: () => void;
  reject: (err: unknown) => void;
}

const printQueue: PrintQueueItem[] = [];
let isQueueRunning = false;

function processPrintQueue(): void {
  if (isQueueRunning || printQueue.length === 0) return;
  isQueueRunning = true;
  const currentJob = printQueue.shift()!;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  iframe.setAttribute('title', 'Thermal Print Engine');
  document.body.appendChild(iframe);

  let hasCleanedUp = false;
  const cleanup = () => {
    if (hasCleanedUp) return;
    hasCleanedUp = true;
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
    isQueueRunning = false;
    setTimeout(() => {
      processPrintQueue();
    }, 120);
  };

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    console.error('Failed to access print iframe document context');
    cleanup();
    currentJob.reject(new Error('Iframe document context inaccessible'));
    return;
  }

  doc.open();
  doc.write(currentJob.html);
  doc.close();

  setTimeout(() => {
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.onafterprint = () => {
          cleanup();
          currentJob.resolve();
        };
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } else {
        cleanup();
        currentJob.resolve();
      }
    } catch (err) {
      console.error('Error invoking print dialog:', err);
      cleanup();
      currentJob.reject(err);
    } finally {
      // Fallback timer: resolve and clean up after 2s if onafterprint does not trigger
      setTimeout(() => {
        if (!hasCleanedUp) {
          cleanup();
          currentJob.resolve();
        }
      }, 2000);
    }
  }, 150);
}

/**
 * Triggers instant printing using an isolated hidden iframe with sequential FIFO queue.
 * Guarantees zero blank sheets, no overlapping print dialogs, and proper 80mm/58mm roll width.
 */
export function triggerIframePrint(html: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    printQueue.push({ html, resolve, reject });
    processPrintQueue();
  });
}

export interface PrintTelemetryPayload {
  event: 'print_job_ok' | 'print_job_failed' | 'print_deduped';
  level: 'info' | 'warn' | 'error';
  message: string;
  order_id?: string;
  outlet_id?: string;
  station?: string;
}

/**
 * Emits non-blocking client log telemetry for print jobs to the Loki-compatible backend.
 */
export function sendPrintTelemetry(payload: PrintTelemetryPayload): void {
  try {
    const body = {
      event: payload.event,
      level: payload.level,
      message: payload.message,
      order_id: payload.order_id,
      outlet_id: payload.outlet_id,
      station: payload.station,
      route: typeof window !== 'undefined' ? window.location.pathname : '',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    };
    fetch('/api/v1/system/client-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {
      // Non-blocking telemetry
    });
  } catch {
    // Non-blocking telemetry
  }
}

const PRINT_LEDGER_KEY = 'fnb_printed_jobs_ledger';
const LEDGER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PrintLedgerRecord {
  timestamp: number;
}

function getPrintLedger(): Record<string, PrintLedgerRecord> {
  try {
    const raw = localStorage.getItem(PRINT_LEDGER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function prunePrintLedger(ledger: Record<string, PrintLedgerRecord>): Record<string, PrintLedgerRecord> {
  const now = Date.now();
  const pruned: Record<string, PrintLedgerRecord> = {};
  for (const [k, v] of Object.entries(ledger)) {
    if (v && typeof v.timestamp === 'number' && now - v.timestamp < LEDGER_TTL_MS) {
      pruned[k] = v;
    }
  }
  return pruned;
}

/**
 * Checks if a specific print job key has already been dispatched within the last 24h.
 */
export function isAlreadyPrinted(key: string): boolean {
  try {
    const ledger = getPrintLedger();
    const entry = ledger[key];
    if (!entry) return false;
    if (Date.now() - entry.timestamp > LEDGER_TTL_MS) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Marks a print job key as processed in localStorage with 24-hour expiration pruning.
 */
export function markAsPrinted(key: string): void {
  try {
    const ledger = prunePrintLedger(getPrintLedger());
    ledger[key] = { timestamp: Date.now() };
    localStorage.setItem(PRINT_LEDGER_KEY, JSON.stringify(ledger));
  } catch (e) {
    console.warn('Failed to update print ledger in localStorage', e);
  }
}

/**
 * Auto-prints Customer Receipt exactly once upon payment settlement (PAID).
 * Idempotent: Subsequent calls for the same settled order are ignored and logged as deduped.
 */
export function autoPrintReceiptOnce(
  order: Order,
  paperWidth: '80mm' | '58mm' = '80mm'
): boolean {
  if (order.payment_status !== 'PAID') {
    return false;
  }

  const dedupKey = `receipt_paid_${order.id}`;
  if (isAlreadyPrinted(dedupKey)) {
    sendPrintTelemetry({
      event: 'print_deduped',
      level: 'info',
      message: `Struk pembayaran order ${order.order_number} sudah pernah dicetak, duplikasi dicegah`,
      order_id: order.id,
      outlet_id: order.outlet_id,
    });
    return false;
  }

  markAsPrinted(dedupKey);
  try {
    printThermalReceipt(order, { paperWidth, isProForma: false });
    sendPrintTelemetry({
      event: 'print_job_ok',
      level: 'info',
      message: `Struk pembayaran otomatis order ${order.order_number} berhasil dikirim ke antrean cetak`,
      order_id: order.id,
      outlet_id: order.outlet_id,
    });
    return true;
  } catch (err) {
    sendPrintTelemetry({
      event: 'print_job_failed',
      level: 'error',
      message: `Gagal mencetak struk otomatis order ${order.order_number}: ${err instanceof Error ? err.message : String(err)}`,
      order_id: order.id,
      outlet_id: order.outlet_id,
    });
    return false;
  }
}

/**
 * Prints Customer Receipt / Pro-forma Bill
 */
export function printThermalReceipt(
  order: Order,
  options: ThermalPrintOptions = {}
): void {
  const html = generateThermalReceiptHtml(order, options);
  void triggerIframePrint(html);
}

/**
 * Prints Kitchen Order Ticket (Bon Masak Dapur)
 */
export function printKitchenTicket(
  ticket: KitchenTicketData,
  options: KitchenPrintOptions = {}
): void {
  const rawItems = ticket.items || [];
  if (options.stationFilter && options.stationFilter !== 'ALL') {
    const hasMatchingItems = rawItems.some((it) => it.station === options.stationFilter);
    if (!hasMatchingItems) {
      return;
    }
  }
  const html = generateKitchenTicketHtml(ticket, options);
  triggerIframePrint(html)
    .then(() => {
      sendPrintTelemetry({
        event: 'print_job_ok',
        level: 'info',
        message: `Tiket dapur order ${ticket.order_number} (${options.stationFilter || 'ALL'}) berhasil dikirim ke antrean cetak`,
        station: options.stationFilter || 'ALL',
      });
    })
    .catch((err) => {
      sendPrintTelemetry({
        event: 'print_job_failed',
        level: 'error',
        message: `Gagal mencetak tiket dapur order ${ticket.order_number}: ${err instanceof Error ? err.message : String(err)}`,
        station: options.stationFilter || 'ALL',
      });
    });
}

/**
 * Generates ESC/POS formatted HTML for Shift X-Report and Z-Report.
 * Supports standard 80mm and compact 58mm thermal rolls.
 */
export function generateThermalShiftReportHtml(
  report: ShiftReport,
  options: ThermalPrintOptions = {}
): string {
  const paperWidth = options.paperWidth || '80mm';
  const isSteak = (report.shift.outlet_code ?? '').toUpperCase().includes('TSH');
  const restaurantName = isSteak ? 'TROPICAL STEAK HOUSE' : 'TROPICAL GARDEN RESTO';
  const restaurantAddress = 'Kawasan Wisata Manding, Temanggung, Jawa Tengah';
  const is80mm = paperWidth === '80mm';
  const bodyWidth = is80mm ? '72mm' : '48mm';
  const baseFontSize = is80mm ? '12px' : '10px';
  const headerFontSize = is80mm ? '15px' : '12px';

  const isZReport = report.report_type === 'Z_REPORT';
  const title = isZReport ? 'LAPORAN Z (PENUTUPAN SHIFT)' : 'LAPORAN X (AUDIT TENGAH SHIFT)';
  const subtitle = isZReport
    ? 'OFFICIAL CLOSING & CASH RECONCILIATION'
    : 'MID-SHIFT AUDIT (NON-RESET)';

  const openedDateStr = new Date(report.shift.opened_at).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const closedDateStr = report.shift.closed_at
    ? new Date(report.shift.closed_at).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'MASIH AKTIF (OPEN)';

  const printedAtStr = new Date(report.generated_at).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const diff = report.shift.cash_difference ?? 0;
  let varianceLabel = 'MATCH / SESUAI (Rp 0)';
  let varianceColor = '#000';
  if (diff > 0) {
    varianceLabel = `SURPLUS / LEBIH (+${formatIDR(diff)})`;
  } else if (diff < 0) {
    varianceLabel = `DEFISIT / KURANG (${formatIDR(diff)})`;
    varianceColor = '#d32f2f';
  }

  const movementsHtml =
    report.movements && report.movements.length > 0
      ? `
    <div style="border-top: 1px dashed #000; margin: 8px 0; padding-top: 6px;">
      <div style="font-weight: bold; text-align: center; margin-bottom: 4px;">RINCIAN KAS MASUK / KELUAR</div>
      ${report.movements
        .map(
          (m) => `
        <div style="display: flex; justify-content: space-between; font-size: ${is80mm ? '11px' : '9px'}; margin-bottom: 3px;">
          <span>[${m.movement_type === 'PAID_IN' ? 'KAS MASUK' : 'KAS KELUAR'}] ${m.reason}</span>
          <span style="font-weight: bold;">${m.movement_type === 'PAID_IN' ? '+' : '-'}${formatIDR(m.amount)}</span>
        </div>
      `
        )
        .join('')}
    </div>
  `
      : '';

  const signatureHtml = isZReport
    ? `
    <div style="border-top: 1px dashed #000; margin-top: 15px; padding-top: 10px;">
      <div style="display: flex; justify-content: space-between; text-align: center; font-size: ${is80mm ? '11px' : '9px'};">
        <div style="width: 45%;">
          <div>Kasir Bertugas</div>
          <div style="height: 40px;"></div>
          <div style="border-top: 1px solid #000;">${report.shift.cashier_name || 'Kasir'}</div>
        </div>
        <div style="width: 45%;">
          <div>Supervisor / Saksi</div>
          <div style="height: 40px;"></div>
          <div style="border-top: 1px solid #000;">${report.shift.supervisor_name || 'Supervisor'}</div>
        </div>
      </div>
    </div>
  `
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title} - ${report.shift.shift_number}</title>
  <style>
    @page {
      size: ${paperWidth} auto;
      margin: 0;
    }
    body {
      font-family: 'Courier New', Courier, monospace, monospace;
      width: ${bodyWidth};
      margin: 0 auto;
      padding: 8px 0;
      color: #000;
      background: #fff;
      font-size: ${baseFontSize};
      line-height: 1.3;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-bold { font-weight: bold; }
    .divider {
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .double-divider {
      border-top: 2px solid #000;
      margin: 6px 0;
    }
    .flex-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
    }
  </style>
</head>
<body>
  <div class="text-center">
    <div style="font-size: ${headerFontSize}; font-weight: bold;">${restaurantName}</div>
    <div style="font-size: ${is80mm ? '10px' : '8px'};">${restaurantAddress}</div>
  </div>

  <div class="divider"></div>
  <div class="text-center font-bold" style="font-size: ${is80mm ? '13px' : '11px'};">${title}</div>
  <div class="text-center" style="font-size: ${is80mm ? '10px' : '8px'};">${subtitle}</div>
  <div class="divider"></div>

  <div class="flex-row">
    <span>No. Shift:</span>
    <span class="font-bold">${report.shift.shift_number}</span>
  </div>
  <div class="flex-row">
    <span>Shift:</span>
    <span>${report.shift.shift_name}</span>
  </div>
  <div class="flex-row">
    <span>Kasir:</span>
    <span class="font-bold">${report.shift.cashier_name || '-'}</span>
  </div>
  <div class="flex-row">
    <span>SPV Shift:</span>
    <span>${report.shift.supervisor_name || '-'}</span>
  </div>
  <div class="flex-row">
    <span>Buka Shift:</span>
    <span>${openedDateStr}</span>
  </div>
  <div class="flex-row">
    <span>Tutup Shift:</span>
    <span>${closedDateStr}</span>
  </div>

  <div class="divider"></div>
  <div class="text-center font-bold">RINGKASAN PENJUALAN</div>
  <div class="divider"></div>

  <div class="flex-row">
    <span>Total Transaksi:</span>
    <span class="font-bold">${report.shift.total_transactions} Bill</span>
  </div>
  <div class="flex-row">
    <span>Penjualan Kotor (Gross):</span>
    <span>${formatIDR(report.shift.gross_sales)}</span>
  </div>
  <div class="flex-row">
    <span>Diskon & Voucher:</span>
    <span>-${formatIDR(report.shift.discounts)}</span>
  </div>
  <div class="flex-row">
    <span>Pajak Resto PB1 (10%):</span>
    <span>${formatIDR(report.shift.tax_pb1)}</span>
  </div>
  <div class="flex-row">
    <span>Service Charge:</span>
    <span>${formatIDR(report.shift.service_charge)}</span>
  </div>
  <div class="double-divider"></div>
  <div class="flex-row font-bold" style="font-size: ${is80mm ? '13px' : '11px'};">
    <span>PENJUALAN BERSIH:</span>
    <span>${formatIDR(report.shift.net_sales)}</span>
  </div>
  <div class="double-divider"></div>

  <div class="text-center font-bold" style="margin-top: 6px;">RINCIAN METODE PEMBAYARAN</div>
  <div class="divider"></div>
  <div class="flex-row">
    <span>Tunai (Cash):</span>
    <span class="font-bold">${formatIDR(report.shift.payment_cash)}</span>
  </div>
  <div class="flex-row">
    <span>QRIS Dinamis/Statis:</span>
    <span>${formatIDR(report.shift.payment_qris)}</span>
  </div>
  <div class="flex-row">
    <span>EDC Debit / Kredit:</span>
    <span>${formatIDR(report.shift.payment_card)}</span>
  </div>
  <div class="flex-row">
    <span>Transfer Bank:</span>
    <span>${formatIDR(report.shift.payment_transfer)}</span>
  </div>

  <div class="divider"></div>
  <div class="text-center font-bold">REKONSILIASI LACI UANG (CASH DRAWER)</div>
  <div class="divider"></div>
  <div class="flex-row">
    <span>Modal Awal (Float):</span>
    <span>${formatIDR(report.shift.opening_cash)}</span>
  </div>
  <div class="flex-row">
    <span>(+) Penjualan Tunai:</span>
    <span>${formatIDR(report.shift.payment_cash)}</span>
  </div>
  <div class="flex-row">
    <span>(+) Kas Masuk (Paid-In):</span>
    <span>${formatIDR(report.shift.total_paid_in)}</span>
  </div>
  <div class="flex-row">
    <span>(-) Kas Keluar (Paid-Out):</span>
    <span>-${formatIDR(report.shift.total_paid_out)}</span>
  </div>
  <div class="divider"></div>
  <div class="flex-row font-bold">
    <span>(=) Kas Seharusnya di Laci:</span>
    <span>${formatIDR(report.shift.expected_cash)}</span>
  </div>

  ${
    isZReport
      ? `
  <div class="flex-row font-bold" style="font-size: ${is80mm ? '13px' : '11px'}; margin-top: 4px;">
    <span>Hitungan Fisik Uang Kas:</span>
    <span>${formatIDR(report.shift.actual_cash ?? 0)}</span>
  </div>
  <div class="flex-row font-bold" style="color: ${varianceColor}; margin-top: 2px;">
    <span>Selisih (Variance):</span>
    <span>${varianceLabel}</span>
  </div>
  `
      : `
  <div class="text-center" style="font-size: ${is80mm ? '10px' : '8px'}; font-style: italic; margin-top: 4px;">
    * Audit berjalan mid-shift. Hitungan fisik dilakukan pada saat Tutup Shift (Z-Report).
  </div>
  `
  }

  ${movementsHtml}

  ${signatureHtml}

  <div class="divider" style="margin-top: 10px;"></div>
  <div class="text-center" style="font-size: ${is80mm ? '9px' : '8px'}; color: #555;">
    <div>Dicetak: ${printedAtStr} oleh ${report.generated_by}</div>
    <div>Sistem POS & Rekonsiliasi Kas Tropical F&B</div>
  </div>
</body>
</html>
  `;
}

/**
 * Prints Shift X-Report or Z-Report
 */
export function printThermalShiftReport(
  report: ShiftReport,
  options: ThermalPrintOptions = {}
): void {
  const html = generateThermalShiftReportHtml(report, options);
  triggerIframePrint(html);
}


