import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  Edit3,
  FileSpreadsheet,
  Lock,
  MapPin,
  Navigation,
  Plus,
  Printer,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  approvePayrollRun,
  cancelAdvance,
  clockInGps,
  clockOutGps,
  createAdvance,
  createEmployee,
  generatePayrollRun,
  getPayrollPolicy,
   getPayrollRunDetail,
  listAdvances,
  listAttendance,
  listEmployees,
  listPayrollRuns,
  listShifts,
  markPayrollRunPaid,
  setOvertimeApproval,
  updateEmployee,
  updatePayrollPolicy,
  upsertAttendance,
} from './payroll-api'
import type {
  AttendanceInput,
  AttendanceRecord,
  AttendanceStatus,
  Employee,
  EmployeeAdvance,
  EmployeeInput,
  EmploymentStatus,
  PayrollPolicy,
  PayrollRun,
  PayrollRunDetail,
  PayrollSlip,
  ShiftDefinition,
} from './types'
import type { ReactNode } from 'react'
import { useAuthStore } from '@/features/auth/auth-store'
import { ApiError } from '@/shared/api/client'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { NumberInput } from '@/shared/ui/NumberInput'
import { SmoothNumber } from '@/shared/ui/SmoothNumber'
import { cn } from '@/shared/lib/cn'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

