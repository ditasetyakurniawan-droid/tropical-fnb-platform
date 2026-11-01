export type EmploymentStatus = 'PERMANENT' | 'CONTRACT' | 'PROBATION'

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE' | 'SICK' | 'OFF'

export type AdvanceStatus = 'ACTIVE' | 'PAID_OFF' | 'CANCELLED'

export type PayrollRunStatus = 'DRAFT' | 'APPROVED' | 'PAID' | 'CANCELLED'

export interface PayrollPolicy {
  outlet_id: string
  outlet_code?: string
  outlet_name?: string
  geofence_latitude?: number
  geofence_longitude?: number
  geofence_radius_meters?: number
  pay_day: number
  working_days_basis: number
  late_grace_minutes: number
  late_deduction_per_minute: number
  overtime_divisor: number
  bpjs_kes_employee_bps: number
  bpjs_kes_employer_bps: number
  bpjs_kes_wage_cap: number
  bpjs_jht_employee_bps: number
  bpjs_jht_employer_bps: number
  bpjs_jp_employee_bps: number
  bpjs_jp_employer_bps: number
  bpjs_jp_wage_cap: number
  bpjs_jkk_employer_bps: number
  bpjs_jkm_employer_bps: number
  service_charge_employee_share_bps: number
  require_geofence: boolean
  is_reviewed: boolean
  updated_at: string
}

export interface ShiftDefinition {
  id: string
  outlet_id: string
  code: string
  name: string
  start_time: string
  end_time: string
}

export interface Employee {
  id: string
  tenant_id: string
  outlet_id: string
  outlet_code: string
  user_id?: string
  username?: string
  employee_code: string
  full_name: string
  position_title: string
  employment_status: EmploymentStatus
  join_date: string
  resign_date?: string
  base_salary: number
  position_allowance: number
  meal_allowance_per_day: number
  bpjs_enrolled: boolean
  service_charge_points: number
  default_shift_id?: string
  default_shift_code?: string
  bank_name?: string
  bank_account?: string
  is_active: boolean
  notes?: string
  active_kasbon_balance: number
}

export interface EmployeeInput {
  outlet_id: string
  user_id?: string | null
  employee_code: string
  full_name: string
  position_title: string
  employment_status: EmploymentStatus
  join_date: string
  resign_date?: string | null
  base_salary: number
  position_allowance: number
  meal_allowance_per_day: number
  bpjs_enrolled: boolean
  service_charge_points: number
  default_shift_id?: string | null
  bank_name?: string | null
  bank_account?: string | null
  is_active: boolean
  notes?: string | null
}

export interface AttendanceRecord {
  id: string
  tenant_id: string
  outlet_id: string
  employee_id: string
  employee_code: string
  employee_name: string
  work_date: string
  shift_id?: string
  shift_code?: string
  status: AttendanceStatus
  clock_in?: string
  clock_out?: string
  late_minutes: number
  overtime_minutes: number
  overtime_approved: boolean
  source: string
  clock_in_distance_m?: number
  notes?: string
}

export interface AttendanceInput {
  employee_id: string
  work_date: string
  shift_id?: string | null
  status: AttendanceStatus
  clock_in?: string | null
  clock_out?: string | null
  late_minutes: number
  overtime_minutes: number
  overtime_approved: boolean
  notes?: string | null
}

export interface ClockInInput {
  employee_id?: string
  latitude: number
  longitude: number
}

export interface EmployeeAdvance {
  id: string
  tenant_id: string
  outlet_id: string
  employee_id: string
  employee_code: string
  employee_name: string
  amount: number
  installment_amount: number
  remaining_balance: number
  status: AdvanceStatus
  issued_on: string
  reason?: string
  created_at: string
}

export interface AdvanceInput {
  employee_id: string
  amount: number
  installment_amount: number
  issued_on: string
  reason?: string | null
}

export interface PayrollRun {
  id: string
  tenant_id: string
  outlet_id: string
  outlet_code: string
  outlet_name: string
  period_year: number
  period_month: number
  period_start: string
  period_end: string
  pay_date: string
  status: PayrollRunStatus
  service_charge_collected: number
  service_charge_distributable: number
  service_charge_undistributed: number
  employee_count: number
  total_gross: number
  total_deductions: number
  total_net: number
  total_employer_contribution: number
  generated_by_name?: string
  generated_at: string
  approved_by_name?: string
  approved_at?: string
  paid_at?: string
}

export interface PayrollSlip {
  id: string
  tenant_id: string
  outlet_id: string
  run_id: string
  employee_id: string
  employee_code: string
  employee_name: string
  position_title: string
  days_present: number
  days_unexcused_absent: number
  late_minutes_raw: number
  late_minutes_effective: number
  overtime_minutes: number
  service_charge_points: number
  base_salary: number
  position_allowance: number
  meal_allowance: number
  overtime_pay: number
  service_charge_share: number
  gross_pay: number
  late_deduction: number
  absence_deduction: number
  bpjs_kesehatan: number
  bpjs_jht: number
  bpjs_jp: number
  kasbon_deduction: number
  total_deductions: number
  net_pay: number
  employer_bpjs_kesehatan: number
  employer_bpjs_jht: number
  employer_bpjs_jp: number
  employer_bpjs_jkk: number
  employer_bpjs_jkm: number
  employer_contribution: number
  warnings: string[]
}

export interface PayrollRunDetail extends PayrollRun {
  slips: PayrollSlip[]
}
