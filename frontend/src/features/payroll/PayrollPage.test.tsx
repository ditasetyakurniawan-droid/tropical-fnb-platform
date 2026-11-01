import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as payrollApi from './payroll-api'
import { PayrollPage } from './PayrollPage'
import type { Employee, EmployeeAdvance, PayrollPolicy, PayrollRunDetail, ShiftDefinition } from './types'
import { useAuthStore } from '@/features/auth/auth-store'

vi.mock('./payroll-api', () => ({
  getPayrollPolicy: vi.fn(),
  updatePayrollPolicy: vi.fn(),
  listShifts: vi.fn(),
  listEmployees: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  listAttendance: vi.fn(),
  upsertAttendance: vi.fn(),
  setOvertimeApproval: vi.fn(),
  clockInGps: vi.fn(),
  clockOutGps: vi.fn(),
  listAdvances: vi.fn(),
  createAdvance: vi.fn(),
  cancelAdvance: vi.fn(),
  listPayrollRuns: vi.fn(),
  getPayrollRunDetail: vi.fn(),
  generatePayrollRun: vi.fn(),
  approvePayrollRun: vi.fn(),
  markPayrollRunPaid: vi.fn(),
  cancelPayrollRun: vi.fn(),
}))

const OUTLET_TSH = {
  id: '01a16ca4-770a-7f46-9216-79dd3612a375',
  code: 'TSH-01',
  slug: 'tropical-steak-house',
  name: 'Tropical Steak House',
  outlet_type: 'RESTAURANT',
  tax_pb1_percent: 10,
  service_charge_percent: 0,
  address: 'Jl. Gatot Subroto, Temanggung',
}

const OUTLET_TGR = {
  id: '01a16ca4-770c-7143-80f4-2c8ece46d467',
  code: 'TGR-01',
  slug: 'tropical-garden-resto',
  name: 'Tropical Garden Resto',
  outlet_type: 'RESTAURANT',
  tax_pb1_percent: 10,
  service_charge_percent: 0,
  address: 'Jl. Gatot Subroto, Temanggung',
}

const SAMPLE_POLICY: PayrollPolicy = {
  outlet_id: OUTLET_TSH.id,
  outlet_code: 'TSH-01',
  outlet_name: 'Tropical Steak House',
  geofence_latitude: -7.31642,
  geofence_longitude: 110.17583,
  geofence_radius_meters: 100,
  pay_day: 5,
  working_days_basis: 26,
  late_grace_minutes: 10,
  late_deduction_per_minute: 1000,
  overtime_divisor: 173,
  bpjs_kes_employee_bps: 100,
  bpjs_kes_employer_bps: 400,
  bpjs_kes_wage_cap: 12000000,
  bpjs_jht_employee_bps: 200,
  bpjs_jht_employer_bps: 370,
  bpjs_jp_employee_bps: 100,
  bpjs_jp_employer_bps: 200,
  bpjs_jp_wage_cap: 10547400,
  bpjs_jkk_employer_bps: 24,
  bpjs_jkm_employer_bps: 30,
  service_charge_employee_share_bps: 9000,
  require_geofence: true,
  is_reviewed: false,
  updated_at: '2026-10-01T00:00:00Z',
}

const SAMPLE_SHIFTS: ShiftDefinition[] = [
  { id: 'sh-1', outlet_id: OUTLET_TSH.id, code: 'PAGI', name: 'Shift Pagi', start_time: '08:00', end_time: '16:00' },
]

