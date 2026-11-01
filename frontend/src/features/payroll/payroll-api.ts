import type {
  AdvanceInput,
  AttendanceInput,
  AttendanceRecord,
  ClockInInput,
  Employee,
  EmployeeAdvance,
  EmployeeInput,
  PayrollPolicy,
  PayrollRun,
  PayrollRunDetail,
  ShiftDefinition,
} from './types'
import { api } from '@/shared/api/client'

export async function getPayrollPolicy(outletId: string, signal?: AbortSignal): Promise<PayrollPolicy> {
  return api.request<PayrollPolicy>(`/api/v1/hr/policy?outlet_id=${encodeURIComponent(outletId)}`, {
    ...(signal ? { signal } : {}),
  })
}

export async function updatePayrollPolicy(policy: Partial<PayrollPolicy> & { outlet_id: string }): Promise<PayrollPolicy> {
  return api.request<PayrollPolicy>('/api/v1/hr/policy', {
    method: 'PUT',
    body: policy,
  })
}

export async function listShifts(outletId: string, signal?: AbortSignal): Promise<ShiftDefinition[]> {
  const res = await api.requestList<ShiftDefinition>(`/api/v1/hr/shifts?outlet_id=${encodeURIComponent(outletId)}`, {
    ...(signal ? { signal } : {}),
  })
  return res ?? []
}

export async function listEmployees(
  outletId: string,
  includeInactive = true,
  signal?: AbortSignal,
): Promise<Employee[]> {
  const params = new URLSearchParams({
    outlet_id: outletId,
    include_inactive: includeInactive ? 'true' : 'false',
  })
  const res = await api.requestList<Employee>(`/api/v1/hr/employees?${params.toString()}`, {
    ...(signal ? { signal } : {}),
  })
  return res ?? []
}

export async function createEmployee(input: EmployeeInput): Promise<Employee> {
  return api.request<Employee>('/api/v1/hr/employees', {
    method: 'POST',
    body: input,
  })
}

export async function updateEmployee(id: string, input: EmployeeInput): Promise<Employee> {
  return api.request<Employee>(`/api/v1/hr/employees/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: input,
  })
}

export async function listAttendance(
  outletId: string,
  fromDate: string,
  toDate: string,
  signal?: AbortSignal,
): Promise<AttendanceRecord[]> {
  const params = new URLSearchParams({
    outlet_id: outletId,
    from: fromDate,
    to: toDate,
  })
  const res = await api.requestList<AttendanceRecord>(`/api/v1/hr/attendance?${params.toString()}`, {
    ...(signal ? { signal } : {}),
  })
  return res ?? []
}

export async function upsertAttendance(input: AttendanceInput): Promise<AttendanceRecord> {
  return api.request<AttendanceRecord>('/api/v1/hr/attendance', {
    method: 'POST',
    body: input,
  })
}

export async function setOvertimeApproval(attendanceId: string, approved: boolean): Promise<AttendanceRecord> {
  return api.request<AttendanceRecord>(`/api/v1/hr/attendance/${encodeURIComponent(attendanceId)}/overtime`, {
    method: 'PATCH',
    body: { approved },
  })
}

export async function clockInGps(input: ClockInInput): Promise<AttendanceRecord> {
  return api.request<AttendanceRecord>('/api/v1/hr/attendance/clock-in', {
    method: 'POST',
    body: input,
  })
}

export async function clockOutGps(employeeId?: string): Promise<AttendanceRecord> {
  return api.request<AttendanceRecord>('/api/v1/hr/attendance/clock-out', {
    method: 'POST',
    body: employeeId ? { employee_id: employeeId } : {},
  })
}

export async function listAdvances(
  outletId: string,
  onlyActive = false,
  signal?: AbortSignal,
): Promise<EmployeeAdvance[]> {
  const params = new URLSearchParams({
    outlet_id: outletId,
    only_active: onlyActive ? 'true' : 'false',
  })
  const res = await api.requestList<EmployeeAdvance>(`/api/v1/hr/advances?${params.toString()}`, {
    ...(signal ? { signal } : {}),
  })
  return res ?? []
}

export async function createAdvance(input: AdvanceInput): Promise<EmployeeAdvance> {
  return api.request<EmployeeAdvance>('/api/v1/hr/advances', {
    method: 'POST',
    body: input,
  })
}

export async function cancelAdvance(advanceId: string): Promise<EmployeeAdvance> {
  return api.request<EmployeeAdvance>(`/api/v1/hr/advances/${encodeURIComponent(advanceId)}/cancel`, {
    method: 'POST',
  })
}

export async function listPayrollRuns(outletId: string, signal?: AbortSignal): Promise<PayrollRun[]> {
  const res = await api.requestList<PayrollRun>(`/api/v1/hr/payroll/runs?outlet_id=${encodeURIComponent(outletId)}`, {
    ...(signal ? { signal } : {}),
  })
  return res ?? []
}

export async function getPayrollRunDetail(runId: string, signal?: AbortSignal): Promise<PayrollRunDetail> {
  const res = await api.request<PayrollRunDetail>(`/api/v1/hr/payroll/runs/${encodeURIComponent(runId)}`, {
    ...(signal ? { signal } : {}),
  })
  return {
    ...res,
    slips: res?.slips ?? [],
  }
}

export async function generatePayrollRun(
  outletId: string,
  year: number,
  month: number,
): Promise<PayrollRunDetail> {
  const res = await api.request<PayrollRunDetail>('/api/v1/hr/payroll/runs', {
    method: 'POST',
    body: {
      outlet_id: outletId,
      year,
      month,
    },
  })
  return {
    ...res,
    slips: res?.slips ?? [],
  }
}

export async function approvePayrollRun(runId: string): Promise<PayrollRun> {
  return api.request<PayrollRun>(`/api/v1/hr/payroll/runs/${encodeURIComponent(runId)}/approve`, {
    method: 'POST',
  })
}

export async function markPayrollRunPaid(runId: string): Promise<PayrollRun> {
  return api.request<PayrollRun>(`/api/v1/hr/payroll/runs/${encodeURIComponent(runId)}/pay`, {
    method: 'POST',
  })
}

export async function cancelPayrollRun(runId: string): Promise<PayrollRun> {
  return api.request<PayrollRun>(`/api/v1/hr/payroll/runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
  })
}
