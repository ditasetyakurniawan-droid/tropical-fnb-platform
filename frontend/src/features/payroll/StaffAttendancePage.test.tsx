import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as payrollApi from './payroll-api'
import { StaffAttendancePage } from './StaffAttendancePage'
import type { AttendanceRecord, Employee, PayrollPolicy, ShiftDefinition } from './types'
import { useAuthStore } from '@/features/auth/auth-store'

vi.mock('./payroll-api', () => ({
  getPayrollPolicy: vi.fn(),
  listEmployees: vi.fn(),
  listShifts: vi.fn(),
  listAttendance: vi.fn(),
  clockInGps: vi.fn(),
  clockOutGps: vi.fn(),
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

const SAMPLE_POLICY: PayrollPolicy = {
  outlet_id: OUTLET_TSH.id,
  outlet_code: 'TSH-01',
  outlet_name: 'Tropical Steak House',
  geofence_latitude: -7.31642,
  geofence_longitude: 110.17583,
  geofence_radius_meters: 500,
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
  is_reviewed: true,
  updated_at: '2026-10-01T00:00:00Z',
}

const SAMPLE_SHIFTS: ShiftDefinition[] = [
  { id: 'sh-1', outlet_id: OUTLET_TSH.id, code: 'PAGI', name: 'Shift Pagi', start_time: '08:00', end_time: '16:00' },
  { id: 'sh-2', outlet_id: OUTLET_TSH.id, code: 'MALAM', name: 'Shift Malam', start_time: '15:00', end_time: '23:00' },
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
    service_charge_points: 120,
    default_shift_id: 'sh-1',
    is_active: true,
    active_kasbon_balance: 0,
  },
  {
    id: 'emp-2',
    tenant_id: 'ten-1',
    outlet_id: OUTLET_TSH.id,
    outlet_code: 'TSH-01',
    employee_code: 'TSH-005',
    full_name: 'Dimas Prasetyo',
    position_title: 'Waiter / Server',
    employment_status: 'CONTRACT',
    join_date: '2024-03-01',
    base_salary: 2200000,
    position_allowance: 200000,
    meal_allowance_per_day: 25000,
    bpjs_enrolled: true,
    service_charge_points: 100,
    default_shift_id: 'sh-2',
    is_active: true,
    active_kasbon_balance: 400000,
  },
]

const SAMPLE_ATTENDANCE: AttendanceRecord[] = [
  {
    id: 'att-1',
    tenant_id: 'ten-1',
    outlet_id: OUTLET_TSH.id,
    employee_id: 'emp-1',
    employee_code: 'TSH-001',
    employee_name: 'Hendra Kusuma',
    work_date: '2026-10-24',
    shift_id: 'sh-1',
    shift_code: 'PAGI',
    status: 'PRESENT',
    clock_in: '2026-10-24T07:55:00Z',
    late_minutes: 0,
    overtime_minutes: 0,
    overtime_approved: false,
    source: 'GPS_MOBILE',
    clock_in_distance_m: 25,
  },
]

describe('StaffAttendancePage (/absen)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'u-1',
        tenant_id: 'ten-1',
        username: 'staff-waiter',
        full_name: 'Dimas Prasetyo',
        email: 'dimas@tropical.local',
        is_active: true,
      },
      roles: [{ role_code: 'WAITER', role_name: 'Floor Waiter' }],
      accessibleOutlets: [OUTLET_TSH],
      isGlobalAllOutlets: false,
      activeOutletId: OUTLET_TSH.id,
    })

    vi.mocked(payrollApi.getPayrollPolicy).mockResolvedValue(SAMPLE_POLICY)
    vi.mocked(payrollApi.listEmployees).mockResolvedValue(SAMPLE_EMPLOYEES)
    vi.mocked(payrollApi.listShifts).mockResolvedValue(SAMPLE_SHIFTS)
    vi.mocked(payrollApi.listAttendance).mockResolvedValue(SAMPLE_ATTENDANCE)
  })

  it('renders kiosk page with live clock, restaurant name, geofence status, and staff list', async () => {
    render(
      <MemoryRouter>
        <StaffAttendancePage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('TERMINAL ABSENSI MANDIRI STAF (KIOSK & MOBILE)')).toBeInTheDocument()
      expect(screen.getByText('Tropical Steak House')).toBeInTheDocument()
      expect(screen.getByText(/Radius Geofence: 500m/i)).toBeInTheDocument()
      expect(screen.getByText('CLOCK-IN (ABSEN MASUK)')).toBeInTheDocument()
      expect(screen.getByText('CLOCK-OUT (ABSEN PULANG)')).toBeInTheDocument()
    })

    // Strict floor privacy: ensure no financial / salary text appears
    expect(screen.queryByText(/Gaji Pokok/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Take-Home Pay/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Buku Kasbon/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/4500000/i)).not.toBeInTheDocument()
  })

  it('allows clocking in with GPS when within geofence radius', async () => {
    const user = userEvent.setup()
    vi.mocked(payrollApi.clockInGps).mockResolvedValue({
      id: 'att-new',
      tenant_id: 'ten-1',
      outlet_id: OUTLET_TSH.id,
      employee_id: 'emp-2',
      employee_code: 'TSH-005',
      employee_name: 'Dimas Prasetyo',
      work_date: '2026-10-24',
      status: 'PRESENT',
      clock_in: '2026-10-24T08:00:00Z',
      late_minutes: 0,
      overtime_minutes: 0,
      overtime_approved: false,
      source: 'GPS_MOBILE',
      clock_in_distance_m: 20,
    })

    render(
      <MemoryRouter>
        <StaffAttendancePage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Dimas Prasetyo/i })).toBeInTheDocument()
    })

    // Select Dimas Prasetyo
    const select = screen.getByLabelText(/Karyawan \/ Staf Restoran/i)
    await user.selectOptions(select, 'emp-2')

    // Click Clock-In
    const clockInBtn = screen.getByRole('button', { name: /CLOCK-IN \(ABSEN MASUK\)/i })
    await user.click(clockInBtn)

    expect(payrollApi.clockInGps).toHaveBeenCalledWith({
      employee_id: 'emp-2',
      latitude: expect.any(Number),
      longitude: expect.any(Number),
    })

    await waitFor(() => {
      expect(screen.getByText(/Selamat Bekerja, Dimas Prasetyo!/i)).toBeInTheDocument()
    })
  })

  it('handles clock-out action successfully', async () => {
    const user = userEvent.setup()
    vi.mocked(payrollApi.clockOutGps).mockResolvedValue({
      id: 'att-out',
      tenant_id: 'ten-1',
      outlet_id: OUTLET_TSH.id,
      employee_id: 'emp-1',
      employee_code: 'TSH-001',
      employee_name: 'Hendra Kusuma',
      work_date: '2026-10-24',
      status: 'PRESENT',
      clock_in: '2026-10-24T07:55:00Z',
      clock_out: '2026-10-24T16:05:00Z',
      late_minutes: 0,
      overtime_minutes: 30,
      overtime_approved: false,
      source: 'GPS_MOBILE',
    })

    render(
      <MemoryRouter>
        <StaffAttendancePage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /CLOCK-OUT \(ABSEN PULANG\)/i })).toBeInTheDocument()
    })

    const clockOutBtn = screen.getByRole('button', { name: /CLOCK-OUT \(ABSEN PULANG\)/i })
    await user.click(clockOutBtn)

    expect(payrollApi.clockOutGps).toHaveBeenCalled()

    await waitFor(() => {
      expect(screen.getByText(/Terima Kasih, Hendra Kusuma!/i)).toBeInTheDocument()
      expect(screen.getByText(/Lembur tercatat: 30 menit/i)).toBeInTheDocument()
    })
  })

  it('blocks clock-in when user is simulated outside the geofence radius', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <StaffAttendancePage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Tropical Steak House')).toBeInTheDocument()
    })

    // Click Simulate outside shop (900m)
    const simOutsideBtn = screen.getByRole('button', { name: /Simulasi Luar Jangkauan \(900m\)/i })
    await user.click(simOutsideBtn)

    // The Clock-In button should now be disabled or marked outside geofence
    await waitFor(() => {
      expect(screen.getByText(/DI LUAR RADIUS \(MAKS 500m\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Tidak bisa absen: Anda di luar radius 500m/i)).toBeInTheDocument()
    })

    const clockInBtn = screen.getByRole('button', { name: /CLOCK-IN \(ABSEN MASUK\)/i })
    expect(clockInBtn).toBeDisabled()
  })
})