const SAMPLE_EMPLOYEES: Employee[] = [
  {
    id: 'emp-1',
    tenant_id: 'ten-1',
    outlet_id: OUTLET_TSH.id,
    outlet_code: 'TSH-01',
    employee_code: 'TSH-001',
    full_name: 'Hendra Kusuma',
    position_title: 'Head Chef & Butcher',
    employment_status: 'PERMANENT',
    join_date: '2024-01-10',
    base_salary: 4500000,
    position_allowance: 800000,
    meal_allowance_per_day: 25000,
    bpjs_enrolled: true,
    service_charge_points: 200,
    default_shift_id: 'sh-1',
    default_shift_code: 'PAGI',
    is_active: true,
    active_kasbon_balance: 0,
  },
  {
    id: 'emp-5',
    tenant_id: 'ten-1',
    outlet_id: OUTLET_TSH.id,
    outlet_code: 'TSH-01',
    employee_code: 'TSH-005',
    full_name: 'Dimas Prasetyo',
    position_title: 'Waiter / Server',
    employment_status: 'PERMANENT',
    join_date: '2025-02-01',
    base_salary: 2200000,
    position_allowance: 200000,
    meal_allowance_per_day: 25000,
    bpjs_enrolled: true,
    service_charge_points: 100,
    default_shift_id: 'sh-1',
    default_shift_code: 'PAGI',
    is_active: true,
    active_kasbon_balance: 600000,
  },
]

const SAMPLE_ADVANCES: EmployeeAdvance[] = [
  {
    id: 'adv-1',
    tenant_id: 'ten-1',
    outlet_id: OUTLET_TSH.id,
    employee_id: 'emp-5',
    employee_code: 'TSH-005',
    employee_name: 'Dimas Prasetyo',
    amount: 600000,
    installment_amount: 200000,
    remaining_balance: 600000,
    status: 'ACTIVE',
    issued_on: '2026-09-12',
    reason: 'Biaya servis motor operasional',
    created_at: '2026-09-12T08:00:00Z',
  },
]

const SAMPLE_RUN_DETAIL: PayrollRunDetail = {
  id: 'run-sep-2026',
  tenant_id: 'ten-1',
  outlet_id: OUTLET_TSH.id,
  outlet_code: 'TSH-01',
  outlet_name: 'Tropical Steak House',
  period_year: 2026,
  period_month: 9,
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  pay_date: '2026-10-05',
  status: 'DRAFT',
  service_charge_collected: 0,
  service_charge_distributable: 0,
  service_charge_undistributed: 0,
  employee_count: 2,
  total_gross: 8975000,
  total_deductions: 600308,
  total_net: 8374692,
  total_employer_contribution: 785420,
  generated_at: '2026-10-05T01:00:00Z',
  slips: [
    {
      id: 'slip-1',
      tenant_id: 'ten-1',
      outlet_id: OUTLET_TSH.id,
      run_id: 'run-sep-2026',
      employee_id: 'emp-1',
      employee_code: 'TSH-001',
      employee_name: 'Hendra Kusuma',
      position_title: 'Head Chef & Butcher',
      days_present: 26,
      days_unexcused_absent: 0,
      late_minutes_raw: 0,
      late_minutes_effective: 0,
      overtime_minutes: 0,
      service_charge_points: 200,
      base_salary: 4500000,
      position_allowance: 800000,
      meal_allowance: 650000,
      overtime_pay: 0,
      service_charge_share: 0,
      gross_pay: 5950000,
      late_deduction: 0,
      absence_deduction: 0,
      bpjs_kesehatan: 53000,
      bpjs_jht: 106000,
      bpjs_jp: 53000,
      kasbon_deduction: 0,
      total_deductions: 212000,
      net_pay: 5738000,
      employer_bpjs_kesehatan: 212000,
      employer_bpjs_jht: 196100,
      employer_bpjs_jp: 106000,
      employer_bpjs_jkk: 12720,
      employer_bpjs_jkm: 15900,
      employer_contribution: 542720,
      warnings: [],
    },
    {
      id: 'slip-5',
      tenant_id: 'ten-1',
      outlet_id: OUTLET_TSH.id,
      run_id: 'run-sep-2026',
      employee_id: 'emp-5',
      employee_code: 'TSH-005',
      employee_name: 'Dimas Prasetyo',
      position_title: 'Waiter / Server',
      days_present: 25,
      days_unexcused_absent: 1,
      late_minutes_raw: 0,
      late_minutes_effective: 0,
      overtime_minutes: 0,
      service_charge_points: 100,
      base_salary: 2200000,
      position_allowance: 200000,
      meal_allowance: 625000,
      overtime_pay: 0,
      service_charge_share: 0,
      gross_pay: 3025000,
      late_deduction: 0,
      absence_deduction: 92308,
      bpjs_kesehatan: 24000,
      bpjs_jht: 48000,
      bpjs_jp: 24000,
      kasbon_deduction: 200000,
      total_deductions: 388308,
      net_pay: 2636692,
      employer_bpjs_kesehatan: 96000,
      employer_bpjs_jht: 88800,
      employer_bpjs_jp: 48000,
      employer_bpjs_jkk: 5760,
      employer_bpjs_jkm: 7200,
      employer_contribution: 245760,
      warnings: [],
    },
  ],
}