function Badge({ variant = 'neutral', children }: { variant?: BadgeVariant; children: ReactNode }) {
  const styles: Record<BadgeVariant, string> = {
    success: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    warning: 'bg-amber-100 text-amber-900 border-amber-300',
    danger: 'bg-rose-100 text-rose-900 border-rose-300',
    info: 'bg-sky-100 text-sky-900 border-sky-300',
    neutral: 'bg-slate-100 text-slate-800 border-slate-300',
  }
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold tracking-wide ${styles[variant]}`}
    >
      {children}
    </span>
  )
}

const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

function formatRupiah(amount: number): string {
  return idrFormatter.format(amount)
}

type ActiveTab = 'payroll' | 'attendance' | 'employees' | 'policy'

const MONTH_OPTIONS = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Desember' },
]

function attendanceBadgeVariant(status: AttendanceStatus): BadgeVariant {
  switch (status) {
    case 'PRESENT':
      return 'success'
    case 'LATE':
      return 'warning'
    case 'ABSENT':
      return 'danger'
    case 'LEAVE':
    case 'SICK':
      return 'info'
    default:
      return 'neutral'
  }
}

function attendanceLabel(status: AttendanceStatus): string {
  switch (status) {
    case 'PRESENT':
      return 'HADIR TEPAT'
    case 'LATE':
      return 'TERLAMBAT'
    case 'ABSENT':
      return 'ALPHA (MANGKIR)'
    case 'LEAVE':
      return 'IZIN / CUTI'
    case 'SICK':
      return 'SAKIT'
    case 'OFF':
      return 'LIBUR SHIFT'
  }
}

export function PayrollPage() {
  const accessibleOutlets = useAuthStore((s) => s.accessibleOutlets)
  const activeOutletId = useAuthStore((s) => s.activeOutletId)
  const setActiveOutlet = useAuthStore((s) => s.setActiveOutletId)

  // Payroll is strictly per-outlet. If global selector is 'ALL', pick the first accessible outlet.
  const selectedOutlet = useMemo(() => {
    if (activeOutletId && activeOutletId !== 'ALL') {
      const found = accessibleOutlets.find((o) => o.id === activeOutletId)
      if (found) return found
    }
    return (
      accessibleOutlets.find((o) => o.code === 'TSH-01') ??
      accessibleOutlets[0] ?? {
        id: '01a16ca4-770a-7f46-9216-79dd3612a375',
        code: 'TSH-01',
        slug: 'tropical-steak-house',
        name: 'Tropical Steak House',
        outlet_type: 'RESTAURANT',
        tax_pb1_percent: 10,
        service_charge_percent: 0,
        address: 'Jl. Gatot Subroto, Temanggung',
      }
    )
  }, [accessibleOutlets, activeOutletId])

  const outletId = selectedOutlet.id

  const [activeTab, setActiveTab] = useState<ActiveTab>('payroll')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Core data states
  const [policy, setPolicy] = useState<PayrollPolicy | null>(null)
  const [shifts, setShifts] = useState<ShiftDefinition[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [advances, setAdvances] = useState<EmployeeAdvance[]>([])
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [activeRunDetail, setActiveRunDetail] = useState<PayrollRunDetail | null>(null)
  const [selectedSlip, setSelectedSlip] = useState<PayrollSlip | null>(null)

  // Payroll filter states (default to September 2026 where complete attendance is seeded)
  const [periodYear, setPeriodYear] = useState<number>(2026)
  const [periodMonth, setPeriodMonth] = useState<number>(9)
  const [slipSearch, setSlipSearch] = useState('')

  // Attendance filter states
  const [attFromDate, setAttFromDate] = useState('2026-09-01')
  const [attToDate, setAttToDate] = useState('2026-09-30')
  const [attEmployeeFilter, setAttEmployeeFilter] = useState<string>('ALL')
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([])

  // GPS Clock-In simulator states
  const [gpsEmployeeId, setGpsEmployeeId] = useState<string>('')
  const [gpsLat, setGpsLat] = useState<string>('-7.316420')
  const [gpsLng, setGpsLng] = useState<string>('110.175830')

  // Employee modal states
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [empForm, setEmpForm] = useState<EmployeeInput>({
    outlet_id: outletId,
    employee_code: '',
    full_name: '',
    position_title: '',
    employment_status: 'PERMANENT',
    join_date: '2025-01-10',
    base_salary: 2800000,
    position_allowance: 250000,
    meal_allowance_per_day: 25000,
    bpjs_enrolled: true,
    service_charge_points: 100,
    default_shift_id: null,
    bank_name: 'BRI',
    bank_account: '',
    is_active: true,
    notes: '',
  })

  // Kasbon modal & cancel confirmation state
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false)
  const [confirmCancelAdvId, setConfirmCancelAdvId] = useState<string | null>(null)
  const [advForm, setAdvForm] = useState({
    employee_id: '',
    amount: 600000,
    installment_amount: 200000,
    issued_on: '2026-09-15',
    reason: 'Pinjaman darurat kebutuhan keluarga',
  })

  // Manual attendance modal state
  const [isAttModalOpen, setIsAttModalOpen] = useState(false)
  const [attForm, setAttForm] = useState<AttendanceInput>({
    employee_id: '',
    work_date: '2026-09-28',
    shift_id: null,
    status: 'PRESENT',
    late_minutes: 0,
    overtime_minutes: 60,
    overtime_approved: true,
    notes: 'Lembur persiapan reservasi grup akhir pekan',
  })

  // Policy editable state
  const [policyForm, setPolicyForm] = useState<PayrollPolicy | null>(null)

  useEffect(() => {
    let isCancelled = false

    const fetchAll = async () => {
      try {
        const [pol, shList, empList, advList, runList, attList] = await Promise.all([
          getPayrollPolicy(outletId),
          listShifts(outletId),
          listEmployees(outletId, true),
          listAdvances(outletId, false),
          listPayrollRuns(outletId),
          listAttendance(outletId, attFromDate, attToDate),
        ])

        const matchingRun = runList.find((r) => r.period_year === periodYear && r.period_month === periodMonth)
        const detail = matchingRun ? await getPayrollRunDetail(matchingRun.id) : null

        if (isCancelled) return

        setPolicy(pol)
        setPolicyForm(pol)
        setShifts(shList)
        setEmployees(empList)
        setAdvances(advList)
        setRuns(runList)
        setAttendanceList(attList)
        setActiveRunDetail(detail)
        setErrorMsg(null)

        if (empList.length > 0) {
          setGpsEmployeeId((prev) => (empList.some((e) => e.id === prev) ? prev : empList[0]!.id))
        }
        if (pol.geofence_latitude && pol.geofence_longitude) {
          setGpsLat(String(pol.geofence_latitude))
          setGpsLng(String(pol.geofence_longitude))
        }
      } catch (err) {
        if (isCancelled) return
        if (err instanceof ApiError) {
          setErrorMsg(err.message)
        } else {
          setErrorMsg('Gagal memuat data HRIS & Payroll dari server.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void fetchAll()
    return () => {
      isCancelled = true
    }
  }, [outletId, periodYear, periodMonth, attFromDate, attToDate])

  // Computed KPI metrics
  const activeEmployeesCount = useMemo(() => employees.filter((e) => e.is_active).length, [employees])
  const activeKasbonTotal = useMemo(
    () => advances.filter((a) => a.status === 'ACTIVE').reduce((acc, a) => acc + a.remaining_balance, 0),
    [advances],
  )
  const filteredSlips = useMemo(() => {
    const list = activeRunDetail?.slips ?? []
    const q = slipSearch.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (s) =>
        s.employee_name.toLowerCase().includes(q) ||
        s.employee_code.toLowerCase().includes(q) ||
        s.position_title.toLowerCase().includes(q),
    )
  }, [activeRunDetail, slipSearch])

  const filteredAttendance = useMemo(() => {
    if (attEmployeeFilter === 'ALL') return attendanceList
    return attendanceList.filter((a) => a.employee_id === attEmployeeFilter)
  }, [attendanceList, attEmployeeFilter])

  // Handlers
  const handleGenerateRun = async () => {
    setIsSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const detail = await generatePayrollRun(outletId, periodYear, periodMonth)
      setActiveRunDetail(detail)
      const updatedRuns = await listPayrollRuns(outletId)
      setRuns(updatedRuns)
      setSuccessMsg(
        `Draft penggajian ${selectedOutlet.name} periode ${periodMonth}/${periodYear} berhasil dihitung (${detail.employee_count} slip karyawan).`,
      )
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal menghitung draft penggajian.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleApproveRun = async () => {
    if (!activeRunDetail) return
    setIsSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      await approvePayrollRun(activeRunDetail.id)
      const [detail, updatedRuns, updatedEmp, updatedAdv] = await Promise.all([
        getPayrollRunDetail(activeRunDetail.id),
        listPayrollRuns(outletId),
        listEmployees(outletId, true),
        listAdvances(outletId, false),
      ])
      setActiveRunDetail(detail)
      setRuns(updatedRuns)
      setEmployees(updatedEmp)
      setAdvances(updatedAdv)
      setSuccessMsg('Penggajian berhasil disetujui (APPROVED). Slip gaji terkunci & cicilan kasbon telah dipotong otomatis.')
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal menyetujui penggajian.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMarkPaid = async () => {
    if (!activeRunDetail) return
    setIsSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      await markPayrollRunPaid(activeRunDetail.id)
      const [detail, updatedRuns] = await Promise.all([
        getPayrollRunDetail(activeRunDetail.id),
        listPayrollRuns(outletId),
      ])
      setActiveRunDetail(detail)
      setRuns(updatedRuns)
      setSuccessMsg('Status penggajian ditandai LUNAS DITRANSFER (PAID).')
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal menandai lunas.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleOvertime = async (record: AttendanceRecord) => {
    setIsSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const updated = await setOvertimeApproval(record.id, !record.overtime_approved)
      setAttendanceList((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setSuccessMsg(
        `Status lembur ${record.employee_name} (${record.work_date}) diperbarui menjadi ${updated.overtime_approved ? 'DISETUJUI' : 'DITOLAK / BELUM DISETUJUI'}.`,
      )
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal mengubah persetujuan lembur.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClockInGps = async () => {
    if (!gpsEmployeeId) return
    setIsSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const rec = await clockInGps({
        employee_id: gpsEmployeeId,
        latitude: Number(gpsLat),
        longitude: Number(gpsLng),
      })
      const today = rec.work_date
      if (today > attToDate) {
        setAttToDate(today)
      }
      const refreshed = await listAttendance(outletId, attFromDate, today > attToDate ? today : attToDate)
      setAttendanceList(refreshed)
      setSuccessMsg(
        `Absen Masuk GPS berhasil untuk ${rec.employee_name} pada ${rec.work_date} (Jarak dari titik resto: ${rec.clock_in_distance_m ?? 0} meter, Status: ${rec.status}).`,
      )
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Absen Masuk GPS ditolak.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClockOutGps = async () => {
    if (!gpsEmployeeId) return
    setIsSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const rec = await clockOutGps(gpsEmployeeId)
      const refreshed = await listAttendance(outletId, attFromDate, attToDate)
      setAttendanceList(refreshed)
      setSuccessMsg(
        `Absen Pulang berhasil dicatat untuk ${rec.employee_name} (${rec.work_date}). Lembur tercatat: ${rec.overtime_minutes} menit.`,
      )
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal mencatat Absen Pulang.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const openCreateEmployeeModal = () => {
    const nextNumber = employees.length + 1
    const prefix = selectedOutlet.code === 'TGR-01' ? 'TGR' : 'TSH'
    setEditingEmployee(null)
    setEmpForm({
      outlet_id: outletId,
      employee_code: `${prefix}-00${nextNumber}`,
      full_name: '',
      position_title: 'Waiter / Server',
      employment_status: 'PERMANENT',
      join_date: '2026-01-15',
      base_salary: 2600000,
      position_allowance: 200000,
      meal_allowance_per_day: 25000,
      bpjs_enrolled: true,
      service_charge_points: 100,
      default_shift_id: shifts[0]?.id ?? null,
      bank_name: 'BRI',
      bank_account: '',
      is_active: true,
      notes: '',
    })
    setIsEmployeeModalOpen(true)
  }

  const openEditEmployeeModal = (emp: Employee) => {
    setEditingEmployee(emp)
    setEmpForm({
      outlet_id: emp.outlet_id,
      user_id: emp.user_id ?? null,
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      position_title: emp.position_title,
      employment_status: emp.employment_status,
      join_date: emp.join_date,
      resign_date: emp.resign_date ?? null,
      base_salary: emp.base_salary,
      position_allowance: emp.position_allowance,
      meal_allowance_per_day: emp.meal_allowance_per_day,
      bpjs_enrolled: emp.bpjs_enrolled,
      service_charge_points: emp.service_charge_points,
      default_shift_id: emp.default_shift_id ?? null,
      bank_name: emp.bank_name ?? '',
      bank_account: emp.bank_account ?? '',
      is_active: emp.is_active,
      notes: emp.notes ?? '',
    })
    setIsEmployeeModalOpen(true)
  }

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, empForm)
        setSuccessMsg(`Data & komponen gaji karyawan ${empForm.full_name} berhasil diperbarui.`)
      } else {
        await createEmployee({ ...empForm, outlet_id: outletId })
        setSuccessMsg(`Karyawan baru ${empForm.full_name} (${empForm.employee_code}) berhasil ditambahkan.`)
      }
      const updated = await listEmployees(outletId, true)
      setEmployees(updated)
      setIsEmployeeModalOpen(false)
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal menyimpan data karyawan.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateAdvance = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      await createAdvance({
        employee_id: advForm.employee_id,
        amount: Number(advForm.amount),
        installment_amount: Number(advForm.installment_amount),
        issued_on: advForm.issued_on,
        reason: advForm.reason,
      })
      const [updatedAdv, updatedEmp] = await Promise.all([
        listAdvances(outletId, false),
        listEmployees(outletId, true),
      ])
      setAdvances(updatedAdv)
      setEmployees(updatedEmp)
      setIsAdvanceModalOpen(false)
      setSuccessMsg('Kasbon karyawan berhasil dicatat dan akan dipotong otomatis saat penggajian.')
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal mencatat kasbon karyawan.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancelAdvance = async (advId: string) => {
    setIsSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      await cancelAdvance(advId)
      const [updatedAdv, updatedEmp] = await Promise.all([
        listAdvances(outletId, false),
        listEmployees(outletId, true),
      ])
      setAdvances(updatedAdv)
      setEmployees(updatedEmp)
      setConfirmCancelAdvId(null)
      setSuccessMsg('Kasbon berhasil dibatalkan.')
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal membatalkan kasbon.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSaveManualAttendance = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      await upsertAttendance(attForm)
      const refreshed = await listAttendance(outletId, attFromDate, attToDate)
      setAttendanceList(refreshed)
      setIsAttModalOpen(false)
      setSuccessMsg(`Data absensi manual tanggal ${attForm.work_date} berhasil disimpan.`)
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal menyimpan koreksi absensi.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!policyForm) return
    setIsSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const saved = await updatePayrollPolicy({
        ...policyForm,
        outlet_id: outletId,
      })
      setPolicy(saved)
      setPolicyForm(saved)
      setSuccessMsg(
        `Kebijakan & rumus penggajian ${selectedOutlet.name} berhasil disimpan ke database dan ditandai sudah direview Owner.`,
      )
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Gagal menyimpan kebijakan payroll.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 tropical-glass">
      {/* Header & Strict Outlet Separation Switcher */}
      <div data-spot="panel" className="bg-white/95 rounded-3xl p-6 shadow-sm border border-slate-200/90 transition-all">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info">MILESTONE 5 — HRIS & PAYROLL F&B</Badge>
              <Badge variant="neutral">GAJIAN TANGGAL {policy?.pay_day ?? 5}</Badge>
              <Badge variant="success">PRESISI INTEGER RUPIAH (0 FLOAT)</Badge>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-md shadow-emerald-500/20">
                <Users className="size-6" />
              </div>
              <div>
                <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
                  Manajemen SDM, Presensi GPS &amp; Penggajian — {selectedOutlet.name}
                </h1>
                <p className="mt-0.5 text-xs text-slate-600">
                  Roster karyawan, shift kerja, geofence GPS, kasbon, dan perhitungan slip gaji dipisahkan secara ketat per
                  unit restoran di bawah manajemen Tropical Group Temanggung.
                </p>
              </div>
            </div>
          </div>

          {/* Dedicated Per-Outlet Switcher */}
          <div className="flex flex-col gap-1.5 sm:items-end">
            <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
              Pilih Unit Restoran (Operasional Terpisah)
            </span>
            <div className="inline-flex rounded-xl border border-slate-200/90 bg-slate-100 p-1 shadow-2xs">
              {accessibleOutlets.map((o) => {
                const isSelected = o.id === selectedOutlet.id
                const isSteak = o.code === 'TSH-01'
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setActiveOutlet(o.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all cursor-pointer',
                      isSelected
                        ? 'bg-emerald-900 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-white/80 hover:text-slate-900'
                    )}
                  >
                    <span>{isSteak ? '🥩' : '🌿'}</span>
                    <span>{o.name}</span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 font-mono text-[10px]',
                        isSelected ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-200 text-slate-700'
                      )}
                    >
                      {o.code}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 4 Navigation Command Cards (The 4 interactive buttons with clear high-contrast affordance) */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Tab 1: Penggajian & Slip Gaji */}
          <button
            type="button"
            onClick={() => setActiveTab('payroll')}
            data-spot="workflow"
            data-active={activeTab === 'payroll'}
            aria-pressed={activeTab === 'payroll'}
            className={cn(
              'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
              activeTab === 'payroll'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/25 ring-2 ring-emerald-400/40 border-emerald-500'
                : 'bg-white hover:bg-emerald-50/40 border-slate-200/90 hover:border-emerald-300 text-slate-800 shadow-2xs'
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={cn(
                  'p-1.5 rounded-lg',
                  activeTab === 'payroll' ? 'bg-emerald-500/50 text-white' : 'bg-emerald-100 text-emerald-800'
                )}
              >
                <FileSpreadsheet className="size-4" />
              </div>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-bold rounded-full',
                  activeTab === 'payroll' ? 'bg-white text-emerald-700' : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                )}
              >
                Gajian Tgl {policy?.pay_day ?? 5}
              </span>
            </div>
            <div className="mt-2.5">
              <div className={cn('text-xs font-bold', activeTab === 'payroll' ? 'text-white' : 'text-slate-900')}>
                1. Penggajian &amp; Slip Gaji
              </div>
              <div className={cn('text-[11px] font-semibold', activeTab === 'payroll' ? 'text-emerald-100' : 'text-slate-600')}>
                Kalkulasi Gaji &amp; THP Bersih
              </div>
            </div>
          </button>

          {/* Tab 2: Presensi, Shift & Geofence GPS */}
          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            data-spot="workflow"
            data-active={activeTab === 'attendance'}
            aria-pressed={activeTab === 'attendance'}
            className={cn(
              'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
              activeTab === 'attendance'
                ? 'bg-gradient-to-r from-teal-600 to-teal-500 text-white shadow-md shadow-teal-500/25 ring-2 ring-teal-400/40 border-teal-500'
                : 'bg-white hover:bg-teal-50/40 border-slate-200/90 hover:border-teal-300 text-slate-800 shadow-2xs'
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={cn(
                  'p-1.5 rounded-lg',
                  activeTab === 'attendance' ? 'bg-teal-500/50 text-white' : 'bg-teal-100 text-teal-800'
                )}
              >
                <MapPin className="size-4" />
              </div>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-bold rounded-full',
                  activeTab === 'attendance' ? 'bg-white text-teal-700' : 'bg-teal-100 text-teal-900 border border-teal-200'
                )}
              >
                Geofence Valid
              </span>
            </div>
            <div className="mt-2.5">
              <div className={cn('text-xs font-bold', activeTab === 'attendance' ? 'text-white' : 'text-slate-900')}>
                2. Presensi, Shift &amp; GPS
              </div>
              <div className={cn('text-[11px] font-semibold', activeTab === 'attendance' ? 'text-teal-100' : 'text-slate-600')}>
                Validasi Radius &amp; Lembur
              </div>
            </div>
          </button>

          {/* Tab 3: Master Karyawan & Kasbon */}
          <button
            type="button"
            onClick={() => setActiveTab('employees')}
            data-spot="workflow"
            data-active={activeTab === 'employees'}
            aria-pressed={activeTab === 'employees'}
            className={cn(
              'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
              activeTab === 'employees'
                ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-400/40 border-amber-500'
                : 'bg-white hover:bg-amber-50/40 border-slate-200/90 hover:border-amber-300 text-slate-800 shadow-2xs'
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={cn(
                  'p-1.5 rounded-lg',
                  activeTab === 'employees' ? 'bg-amber-500/50 text-white' : 'bg-amber-100 text-amber-800'
                )}
              >
                <Users className="size-4" />
              </div>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-bold rounded-full',
                  activeTab === 'employees' ? 'bg-white text-amber-700' : 'bg-amber-100 text-amber-900 border border-amber-200'
                )}
              >
                <SmoothNumber value={employees.length} format="number" /> Karyawan
              </span>
            </div>
            <div className="mt-2.5">
              <div className={cn('text-xs font-bold', activeTab === 'employees' ? 'text-white' : 'text-slate-900')}>
                3. Master Karyawan &amp; Kasbon
              </div>
              <div className={cn('text-[11px] font-semibold', activeTab === 'employees' ? 'text-amber-100' : 'text-slate-600')}>
                Roster SDM &amp; Cicilan Kasbon
              </div>
            </div>
          </button>

          {/* Tab 4: Kebijakan & Rumus Payroll Outlet */}
          <button
            type="button"
            onClick={() => setActiveTab('policy')}
            data-spot="workflow"
            data-active={activeTab === 'policy'}
            aria-pressed={activeTab === 'policy'}
            className={cn(
              'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
              activeTab === 'policy'
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-500/25 ring-2 ring-indigo-400/40 border-indigo-500'
                : 'bg-white hover:bg-indigo-50/40 border-slate-200/90 hover:border-indigo-300 text-slate-800 shadow-2xs'
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={cn(
                  'p-1.5 rounded-lg',
                  activeTab === 'policy' ? 'bg-indigo-500/50 text-white' : 'bg-indigo-100 text-indigo-800'
                )}
              >
                <Settings className="size-4" />
              </div>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-bold rounded-full',
                  activeTab === 'policy' ? 'bg-white text-indigo-700' : 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                )}
              >
                Formula &amp; BPJS
              </span>
            </div>
            <div className="mt-2.5">
              <div className={cn('text-xs font-bold', activeTab === 'policy' ? 'text-white' : 'text-slate-900')}>
                4. Kebijakan &amp; Rumus Gaji
              </div>
              <div className={cn('text-[11px] font-semibold', activeTab === 'policy' ? 'text-indigo-100' : 'text-slate-600')}>
                Parameter Lembur &amp; Denda
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Unreviewed Policy Transparency Banner */}
      {policy && !policy.is_reviewed && (
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-amber-400 bg-amber-50/90 p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-800" />
            <div className="text-xs leading-relaxed text-amber-950">
              <p className="font-bold">
                Parameter Gaji & Kebijakan {selectedOutlet.name} Menggunakan Nilai Awal Database (Dapat Diedit Kapan Saja)
              </p>
              <p className="mt-0.5 text-amber-900">
                Tidak ada angka gaji atau potongan yang di-hardcode di kode program. Seluruh Gaji Pokok, Uang Makan,
                Denda Terlambat, Pembagi Lembur (1/173), hingga BPJS tersimpan di database dan dapat Anda sesuaikan
                langsung melalui tab <strong>Master Karyawan</strong> atau <strong>Kebijakan & Rumus Payroll</strong>.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveTab('policy')}
            className="shrink-0 border-amber-600 bg-white text-amber-950 hover:bg-amber-100"
          >
            <Settings className="size-3.5" />
            Review & Edit Rumus Gaji
          </Button>
        </div>
      )}

      {/* Feedback banners */}
      {errorMsg && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-900"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="size-4 shrink-0 text-rose-700" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="rounded p-1 text-rose-700 hover:bg-rose-100 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-950"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-700" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="rounded p-1 text-emerald-800 hover:bg-emerald-100 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Top KPI Cards - Glassy V14 with Smooth Rolling Numbers */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card data-spot="stat" className="p-4 shadow-sm hover:shadow-md transition-all animate-glass-card stagger-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Karyawan Aktif ({selectedOutlet.code})</span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
              <Users className="size-4" />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
            <SmoothNumber value={activeEmployeesCount} format="number" suffix=" Orang" />
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Basis {policy?.working_days_basis ?? 26} hari kerja • {shifts.length} shift operasional
          </p>
        </Card>

        <Card data-spot="stat" className="p-4 shadow-sm hover:shadow-md transition-all animate-glass-card stagger-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Total Take-Home Pay ({periodMonth}/{periodYear})
            </span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
              <Banknote className="size-4" />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-900">
            <SmoothNumber value={activeRunDetail?.total_net ?? 0} format="idr" />
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Gaji Kotor: {formatRupiah(activeRunDetail?.total_gross ?? 0)}
          </p>
        </Card>

        <Card data-spot="stat" className="p-4 shadow-sm hover:shadow-md transition-all animate-glass-card stagger-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Potongan Karyawan & Kasbon</span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-rose-100 text-rose-800">
              <Wallet className="size-4" />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-rose-700">
            <SmoothNumber value={activeRunDetail?.total_deductions ?? 0} format="idr" />
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Saldo Kasbon Aktif Outlet: {formatRupiah(activeKasbonTotal)}
          </p>
        </Card>

        <Card data-spot="stat" className="p-4 shadow-sm hover:shadow-md transition-all animate-glass-card stagger-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Kontribusi BPJS Perusahaan</span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-sky-100 text-sky-800">
              <ShieldCheck className="size-4" />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
            <SmoothNumber value={activeRunDetail?.total_employer_contribution ?? 0} format="idr" />
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Kes 4% • JHT 3,7% • JP 2% • JKK 0,24% • JKM 0,30%
          </p>
        </Card>
      </div>



      {/* ===================================================================== */}
      {/* TAB 1: PENGGAJIAN & SLIP GAJI                                         */}
      {/* ===================================================================== */}
      {activeTab === 'payroll' && (
        <div className="space-y-5">
          {/* Period Controls & Run Action Bar */}
          <Card data-spot="toolbar" className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label
                    htmlFor="payroll-month-select"
                    className="block text-[11px] font-bold text-slate-600 uppercase"
                  >
                    Bulan Periode Absensi
                  </label>
                  <select
                    id="payroll-month-select"
                    value={periodMonth}
                    onChange={(e) => setPeriodMonth(Number(e.target.value))}
                    className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                  >
                    {MONTH_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="payroll-year-select"
                    className="block text-[11px] font-bold text-slate-600 uppercase"
                  >
                    Tahun
                  </label>
                  <select
                    id="payroll-year-select"
                    value={periodYear}
                    onChange={(e) => setPeriodYear(Number(e.target.value))}
                    className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                  >
                    <option value={2025}>2025</option>
                    <option value={2026}>2026</option>
                  </select>
                </div>

                <div className="pt-4">
                  <button
                    type="button"
                    disabled={
                      isSubmitting ||
                      activeRunDetail?.status === 'APPROVED' ||
                      activeRunDetail?.status === 'PAID'
                    }
                    onClick={() => void handleGenerateRun()}
                    className={cn(
                      'flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer',
                      isSubmitting || activeRunDetail?.status === 'APPROVED' || activeRunDetail?.status === 'PAID'
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-sm'
                    )}
                  >
                    <RefreshCw className={`size-4 ${isSubmitting ? 'animate-spin' : ''}`} />
                    <span>{activeRunDetail ? 'Hitung Ulang Draft Gaji' : 'Generate Draft Gaji'}</span>
                  </button>
                </div>
              </div>

              {/* Approval & Payment Lifecycle Buttons */}
              {activeRunDetail && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="mr-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs font-semibold text-slate-500">Status Batch:</span>
                      <Badge
                        variant={
                          activeRunDetail.status === 'PAID'
                            ? 'success'
                            : activeRunDetail.status === 'APPROVED'
                              ? 'info'
                              : 'warning'
                        }
                      >
                        {activeRunDetail.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Jadwal Pencairan: <strong>{activeRunDetail.pay_date}</strong>
                    </p>
                  </div>

                  {activeRunDetail.status === 'DRAFT' && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleApproveRun()}
                      className="flex items-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white px-4 py-2.5 text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                    >
                      <Lock className="size-4" />
                      <span>Setujui &amp; Kunci Slip (Approve)</span>
                    </button>
                  )}

                  {activeRunDetail.status === 'APPROVED' && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => void handleMarkPaid()}
                      className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                    >
                      <CheckCircle2 className="size-4" />
                      <span>Tandai Sudah Ditransfer (Paid)</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Historical Runs Quick Pills */}
            {runs.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                <span className="text-[11px] font-semibold text-slate-500">Riwayat Batch Outlet:</span>
                {runs.map((r) => {
                  const isCurrent = r.period_year === periodYear && r.period_month === periodMonth
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setPeriodYear(r.period_year)
                        setPeriodMonth(r.period_month)
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold cursor-pointer transition-all shadow-2xs',
                        isCurrent
                          ? 'border-emerald-600 bg-emerald-100 text-emerald-950 shadow-xs'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                      )}
                    >
                      <span>
                        {r.period_month}/{r.period_year}
                      </span>
                      <span className="font-mono text-[10px] opacity-80">({r.status})</span>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Employee Payslips Table */}
          <Card data-spot="table" className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-heading text-base font-bold text-slate-900">
                  Daftar Slip Gaji Karyawan — {selectedOutlet.name}
                </h2>
                <p className="text-xs text-slate-600">
                  Klik <strong>Lihat Slip Digital</strong> pada baris karyawan untuk melihat rincian rumus perhitungan
                  komponen gaji, lembur, BPJS, dan kasbon.
                </p>
              </div>
              <input
                type="search"
                value={slipSearch}
                onChange={(e) => setSlipSearch(e.target.value)}
                placeholder="Cari nama, kode, atau jabatan..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 sm:w-64"
              />
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-sm text-slate-500">Memuat data penggajian...</div>
            ) : !activeRunDetail ? (
              <div className="p-8 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  Belum ada batch penggajian untuk periode {periodMonth}/{periodYear} di {selectedOutlet.name}.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Klik tombol <strong>Generate Draft Gaji</strong> di atas untuk menghitung otomatis dari rekap
                  absensi, lembur, dan kasbon.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/80 text-[11px] font-bold tracking-wider text-slate-600 uppercase">
                      <th className="px-4 py-3">Karyawan & Jabatan</th>
                      <th className="px-3 py-3 text-center">Rekap Hadir</th>
                      <th className="px-3 py-3 text-right">Gaji Pokok + Jabatan</th>
                      <th className="px-3 py-3 text-right">Uang Makan + Lembur</th>
                      <th className="px-3 py-3 text-right">Gaji Kotor (Gross)</th>
                      <th className="px-3 py-3 text-right">Potongan + Kasbon</th>
                      <th className="px-3 py-3 text-right">Gaji Bersih (THP)</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredSlips.map((slip) => (
                      <tr key={slip.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-800">
                              {slip.employee_code}
                            </span>
                            <span className="font-bold text-slate-900">{slip.employee_name}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-500">{slip.position_title}</p>
                        </td>

                        <td className="px-3 py-3 text-center">
                          <div className="inline-flex flex-wrap items-center justify-center gap-1">
                            <Badge variant="success">{slip.days_present} Hadir</Badge>
                            {slip.days_unexcused_absent > 0 && (
                              <Badge variant="danger">{slip.days_unexcused_absent} Alpha</Badge>
                            )}
                            {slip.late_minutes_effective > 0 && (
                              <Badge variant="warning">{slip.late_minutes_effective}m Telat</Badge>
                            )}
                            {slip.overtime_minutes > 0 && (
                              <Badge variant="info">{slip.overtime_minutes}m Lembur</Badge>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-800">
                          <div>{formatRupiah(slip.base_salary + slip.position_allowance)}</div>
                          <div className="text-[10px] text-slate-500">
                            Pokok {formatRupiah(slip.base_salary)}
                          </div>
                        </td>

                        <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-800">
                          <div>{formatRupiah(slip.meal_allowance + slip.overtime_pay + slip.service_charge_share)}</div>
                          <div className="text-[10px] text-slate-500">
                            Makan {formatRupiah(slip.meal_allowance)}
                            {slip.overtime_pay > 0 ? ` • OT ${formatRupiah(slip.overtime_pay)}` : ''}
                          </div>
                        </td>

                        <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-900">
                          {formatRupiah(slip.gross_pay)}
                        </td>

                        <td className="px-3 py-3 text-right font-mono tabular-nums text-rose-700">
                          <div>-{formatRupiah(slip.total_deductions)}</div>
                          {slip.kasbon_deduction > 0 && (
                            <div className="text-[10px] font-semibold text-amber-800">
                              Cicilan Kasbon: {formatRupiah(slip.kasbon_deduction)}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3 text-right font-mono text-sm font-bold tabular-nums text-emerald-900">
                          {formatRupiah(slip.net_pay)}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedSlip(slip)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-emerald-50 hover:border-emerald-300 px-3 py-1.5 text-xs font-bold text-slate-800 hover:text-emerald-900 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                          >
                            <span>Lihat Slip Digital</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: PRESENSI, SHIFT & GEOFENCE GPS                                 */}
      {/* ===================================================================== */}
      {activeTab === 'attendance' && (
        <div className="space-y-5">
          {/* GPS Geofence Simulator & Live Attendance Clock Widget */}
          <Card data-spot="panel" className="border-emerald-700/40 bg-emerald-950/5 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Navigation className="size-4 text-emerald-800" />
                  <h2 className="font-heading text-base font-bold text-slate-900">
                    Mesin Absensi GPS & Validasi Radius Geofence ({selectedOutlet.name})
                  </h2>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Titik Koordinat Outlet:{' '}
                  <strong className="font-mono">
                    {policy?.geofence_latitude ?? -7.31642}, {policy?.geofence_longitude ?? 110.17583}
                  </strong>{' '}
                  • Radius Maksimal: <strong className="font-mono">{policy?.geofence_radius_meters ?? 100} meter</strong>{' '}
                  • Status Geofence:{' '}
                  <Badge variant={policy?.require_geofence ? 'success' : 'neutral'}>
                    {policy?.require_geofence ? 'WAJIB DALAM RADIUS' : 'BEBAS LOKASI'}
                  </Badge>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const baseLat = policy?.geofence_latitude ?? -7.31642
                    const baseLng = policy?.geofence_longitude ?? 110.17583
                    setGpsLat(baseLat.toFixed(6))
                    setGpsLng(baseLng.toFixed(6))
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 cursor-pointer shadow-2xs transition-all"
                >
                  <span>📍</span>
                  <span>Preset Di Dalam Resto (~0m - Valid)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const baseLat = (policy?.geofence_latitude ?? -7.31642) + 0.0085
                    const baseLng = (policy?.geofence_longitude ?? 110.17583) + 0.0085
                    setGpsLat(baseLat.toFixed(6))
                    setGpsLng(baseLng.toFixed(6))
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100 hover:border-rose-400 cursor-pointer shadow-2xs transition-all"
                >
                  <span>🚫</span>
                  <span>Preset Di Luar Radius (~1.300m - Ditolak)</span>
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase">Pilih Karyawan</label>
                <select
                  value={gpsEmployeeId}
                  onChange={(e) => setGpsEmployeeId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.employee_code} — {emp.full_name} ({emp.default_shift_code ?? 'PAGI'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase">Latitude GPS</label>
                <input
                  type="text"
                  value={gpsLat}
                  onChange={(e) => setGpsLat(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase">Longitude GPS</label>
                <input
                  type="text"
                  value={gpsLng}
                  onChange={(e) => setGpsLng(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900"
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  disabled={isSubmitting || !gpsEmployeeId}
                  onClick={() => void handleClockInGps()}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer',
                    isSubmitting || !gpsEmployeeId
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-sm'
                  )}
                >
                  <MapPin className="size-4" />
                  <span>Clock-In GPS</span>
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || !gpsEmployeeId}
                  onClick={() => void handleClockOutGps()}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer',
                    isSubmitting || !gpsEmployeeId
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                      : 'bg-slate-800 hover:bg-slate-900 text-white hover:shadow-sm'
                  )}
                >
                  <Clock className="size-4" />
                  <span>Clock-Out</span>
                </button>
              </div>
            </div>
          </Card>

          {/* Attendance Filter & Log Table */}
          <Card data-spot="table" className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Dari Tanggal</label>
                  <input
                    type="date"
                    value={attFromDate}
                    onChange={(e) => setAttFromDate(e.target.value)}
                    className="mt-0.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Sampai Tanggal</label>
                  <input
                    type="date"
                    value={attToDate}
                    onChange={(e) => setAttToDate(e.target.value)}
                    className="mt-0.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Filter Karyawan</label>
                  <select
                    value={attEmployeeFilter}
                    onChange={(e) => setAttEmployeeFilter(e.target.value)}
                    className="mt-0.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900"
                  >
                    <option value="ALL">Semua Karyawan ({employees.length})</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.employee_code} — {e.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setAttForm({
                    employee_id: employees[0]?.id ?? '',
                    work_date: '2026-09-28',
                    shift_id: shifts[0]?.id ?? null,
                    status: 'PRESENT',
                    late_minutes: 0,
                    overtime_minutes: 60,
                    overtime_approved: true,
                    notes: 'Koreksi / input absensi oleh Manajer',
                  })
                  setIsAttModalOpen(true)
                }}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer hover:shadow-sm"
              >
                <Plus className="size-4" />
                <span>Catat / Koreksi Absensi Manual</span>
              </button>
            </div>

            <div className="max-h-[480px] overflow-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-[11px] font-bold tracking-wider text-slate-600 uppercase shadow-2xs">
                  <tr>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-3 py-3">Karyawan</th>
                    <th className="px-3 py-3">Shift</th>
                    <th className="px-3 py-3">Status Kehadiran</th>
                    <th className="px-3 py-3">Jarak GPS & Sumber</th>
                    <th className="px-3 py-3 text-right">Keterlambatan</th>
                    <th className="px-3 py-3 text-right">Menit Lembur</th>
                    <th className="px-4 py-3 text-right">Otorisasi Lembur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredAttendance.slice(0, 80).map((att) => (
                    <tr key={att.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">{att.work_date}</td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-[11px] font-bold text-slate-600">{att.employee_code}</span>{' '}
                        <span className="font-semibold text-slate-900">{att.employee_name}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="neutral">{att.shift_code ?? 'PAGI'}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={attendanceBadgeVariant(att.status)}>{attendanceLabel(att.status)}</Badge>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">
                        {att.source}
                        {att.clock_in_distance_m !== undefined ? ` (${att.clock_in_distance_m}m)` : ''}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {att.late_minutes > 0 ? (
                          <span className="font-bold text-amber-800">{att.late_minutes} menit</span>
                        ) : (
                          <span className="text-slate-400">0m</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {att.overtime_minutes > 0 ? (
                          <span className="font-bold text-sky-800">{att.overtime_minutes} menit</span>
                        ) : (
                          <span className="text-slate-400">0m</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {att.overtime_minutes > 0 ? (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => void handleToggleOvertime(att)}
                            className={cn(
                              'rounded-xl px-3 py-1.5 text-[11px] font-bold cursor-pointer transition-all shadow-2xs',
                              att.overtime_approved
                                ? 'bg-emerald-100 border border-emerald-300 text-emerald-900 hover:bg-emerald-200'
                                : 'bg-amber-100 border border-amber-300 text-amber-900 hover:bg-amber-200'
                            )}
                          >
                            {att.overtime_approved ? '✓ Lembur Disetujui' : 'Setujui Lembur'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: MASTER KARYAWAN & KASBON                                       */}
      {/* ===================================================================== */}
      {activeTab === 'employees' && (
        <div className="space-y-6">
          {/* Employee Roster Card */}
          <Card data-spot="table" className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-heading text-base font-bold text-slate-900">
                  Master Karyawan & Komponen Gaji — {selectedOutlet.name}
                </h2>
                <p className="text-xs text-slate-600">
                  Seluruh nilai Gaji Pokok, Tunjangan Jabatan, Uang Makan Harian, dan Poin Service Charge di bawah ini
                  dapat diubah langsung oleh Owner.
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateEmployeeModal}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer hover:shadow-sm"
              >
                <Plus className="size-4" />
                <span>Tambah Karyawan Baru</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/80 text-[11px] font-bold tracking-wider text-slate-600 uppercase">
                    <th className="px-4 py-3">Kode & Nama</th>
                    <th className="px-3 py-3">Jabatan & Shift</th>
                    <th className="px-3 py-3 text-right">Gaji Pokok</th>
                    <th className="px-3 py-3 text-right">Tunjangan Jabatan</th>
                    <th className="px-3 py-3 text-right">Uang Makan / Hari</th>
                    <th className="px-3 py-3 text-center">BPJS & Poin SC</th>
                    <th className="px-3 py-3 text-right">Kasbon Aktif</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-800">
                            {emp.employee_code}
                          </span>
                          <span className="font-bold text-slate-900">{emp.full_name}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Mulai: {emp.join_date} • {emp.bank_name ?? 'BRI'} {emp.bank_account ?? ''}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-800">{emp.position_title}</div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <Badge variant="neutral">Shift {emp.default_shift_code ?? 'PAGI'}</Badge>
                          <Badge variant={emp.is_active ? 'success' : 'danger'}>
                            {emp.is_active ? emp.employment_status : 'NONAKTIF'}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {formatRupiah(emp.base_salary)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700">
                        {formatRupiah(emp.position_allowance)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700">
                        {formatRupiah(emp.meal_allowance_per_day)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          <Badge variant={emp.bpjs_enrolled ? 'info' : 'neutral'}>
                            {emp.bpjs_enrolled ? 'BPJS Aktif' : 'Non-BPJS'}
                          </Badge>
                          <span className="font-mono text-[10px] text-slate-500">
                            {(emp.service_charge_points / 100).toFixed(2)} Poin SC
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        {emp.active_kasbon_balance > 0 ? (
                          <span className="font-bold text-amber-800">{formatRupiah(emp.active_kasbon_balance)}</span>
                        ) : (
                          <span className="text-slate-400">Rp 0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openEditEmployeeModal(emp)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                        >
                          <Edit3 className="size-3.5 text-slate-600" />
                          <span>Edit Gaji</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Employee Kasbon (Advances) Card */}
          <Card data-spot="table" className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-heading text-base font-bold text-slate-900">
                  Buku Kasbon Karyawan & Cicilan Otomatis — {selectedOutlet.name}
                </h2>
                <p className="text-xs text-slate-600">
                  Kasbon berstatus <strong>ACTIVE</strong> akan dipotong otomatis sebesar nilai cicilan per bulan saat
                  penggajian disetujui (dengan proteksi gaji bersih tidak pernah minus).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAdvForm({
                    employee_id: employees[0]?.id ?? '',
                    amount: 600000,
                    installment_amount: 200000,
                    issued_on: '2026-09-15',
                    reason: 'Pinjaman kebutuhan mendesak',
                  })
                  setIsAdvanceModalOpen(true)
                }}
                className="flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer hover:shadow-sm"
              >
                <Plus className="size-4" />
                <span>Catat Kasbon Baru</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/80 text-[11px] font-bold tracking-wider text-slate-600 uppercase">
                    <th className="px-4 py-3">Tanggal Pinjam</th>
                    <th className="px-3 py-3">Karyawan</th>
                    <th className="px-3 py-3">Keterangan</th>
                    <th className="px-3 py-3 text-right">Total Pinjaman</th>
                    <th className="px-3 py-3 text-right">Potongan / Bulan</th>
                    <th className="px-3 py-3 text-right">Sisa Saldo</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {advances.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                        Belum ada catatan kasbon pada {selectedOutlet.name}.
                      </td>
                    </tr>
                  ) : (
                    advances.map((adv) => (
                      <tr key={adv.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-slate-700">{adv.issued_on}</td>
                        <td className="px-3 py-3 font-semibold text-slate-900">
                          {adv.employee_code} — {adv.employee_name}
                        </td>
                        <td className="px-3 py-3 text-slate-600">{adv.reason ?? '—'}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-900">
                          {formatRupiah(adv.amount)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-amber-800">
                          {formatRupiah(adv.installment_amount)} / bln
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-rose-700">
                          {formatRupiah(adv.remaining_balance)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Badge
                            variant={
                              adv.status === 'ACTIVE'
                                ? 'warning'
                                : adv.status === 'PAID_OFF'
                                  ? 'success'
                                  : 'neutral'
                            }
                          >
                            {adv.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {adv.status === 'ACTIVE' &&
                            (confirmCancelAdvId === adv.id ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={() => void handleCancelAdvance(adv.id)}
                                  className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 text-xs shadow-xs cursor-pointer transition-all active:scale-95"
                                >
                                  Ya, Batalkan
                                </button>
                                <button
                                  type="button"
                                  disabled={isSubmitting}
                                  onClick={() => setConfirmCancelAdvId(null)}
                                  className="rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold px-3 py-1.5 text-xs cursor-pointer transition-all"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => setConfirmCancelAdvId(adv.id)}
                                className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-300 px-3 py-1.5 text-xs font-bold cursor-pointer transition-all shadow-2xs"
                              >
                                Batalkan
                              </button>
                            ))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: KEBIJAKAN & RUMUS PAYROLL OUTLET                               */}
      {/* ===================================================================== */}
      {activeTab === 'policy' && policyForm && (
        <Card data-spot="panel" className="p-6">
          <div className="border-b border-slate-200 pb-4">
            <h2 className="font-heading text-lg font-bold text-slate-900">
              Konfigurasi Rumus & Kebijakan Penggajian — {selectedOutlet.name}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Ubah parameter di bawah ini sesuai kebijakan manajemen {selectedOutlet.name}. Saat disimpan, seluruh
              perhitungan draft gaji berikutnya otomatis menggunakan parameter baru ini.
            </p>
          </div>

          <form onSubmit={(e) => void handleSavePolicy(e)} className="mt-5 space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">Tanggal Gajian Setiap Bulan (1-28)</label>
                <div className="mt-1">
                  <NumberInput
                    min={1}
                    max={28}
                    value={policyForm.pay_day}
                    onChange={(val) => setPolicyForm({ ...policyForm, pay_day: val })}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">Default Tropical Group: Tanggal 5 setiap bulan.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Basis Hari Kerja per Bulan (20-31)</label>
                <div className="mt-1">
                  <NumberInput
                    min={20}
                    max={31}
                    value={policyForm.working_days_basis}
                    onChange={(val) => setPolicyForm({ ...policyForm, working_days_basis: val })}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Digunakan untuk pembagi potongan Alpha: (Gaji Pokok + Jabatan) / Hari Kerja.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Pembagi Upah Lembur per Jam</label>
                <div className="mt-1">
                  <NumberInput
                    min={1}
                    max={400}
                    value={policyForm.overtime_divisor}
                    onChange={(val) => setPolicyForm({ ...policyForm, overtime_divisor: val })}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Standar Kepmenakertrans: 173 (Jam ke-1 = 1,5x, Jam berikutnya = 2x).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Toleransi Keterlambatan (Menit)</label>
                <div className="mt-1">
                  <NumberInput
                    min={0}
                    max={120}
                    value={policyForm.late_grace_minutes}
                    onChange={(val) => setPolicyForm({ ...policyForm, late_grace_minutes: val })}
                    suffix="menit"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Terlambat di bawah batas ini tidak dikenakan denda potongan.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Denda Terlambat per Menit (Rp)</label>
                <div className="mt-1">
                  <NumberInput
                    min={0}
                    step={500}
                    value={policyForm.late_deduction_per_minute}
                    onChange={(val) => setPolicyForm({ ...policyForm, late_deduction_per_minute: val })}
                    prefix="Rp"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Dikalikan total menit terlambat efektif dalam sebulan.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Porsi Bagi Hasil Service Charge (Basis Poin, 10000 = 100%)
                </label>
                <div className="mt-1">
                  <NumberInput
                    min={0}
                    max={10000}
                    value={policyForm.service_charge_employee_share_bps}
                    onChange={(val) => setPolicyForm({ ...policyForm, service_charge_employee_share_bps: val })}
                    suffix="bps"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Saat ini: {(policyForm.service_charge_employee_share_bps / 100).toFixed(1)}% dibagikan ke karyawan.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Radius Batas Geofence Absensi (Meter)</label>
                <div className="mt-1">
                  <NumberInput
                    min={10}
                    max={5000}
                    step={50}
                    value={policyForm.geofence_radius_meters ?? 100}
                    onChange={(val) => setPolicyForm({ ...policyForm, geofence_radius_meters: val })}
                    suffix="meter"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Batas jarak GPS dari titik restoran (contoh: 100m, 300m, atau 500m).
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-xs font-bold text-slate-900">Wajibkan Validasi Radius Geofence GPS saat Clock-In</p>
                <p className="text-[11px] text-slate-600">
                  Jika aktif, karyawan yang berada di luar radius {policyForm.geofence_radius_meters ?? 100}m dari titik
                  koordinat restoran tidak dapat melakukan Clock-In mandiri.
                </p>
              </div>
              <input
                type="checkbox"
                checked={policyForm.require_geofence}
                onChange={(e) => setPolicyForm({ ...policyForm, require_geofence: e.target.checked })}
                className="size-5 accent-emerald-800 cursor-pointer"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-6 py-3 text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer',
                  isSubmitting
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-lg'
                )}
              >
                <CheckCircle2 className="size-4" />
                <span>Simpan Kebijakan Payroll {selectedOutlet.code}</span>
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: DIGITAL PAYSLIP (SLIP GAJI DIGITAL)                          */}
      {/* ===================================================================== */}
      {selectedSlip && activeRunDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl">
            {/* Modal Screen Action Header (Hidden during Print) */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-4 print-hide">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="info">SLIP GAJI DIGITAL RESMI</Badge>
                  <Badge variant="neutral">{activeRunDetail.status}</Badge>
                </div>
                <h3 className="mt-1.5 font-heading text-xl font-bold text-slate-900">
                  {selectedOutlet.name} ({selectedOutlet.code})
                </h3>
                <p className="text-xs text-slate-500">
                  Periode Kerja: {activeRunDetail.period_start} s/d {activeRunDetail.period_end} • Tanggal Pembayaran:{' '}
                  <strong>{activeRunDetail.pay_date}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 shadow-2xs cursor-pointer transition-all active:scale-95"
                  title="Cetak Fisik / Simpan Dokumen PDF Slip Gaji"
                >
                  <Printer className="size-4 text-emerald-700" />
                  <span>Cetak / Simpan PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSlip(null)}
                  className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer transition-all"
                  title="Tutup Modal"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {/* Document Content (Rendered on Screen and in Clean Print A4) */}
            <div id="printable-payslip" className="mt-2 text-slate-900">
              {/* Official Corporate Header Letterhead */}
              <div className="border-b-2 border-slate-800 pb-3 text-center sm:text-left sm:flex sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 justify-center sm:justify-start">
                    <span className="text-lg">🌿</span>
                    <span className="font-heading text-base font-black tracking-wider text-emerald-950 uppercase">
                      TROPICAL GROUP RESTO & CAFÉ
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-700 mt-0.5">
                    {selectedOutlet.name} ({selectedOutlet.code}) • Authentic Culinary & Dining Experience
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Jl. Boulevard Tropical No. 88, Manding, Temanggung, Jawa Tengah • Telp: (0293) 491-888
                  </p>
                  <p className="text-[10px] text-slate-400">
                    NPWP: 01.987.654.3-522.000 • Bukti Pembayaran Penghasilan Karyawan Sah
                  </p>
                </div>
                <div className="mt-3 sm:mt-0 text-center sm:text-right">
                  <span className="inline-block rounded-md border border-slate-800 bg-slate-100 px-2.5 py-1 text-[11px] font-black tracking-widest text-slate-900 uppercase">
                    SLIP GAJI RESMI
                  </span>
                  <p className="mt-1 font-mono text-[10px] text-slate-500">
                    Ref: SLIP/{activeRunDetail.id.slice(0, 8).toUpperCase()}/{selectedSlip.employee_code}
                  </p>
                  <p className="font-mono text-[10px] text-slate-500">
                    Tgl Cetak: {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>

              {/* Document Subtitle & Periode */}
              <div className="mt-3 flex flex-wrap items-center justify-between rounded-lg bg-slate-100 px-3.5 py-2 text-xs text-slate-700">
                <div>
                  Periode Gaji:{' '}
                  <strong className="text-slate-900">
                    {activeRunDetail.period_start} s/d {activeRunDetail.period_end}
                  </strong>
                </div>
                <div>
                  Tanggal Bayar: <strong className="text-slate-900">{activeRunDetail.pay_date}</strong>
                </div>
                <div>
                  Status:{' '}
                  <strong className="text-emerald-700 uppercase">{activeRunDetail.status}</strong>
                </div>
              </div>

              {/* Employee Metadata */}
              <div className="mt-3 grid grid-cols-2 gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs sm:grid-cols-4">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500">Nama Karyawan</span>
                  <p className="mt-0.5 font-bold text-slate-900">{selectedSlip.employee_name}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500">Kode / NIP</span>
                  <p className="mt-0.5 font-mono font-bold text-slate-800">{selectedSlip.employee_code}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500">Jabatan & Unit</span>
                  <p className="mt-0.5 font-semibold text-slate-800">{selectedSlip.position_title}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500">Rekap Kehadiran</span>
                  <p className="mt-0.5 font-mono font-semibold text-slate-800">
                    {selectedSlip.days_present} Hadir • {selectedSlip.days_unexcused_absent} Alpha
                  </p>
                </div>
              </div>

              {/* Earnings vs Deductions Two-Column Breakdown */}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Penerimaan */}
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/30 p-3.5">
                  <h4 className="border-b border-emerald-300 pb-1.5 text-xs font-bold tracking-wider text-emerald-950 uppercase">
                    A. Komponen Penerimaan (Earnings)
                  </h4>
                  <dl className="mt-2.5 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Gaji Pokok</dt>
                      <dd className="font-mono font-semibold tabular-nums text-slate-900">
                        {formatRupiah(selectedSlip.base_salary)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Tunjangan Jabatan</dt>
                      <dd className="font-mono font-semibold tabular-nums text-slate-900">
                        {formatRupiah(selectedSlip.position_allowance)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Uang Makan ({selectedSlip.days_present} hari hadir)</dt>
                      <dd className="font-mono font-semibold tabular-nums text-slate-900">
                        {formatRupiah(selectedSlip.meal_allowance)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Upah Lembur ({selectedSlip.overtime_minutes} menit)</dt>
                      <dd className="font-mono font-semibold tabular-nums text-slate-900">
                        {formatRupiah(selectedSlip.overtime_pay)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Pembagian Service Charge</dt>
                      <dd className="font-mono font-semibold tabular-nums text-slate-900">
                        {formatRupiah(selectedSlip.service_charge_share)}
                      </dd>
                    </div>
                    <div className="flex justify-between border-t border-emerald-400 pt-2 font-bold text-emerald-950">
                      <dt>Total Gaji Kotor (Gross Pay)</dt>
                      <dd className="font-mono tabular-nums">{formatRupiah(selectedSlip.gross_pay)}</dd>
                    </div>
                  </dl>
                </div>

                {/* Potongan */}
                <div className="rounded-xl border border-rose-300 bg-rose-50/30 p-3.5">
                  <h4 className="border-b border-rose-300 pb-1.5 text-xs font-bold tracking-wider text-rose-950 uppercase">
                    B. Komponen Potongan (Deductions)
                  </h4>
                  <dl className="mt-2.5 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-slate-600">
                        Potongan Terlambat ({selectedSlip.late_minutes_effective} mnt)
                      </dt>
                      <dd className="font-mono font-semibold tabular-nums text-rose-800">
                        -{formatRupiah(selectedSlip.late_deduction)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">
                        Potongan Alpha / Mangkir ({selectedSlip.days_unexcused_absent} hari)
                      </dt>
                      <dd className="font-mono font-semibold tabular-nums text-rose-800">
                        -{formatRupiah(selectedSlip.absence_deduction)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">BPJS Kesehatan Karyawan (1%)</dt>
                      <dd className="font-mono font-semibold tabular-nums text-rose-800">
                        -{formatRupiah(selectedSlip.bpjs_kesehatan)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">BPJS Ketenagakerjaan JHT (2%)</dt>
                      <dd className="font-mono font-semibold tabular-nums text-rose-800">
                        -{formatRupiah(selectedSlip.bpjs_jht)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">BPJS JP Pensiun (1%)</dt>
                      <dd className="font-mono font-semibold tabular-nums text-rose-800">
                        -{formatRupiah(selectedSlip.bpjs_jp)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Potongan Cicilan Kasbon</dt>
                      <dd className="font-mono font-semibold tabular-nums text-rose-800">
                        -{formatRupiah(selectedSlip.kasbon_deduction)}
                      </dd>
                    </div>
                    <div className="flex justify-between border-t border-rose-400 pt-2 font-bold text-rose-950">
                      <dt>Total Potongan</dt>
                      <dd className="font-mono tabular-nums">-{formatRupiah(selectedSlip.total_deductions)}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Net Take-Home Pay Banner */}
              <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-800 bg-emerald-900 px-5 py-3.5 text-white">
                <div>
                  <span className="text-xs font-semibold tracking-wider text-emerald-200 uppercase">
                    Take-Home Pay (Gaji Bersih Ditransfer)
                  </span>
                  <p className="text-[11px] text-emerald-100">
                    Gross ({formatRupiah(selectedSlip.gross_pay)}) − Potongan ({formatRupiah(selectedSlip.total_deductions)})
                  </p>
                </div>
                <span className="font-mono text-2xl font-bold tabular-nums text-amber-300">
                  {formatRupiah(selectedSlip.net_pay)}
                </span>
              </div>

              {/* Employer BPJS Info */}
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <span>Tanggungan Iuran BPJS oleh Perusahaan (Tidak Memotong Gaji)</span>
                  <span className="font-mono text-slate-900">{formatRupiah(selectedSlip.employer_contribution)}</span>
                </div>
                <p className="mt-1 font-mono text-[11px] text-slate-500">
                  Kes 4%: {formatRupiah(selectedSlip.employer_bpjs_kesehatan)} • JHT 3,7%: {formatRupiah(selectedSlip.employer_bpjs_jht)} • JP 2%: {formatRupiah(selectedSlip.employer_bpjs_jp)} • JKK: {formatRupiah(selectedSlip.employer_bpjs_jkk)} • JKM: {formatRupiah(selectedSlip.employer_bpjs_jkm)}
                </p>
              </div>

              {/* Official Signatures Section */}
              <div className="mt-6 pt-4 border-t border-dashed border-slate-300">
                <div className="grid grid-cols-2 gap-8 text-center text-xs">
                  <div>
                    <p className="font-semibold text-slate-600">Diterima oleh Karyawan,</p>
                    <div className="mt-14 border-b border-slate-400 mx-auto w-44"></div>
                    <p className="mt-1 font-bold text-slate-900">{selectedSlip.employee_name}</p>
                    <p className="text-[10px] text-slate-500">NIP: {selectedSlip.employee_code}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-600">Disetujui oleh Management,</p>
                    <div className="mt-14 border-b border-slate-400 mx-auto w-44"></div>
                    <p className="mt-1 font-bold text-slate-900">HRD & Finance Tropical Group</p>
                    <p className="text-[10px] text-slate-500">Tgl: {activeRunDetail.pay_date}</p>
                  </div>
                </div>
                <p className="mt-4 text-center text-[10px] text-slate-400 italic">
                  * Dokumen ini sah dan diterbitkan secara digital oleh Enterprise Platform Tropical Group.
                </p>
              </div>
            </div>

            {/* Modal Bottom Controls (Hidden during Print) */}
            <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4 print-hide">
              <span className="text-xs text-slate-500">
                Gunakan tombol Cetak untuk mencetak langsung ke printer atau simpan sebagai PDF.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 shadow-2xs cursor-pointer transition-all active:scale-95"
                >
                  <Printer className="size-4 text-emerald-700" />
                  <span>Cetak / Simpan PDF Slip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSlip(null)}
                  className="rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 text-xs cursor-pointer shadow-xs active:scale-95 transition-all"
                >
                  Tutup Slip Gaji
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: TAMBAH / EDIT KARYAWAN & KOMPONEN GAJI                       */}
      {/* ===================================================================== */}
      {isEmployeeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-heading text-lg font-bold text-slate-900">
                {editingEmployee
                  ? `Edit Komponen Gaji & Profil — ${editingEmployee.full_name}`
                  : `Tambah Karyawan Baru (${selectedOutlet.name})`}
              </h3>
              <button
                type="button"
                onClick={() => setIsEmployeeModalOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveEmployee(e)} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-bold text-slate-700">Kode Karyawan</label>
                  <input
                    type="text"
                    required
                    value={empForm.employee_code}
                    onChange={(e) => setEmpForm({ ...empForm, employee_code: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    value={empForm.full_name}
                    onChange={(e) => setEmpForm({ ...empForm, full_name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Jabatan</label>
                  <input
                    type="text"
                    required
                    value={empForm.position_title}
                    onChange={(e) => setEmpForm({ ...empForm, position_title: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Status Kepegawaian</label>
                  <select
                    value={empForm.employment_status}
                    onChange={(e) =>
                      setEmpForm({ ...empForm, employment_status: e.target.value as EmploymentStatus })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                  >
                    <option value="PERMANENT">PERMANENT (Tetap)</option>
                    <option value="CONTRACT">CONTRACT (Kontrak)</option>
                    <option value="PROBATION">PROBATION (Masa Percobaan)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Gaji Pokok Sebulan (Rp)</label>
                  <div className="mt-1">
                    <NumberInput
                      min={0}
                      step={50000}
                      value={empForm.base_salary}
                      onChange={(val) => setEmpForm({ ...empForm, base_salary: val })}
                      prefix="Rp"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Tunjangan Jabatan (Rp)</label>
                  <div className="mt-1">
                    <NumberInput
                      min={0}
                      step={25000}
                      value={empForm.position_allowance}
                      onChange={(val) => setEmpForm({ ...empForm, position_allowance: val })}
                      prefix="Rp"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Uang Makan per Hari Hadir (Rp)</label>
                  <div className="mt-1">
                    <NumberInput
                      min={0}
                      step={5000}
                      value={empForm.meal_allowance_per_day}
                      onChange={(val) => setEmpForm({ ...empForm, meal_allowance_per_day: val })}
                      prefix="Rp"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Shift Default</label>
                  <select
                    value={empForm.default_shift_id ?? ''}
                    onChange={(e) =>
                      setEmpForm({ ...empForm, default_shift_id: e.target.value ? e.target.value : null })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                  >
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} ({s.start_time} - {s.end_time})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={empForm.bpjs_enrolled}
                    onChange={(e) => setEmpForm({ ...empForm, bpjs_enrolled: e.target.checked })}
                    className="size-4 accent-emerald-800"
                  />
                  Ikut Kepesertaan BPJS Kesehatan & Ketenagakerjaan
                </label>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEmployeeModalOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 cursor-pointer transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold shadow-xs cursor-pointer transition-all active:scale-95 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  Simpan Karyawan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: CATAT KASBON BARU                                            */}
      {/* ===================================================================== */}
      {isAdvanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-heading text-lg font-bold text-slate-900">Catat Kasbon Karyawan</h3>
              <button
                type="button"
                onClick={() => setIsAdvanceModalOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateAdvance(e)} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Pilih Karyawan</label>
                <select
                  value={advForm.employee_id}
                  onChange={(e) => setAdvForm({ ...advForm, employee_id: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.employee_code} — {emp.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700">Nominal Pinjaman (Rp)</label>
                  <div className="mt-1">
                    <NumberInput
                      min={10000}
                      step={50000}
                      value={advForm.amount}
                      onChange={(val) => setAdvForm({ ...advForm, amount: val })}
                      prefix="Rp"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Cicilan per Bulan (Rp)</label>
                  <div className="mt-1">
                    <NumberInput
                      min={10000}
                      step={50000}
                      value={advForm.installment_amount}
                      onChange={(val) => setAdvForm({ ...advForm, installment_amount: val })}
                      prefix="Rp"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700">Tanggal Pencairan Kasbon</label>
                <input
                  type="date"
                  required
                  value={advForm.issued_on}
                  onChange={(e) => setAdvForm({ ...advForm, issued_on: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700">Alasan / Keterangan</label>
                <input
                  type="text"
                  value={advForm.reason}
                  onChange={(e) => setAdvForm({ ...advForm, reason: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAdvanceModalOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 cursor-pointer transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold shadow-xs cursor-pointer transition-all active:scale-95 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  Simpan Kasbon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: KOREKSI / INPUT ABSENSI MANUAL                               */}
      {/* ===================================================================== */}
      {isAttModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-heading text-lg font-bold text-slate-900">Catat / Koreksi Absensi Karyawan</h3>
              <button
                type="button"
                onClick={() => setIsAttModalOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveManualAttendance(e)} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700">Karyawan</label>
                <select
                  value={attForm.employee_id}
                  onChange={(e) => setAttForm({ ...attForm, employee_id: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.employee_code} — {emp.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700">Tanggal Kerja</label>
                  <input
                    type="date"
                    required
                    value={attForm.work_date}
                    onChange={(e) => setAttForm({ ...attForm, work_date: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Status Kehadiran</label>
                  <select
                    value={attForm.status}
                    onChange={(e) => setAttForm({ ...attForm, status: e.target.value as AttendanceStatus })}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                  >
                    <option value="PRESENT">PRESENT (Hadir Tepat)</option>
                    <option value="LATE">LATE (Terlambat)</option>
                    <option value="ABSENT">ABSENT (Alpha / Mangkir)</option>
                    <option value="LEAVE">LEAVE (Izin / Cuti)</option>
                    <option value="SICK">SICK (Sakit)</option>
                    <option value="OFF">OFF (Libur Shift)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700">Menit Terlambat</label>
                  <div className="mt-1">
                    <NumberInput
                      min={0}
                      max={720}
                      value={attForm.late_minutes}
                      onChange={(val) => setAttForm({ ...attForm, late_minutes: val })}
                      suffix="m"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-slate-700">Menit Lembur</label>
                  <div className="mt-1">
                    <NumberInput
                      min={0}
                      max={720}
                      value={attForm.overtime_minutes}
                      onChange={(val) => setAttForm({ ...attForm, overtime_minutes: val })}
                      suffix="m"
                    />
                  </div>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attForm.overtime_approved}
                  onChange={(e) => setAttForm({ ...attForm, overtime_approved: e.target.checked })}
                  className="size-4 accent-emerald-800"
                />
                Otorisasi / Setujui Menit Lembur Ini
              </label>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAttModalOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 cursor-pointer transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold shadow-xs cursor-pointer transition-all active:scale-95 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  Simpan Absensi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
