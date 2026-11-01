import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShiftStatusWidget } from './ShiftStatusWidget';
import { ShiftOpenModal } from './ShiftOpenModal';
import { ShiftCloseModal } from './ShiftCloseModal';
import { generateThermalShiftReportHtml } from './thermal-printer';
import type { CashierShift, ShiftReport } from './types';

const mockShift: CashierShift = {
  id: '01a173b5-6e73-7727-b3b1-f9a2981dbf4e',
  tenant_id: '01a16ca4-7709-7b43-8af9-cf41da3c78d6',
  outlet_id: '01a16ca4-770a-7f46-9216-79dd3612a375',
  outlet_code: 'TSH-01',
  outlet_name: 'Tropical Steak House',
  shift_number: 'SHF-TSH-20261025-001',
  cashier_user_id: '01a16ca4-7713-7f11-b276-da30fd6ebedc',
  cashier_name: 'Siti Rahma (Kasir Steak)',
  supervisor_user_id: '01a16ca4-7713-7163-bd87-fd96b53164ab',
  supervisor_name: 'Rian Pratama (SPV Steak)',
  shift_name: 'SHIFT_PAGI',
  status: 'OPEN',
  opened_at: '2026-10-25T07:00:00Z',
  opening_cash: 250000,
  expected_cash: 443600,
  cash_difference: 0,
  total_transactions: 3,
  gross_sales: 176000,
  discounts: 0,
  net_sales: 193600,
  tax_pb1: 17600,
  service_charge: 0,
  payment_cash: 193600,
  payment_qris: 0,
  payment_card: 0,
  payment_transfer: 0,
  total_paid_in: 0,
  total_paid_out: 0,
  created_at: '2026-10-25T07:00:00Z',
  updated_at: '2026-10-25T07:00:00Z',
};

describe('Shift Management & Cash Drawer Reconciliation', () => {
  it('renders ShiftStatusWidget when shift is OPEN with badge, drawer totals and action buttons', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const onMove = vi.fn();
    const onX = vi.fn();

    render(
      <ShiftStatusWidget
        shift={mockShift}
        isOpen={true}
        isLoading={false}
        onOpenShiftClick={onOpen}
        onCloseShiftClick={onClose}
        onCashMovementClick={onMove}
        onXReportClick={onX}
      />
    );

    expect(screen.getByText('SHIFT PAGI')).toBeInTheDocument();
    expect(screen.getByText('SHF-TSH-20261025-001')).toBeInTheDocument();
    expect(screen.getByText('Siti Rahma (Kasir Steak)')).toBeInTheDocument();
    expect(screen.getByText('Audit X-Report')).toBeInTheDocument();
    expect(screen.getByText('Kas Masuk / Keluar')).toBeInTheDocument();
    expect(screen.getByText('Tutup Shift (Z-Report)')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Audit X-Report'));
    expect(onX).toHaveBeenCalled();
  });

  it('renders ShiftStatusWidget when shift is NOT open and allows opening new shift', () => {
    const onOpen = vi.fn();
    render(
      <ShiftStatusWidget
        shift={null}
        isOpen={false}
        isLoading={false}
        onOpenShiftClick={onOpen}
        onCloseShiftClick={vi.fn()}
        onCashMovementClick={vi.fn()}
        onXReportClick={vi.fn()}
      />
    );

    expect(screen.getByText('Shift Kasir Belum Dibuka')).toBeInTheDocument();
    const openBtn = screen.getByText('Buka Shift Kasir Baru');
    expect(openBtn).toBeInTheDocument();
    fireEvent.click(openBtn);
    expect(onOpen).toHaveBeenCalled();
  });

  it('allows filling opening cash float and submitting ShiftOpenModal', async () => {
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <ShiftOpenModal
        isOpen={true}
        outletId="01a16ca4-770a-7f46-9216-79dd3612a375"
        outletName="Tropical Steak House"
        defaultOpeningCash={250000}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByText('Buka Shift Kasir Baru')).toBeInTheDocument();
    const submitBtn = screen.getByText('Buka Shift Sekarang');
    fireEvent.click(submitBtn);

    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          outlet_id: '01a16ca4-770a-7f46-9216-79dd3612a375',
          shift_name: 'SHIFT_PAGI',
          opening_cash: 250000,
        })
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('calculates cash variance (shortage/overage) in ShiftCloseModal and strips leading zero', async () => {
    const onConfirmClose = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <ShiftCloseModal
        isOpen={true}
        shift={mockShift}
        onClose={onClose}
        onConfirmClose={onConfirmClose}
      />
    );

    expect(screen.getByText(/Tutup Shift & Rekonsiliasi Kas \(Z-Report\)/)).toBeInTheDocument();
    expect(screen.getByText(/Status: UANG PAS \/ SESUAI SISTEM/)).toBeInTheDocument();

    // Change actual cash to less than expected (deficit), including a leading zero
    const input = screen.getByPlaceholderText('Masukkan total uang nyata di laci') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0400000' } });
    expect(input.value).toBe('400000');

    expect(screen.getByText(/Status: UANG KURANG \(SELISIH KURANG\)/)).toBeInTheDocument();

    // Confirm close
    const submitBtn = screen.getByText('Tutup Shift & Finalkan Z-Report');
    fireEvent.click(submitBtn);

    await vi.waitFor(() => {
      expect(onConfirmClose).toHaveBeenCalledWith(
        expect.objectContaining({
          actual_cash: 400000,
        })
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('generates thermal printer ESC/POS HTML for X-Report and Z-Report with correct headers and reconciliation', () => {
    const report: ShiftReport = {
      shift: mockShift,
      movements: [
        {
          id: 'mv-01',
          tenant_id: mockShift.tenant_id,
          shift_id: mockShift.id,
          movement_type: 'PAID_OUT',
          amount: 50000,
          reason: 'Beli es batu kristal darurat',
          created_at: '2026-10-25T09:00:00Z',
        },
      ],
      report_type: 'Z_REPORT',
      generated_at: '2026-10-25T14:00:00Z',
      generated_by: 'kasir_steak',
    };

    const html80 = generateThermalShiftReportHtml(report, { paperWidth: '80mm' });
    expect(html80).toContain('TROPICAL STEAK HOUSE');
    expect(html80).toContain('LAPORAN Z (PENUTUPAN SHIFT)');
    expect(html80).toContain('SHF-TSH-20261025-001');
    expect(html80).toContain('Beli es batu kristal darurat');
    expect(html80).toContain('Kasir Bertugas');
    expect(html80).toContain('Supervisor / Saksi');

    const html58 = generateThermalShiftReportHtml({ ...report, report_type: 'X_REPORT' }, { paperWidth: '58mm' });
    expect(html58).toContain('LAPORAN X (AUDIT TENGAH SHIFT)');
    expect(html58).toContain('MID-SHIFT AUDIT (NON-RESET)');
  });
});