describe('PayrollPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'u-1',
        tenant_id: 'ten-1',
        username: 'owner',
        full_name: 'Budi Santoso',
        email: 'owner@tropical.local',
        is_active: true,
      },
      roles: [{ role_code: 'OWNER', role_name: 'Owner / Direksi' }],
      accessibleOutlets: [OUTLET_TSH, OUTLET_TGR],
      isGlobalAllOutlets: true,
      activeOutletId: OUTLET_TSH.id,
    })

    vi.mocked(payrollApi.getPayrollPolicy).mockResolvedValue(SAMPLE_POLICY)
    vi.mocked(payrollApi.listShifts).mockResolvedValue(SAMPLE_SHIFTS)
    vi.mocked(payrollApi.listEmployees).mockResolvedValue(SAMPLE_EMPLOYEES)
    vi.mocked(payrollApi.listAdvances).mockResolvedValue(SAMPLE_ADVANCES)
    vi.mocked(payrollApi.listPayrollRuns).mockResolvedValue([SAMPLE_RUN_DETAIL])
    vi.mocked(payrollApi.getPayrollRunDetail).mockResolvedValue(SAMPLE_RUN_DETAIL)
    vi.mocked(payrollApi.listAttendance).mockResolvedValue([])
  })

  it('renders payroll slips for the selected outlet and opens the digital payslip modal', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <PayrollPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Hendra Kusuma')).toBeInTheDocument()
      expect(screen.getByText('Dimas Prasetyo')).toBeInTheDocument()
    })

    // Verify unreviewed policy transparency callout is visible
    expect(screen.getByText(/Tidak ada angka gaji atau potongan yang di-hardcode/i)).toBeInTheDocument()

    // Open Digital Payslip modal for Hendra Kusuma
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    const viewButtons = screen.getAllByRole('button', { name: /Lihat Slip Digital/i })
    await user.click(viewButtons[0]!)

    expect(screen.getByText('SLIP GAJI DIGITAL RESMI')).toBeInTheDocument()
    expect(screen.getByText('A. Komponen Penerimaan (Earnings)')).toBeInTheDocument()
    expect(screen.getByText('B. Komponen Potongan (Deductions)')).toBeInTheDocument()
    expect(document.getElementById('printable-payslip')).toBeInTheDocument()

    // Test print button triggers window.print()
    const printButtons = screen.getAllByText(/Cetak \/ Simpan PDF/i)
    expect(printButtons.length).toBeGreaterThan(0)
    await user.click(printButtons[0]!)
    expect(printSpy).toHaveBeenCalled()
    printSpy.mockRestore()
  })

  it('switches to Master Karyawan & Kasbon tab and displays employee salaries and active kasbon', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <PayrollPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Hendra Kusuma')).toBeInTheDocument()
    })

    const empTabBtn = screen.getByRole('button', { name: /3\. Master Karyawan & Kasbon/i })
    await user.click(empTabBtn)

    expect(screen.getByText(/Buku Kasbon Karyawan & Cicilan Otomatis/i)).toBeInTheDocument()
    expect(screen.getByText(/Biaya servis motor operasional/i)).toBeInTheDocument()
  })
})
