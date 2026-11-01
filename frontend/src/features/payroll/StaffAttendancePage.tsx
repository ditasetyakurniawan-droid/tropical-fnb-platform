import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Compass,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserCheck,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AttendanceRecord, Employee, PayrollPolicy, ShiftDefinition } from './types'
import {
  clockInGps,
  clockOutGps,
  getPayrollPolicy,
  listAttendance,
  listEmployees,
  listShifts,
} from './payroll-api'
import { useAuthStore } from '@/features/auth/auth-store'
import { ApiError } from '@/shared/api/client'
import { SmoothNumber } from '@/shared/ui/SmoothNumber'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'

function Badge({
  children,
  variant = 'neutral',
}: {
  children: React.ReactNode
  variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}) {
  const styles: Record<string, string> = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    danger: 'bg-rose-50 text-rose-800 border-rose-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${styles[variant] ?? styles.neutral}`}
    >
      {children}
    </span>
  )
}

function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // meters
  const toRad = (v: number) => (v * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

function getTodayWIB(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export function StaffAttendancePage() {
  const activeOutletId = useAuthStore((s) => s.activeOutletId)
  const accessibleOutlets = useAuthStore((s) => s.accessibleOutlets)
  const currentUser = useAuthStore((s) => s.user)

  const selectedOutlet = useMemo(() => {
    return (
      accessibleOutlets.find((o) => o.id === activeOutletId) ??
      accessibleOutlets[0] ?? {
        id: '01a16ca4-770a-7f46-9216-79dd3612a375',
        code: 'TSH-01',
        name: 'Tropical Steak House',
      }
    )
  }, [accessibleOutlets, activeOutletId])

  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Data states
  const [policy, setPolicy] = useState<PayrollPolicy | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [shifts, setShifts] = useState<ShiftDefinition[]>([])
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([])

  // Selected Employee & Search
  const [selectedEmpId, setSelectedEmpId] = useState<string>('')
  const [empSearch, setEmpSearch] = useState<string>('')

  // Live Digital Clock state
  const [currentTime, setCurrentTime] = useState<Date>(new Date())

  // GPS States
  const [userLat, setUserLat] = useState<number>(-7.31642)
  const [userLng, setUserLng] = useState<number>(110.17583)
  const [isGpsLoading, setIsGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)

  // Clock tick every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Initial load of outlet policy, staff, shifts, and today's attendance
  useEffect(() => {
    let isCancelled = false
    const loadData = async () => {
      setIsLoading(true)
      setFeedback(null)
      try {
        const today = getTodayWIB()
        const [pol, empList, shiftList, attList] = await Promise.all([
          getPayrollPolicy(selectedOutlet.id),
          listEmployees(selectedOutlet.id, false), // active employees only
          listShifts(selectedOutlet.id),
          listAttendance(selectedOutlet.id, today, today),
        ])

        if (isCancelled) return
        setPolicy(pol)
        setEmployees(empList)
        setShifts(shiftList)
        setTodayAttendance(attList)

        // Set default GPS coordinates from outlet policy if available
        if (pol.geofence_latitude && pol.geofence_longitude) {
          setUserLat(pol.geofence_latitude)
          setUserLng(pol.geofence_longitude)
        }

        // Auto-select logged-in user if linked to an employee, or first staff
        if (empList.length > 0) {
          const matched = empList.find((e) => e.user_id === currentUser?.id)
          setSelectedEmpId(matched ? matched.id : empList[0]!.id)
        }
      } catch (err) {
        if (!isCancelled) {
          setFeedback({
            type: 'error',
            message: err instanceof ApiError ? err.message : 'Gagal memuat data staf & kebijakan kehadiran.',
          })
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadData()
    return () => {
      isCancelled = true
    }
  }, [selectedOutlet.id, currentUser?.id])

  // Real GPS acquisition from browser
  const acquireDeviceGps = () => {
    if (!navigator.geolocation) {
      setGpsError('Perangkat tidak mendukung sensor Geolocation GPS.')
      return
    }
    setIsGpsLoading(true)
    setGpsError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
        setIsGpsLoading(false)
      },
      (err) => {
        setIsGpsLoading(false)
        setGpsError(
          err.code === 1
            ? 'Izin lokasi GPS ditolak oleh browser/perangkat. Silakan aktifkan izin lokasi.'
            : 'Sinyal GPS lemah atau tidak dapat ditemukan.',
        )
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  // Selected employee object & today's record
  const selectedEmployee = useMemo(() => {
    return employees.find((e) => e.id === selectedEmpId) ?? null
  }, [employees, selectedEmpId])

  const selectedEmpShift = useMemo(() => {
    if (!selectedEmployee?.default_shift_id) return null
    return shifts.find((s) => s.id === selectedEmployee.default_shift_id) ?? null
  }, [selectedEmployee, shifts])

  const selectedEmpTodayAttendance = useMemo(() => {
    return todayAttendance.find((a) => a.employee_id === selectedEmpId) ?? null
  }, [todayAttendance, selectedEmpId])

  // Filtered staff list for search dropdown
  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase()
    if (!q) return employees
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q) ||
        e.position_title.toLowerCase().includes(q),
    )
  }, [employees, empSearch])

  // Geofence calculation
  const distanceMeters = useMemo(() => {
    if (!policy?.geofence_latitude || !policy?.geofence_longitude) return 0
    return calculateHaversineDistance(
      userLat,
      userLng,
      policy.geofence_latitude,
      policy.geofence_longitude,
    )
  }, [userLat, userLng, policy])

  const allowedRadius = policy?.geofence_radius_meters ?? 500
  const isWithinGeofence = distanceMeters <= allowedRadius

  // Quick Simulation presets
  const handleSimulateInShop = () => {
    if (policy?.geofence_latitude && policy?.geofence_longitude) {
      // Offset by ~30 meters
      setUserLat(policy.geofence_latitude + 0.00015)
      setUserLng(policy.geofence_longitude + 0.0001)
      setGpsError(null)
    }
  }

  const handleSimulateOutside = () => {
    if (policy?.geofence_latitude && policy?.geofence_longitude) {
      // Offset by ~900 meters
      setUserLat(policy.geofence_latitude + 0.008)
      setUserLng(policy.geofence_longitude + 0.008)
      setGpsError(null)
    }
  }

  // Attendance Clock-In Action
  const handleClockIn = async () => {
    if (!selectedEmpId) {
      setFeedback({ type: 'error', message: 'Silakan pilih nama karyawan terlebih dahulu.' })
      return
    }
    if (policy?.require_geofence && !isWithinGeofence) {
      setFeedback({
        type: 'error',
        message: `Absen masuk ditolak! Anda berada ${distanceMeters} meter dari outlet (Maksimum radius yang diizinkan: ${allowedRadius} meter).`,
      })
      return
    }

    setIsSubmitting(true)
    setFeedback(null)
    try {
      const rec = await clockInGps({
        employee_id: selectedEmpId,
        latitude: userLat,
        longitude: userLng,
      })
      const today = getTodayWIB()
      const refreshed = await listAttendance(selectedOutlet.id, today, today)
      setTodayAttendance(refreshed)

      const lateText = rec.late_minutes > 0 ? ` (Terlambat ${rec.late_minutes} menit)` : ' (Tepat Waktu)'
      setFeedback({
        type: 'success',
        message: `Selamat Bekerja, ${rec.employee_name}! Absen Masuk berhasil dicatat${lateText} pada ${rec.clock_in ? new Date(rec.clock_in).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'hari ini'}. Jarak valid: ${rec.clock_in_distance_m ?? distanceMeters}m.`,
      })
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof ApiError ? err.message : 'Gagal melakukan Absen Masuk. Hubungi supervisor.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Attendance Clock-Out Action
  const handleClockOut = async () => {
    if (!selectedEmpId) {
      setFeedback({ type: 'error', message: 'Silakan pilih nama karyawan terlebih dahulu.' })
      return
    }
    setIsSubmitting(true)
    setFeedback(null)
    try {
      const rec = await clockOutGps(selectedEmpId)
      const today = getTodayWIB()
      const refreshed = await listAttendance(selectedOutlet.id, today, today)
      setTodayAttendance(refreshed)

      const otText =
        rec.overtime_minutes > 0 ? ` Lembur tercatat: ${rec.overtime_minutes} menit.` : ''
      setFeedback({
        type: 'success',
        message: `Terima Kasih, ${rec.employee_name}! Absen Pulang berhasil dicatat pada ${rec.clock_out ? new Date(rec.clock_out).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'hari ini'}.${otText} Selamat beristirahat!`,
      })
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof ApiError ? err.message : 'Gagal melakukan Absen Pulang. Hubungi supervisor.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const formattedWibTime = currentTime.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Jakarta',
  })

  const formattedWibDate = currentTime.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  })

  return (
    <div className="tropical-glass mx-auto max-w-4xl space-y-6">
      {/* =================================================================== */}
      {/* 1. TOP HEADER & LIVE DIGITAL CLOCK KIOSK CARD                       */}
      {/* =================================================================== */}
      <div data-spot="hero" className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-emerald-900 via-slate-900 to-teal-950 p-6 text-white shadow-xl">
        <div className="absolute -top-12 -right-12 size-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -bottom-12 -left-12 size-48 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-left">
          <div>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
                <Smartphone className="size-4" />
              </span>
              <span className="text-[11px] font-bold tracking-widest text-emerald-300 uppercase">
                TERMINAL ABSENSI MANDIRI STAF (KIOSK & MOBILE)
              </span>
              <Badge variant="success">Radius Geofence: {allowedRadius}m</Badge>
            </div>
            <h1 className="mt-2 font-heading text-2xl font-black tracking-tight text-white sm:text-3xl">
              {selectedOutlet.name}
            </h1>
            <p className="mt-1 text-xs text-slate-300">
              Absensi mandiri cepat untuk crew kitchen, service, dan kasir dengan validasi posisi GPS real-time.
            </p>
          </div>

          {/* Big Live Digital Clock */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur-md">
            <span className="text-[10px] font-bold tracking-widest text-emerald-300 uppercase">
              WAKTU SERVER (WIB)
            </span>
            <div className="mt-0.5 font-mono text-3xl font-black tabular-nums tracking-wider text-amber-300 sm:text-4xl">
              {formattedWibTime}
            </div>
            <p className="mt-1 text-xs font-medium text-slate-300">{formattedWibDate}</p>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="alert"
          className={`flex items-start gap-3 rounded-xl border p-4 text-sm font-medium shadow-sm transition-all ${
            feedback.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-rose-300 bg-rose-50 text-rose-900'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-600" />
          )}
          <div className="flex-1">
            <p className="font-bold">{feedback.type === 'success' ? 'Berhasil' : 'Perhatian / Ditolak'}</p>
            <p className="mt-0.5 text-xs leading-relaxed">{feedback.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. EMPLOYEE SELECTOR & SHIFT INFORMATION                            */}
      {/* =================================================================== */}
      <Card data-spot="panel" className="p-5">
        <div className="border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="size-4 text-emerald-600" />
            <h2 className="font-heading text-sm font-bold text-slate-900 uppercase tracking-wider">
              1. Pilih Identitas Staf
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Pilih nama Anda dari daftar karyawan aktif outlet ini untuk mencatat kehadiran.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Employee Dropdown / Filter */}
          <div>
            <label htmlFor="staff-select" className="block text-xs font-bold text-slate-700">
              Karyawan / Staf Restoran
            </label>
            <select
              id="staff-select"
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-2xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.employee_code}) — {emp.position_title}
                </option>
              ))}
            </select>

            {/* Quick Search */}
            <input
              type="text"
              placeholder="Cari nama / NIP / jabatan..."
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none"
            />
            {empSearch && (
              <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-md">
                {filteredEmployees.length === 0 ? (
                  <p className="p-2 text-slate-400">Tidak ada staf yang cocok.</p>
                ) : (
                  filteredEmployees.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => {
                        setSelectedEmpId(e.id)
                        setEmpSearch('')
                      }}
                      className="w-full rounded px-2 py-1 text-left hover:bg-emerald-50 text-slate-800"
                    >
                      <strong>{e.full_name}</strong> • {e.position_title} ({e.employee_code})
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected Staff Profile Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
            {selectedEmployee ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-800">
                      {selectedEmployee.full_name.charAt(0)}
                    </span>
                    <div>
                      <p className="font-bold text-slate-900">{selectedEmployee.full_name}</p>
                      <p className="text-[11px] text-slate-500">
                        {selectedEmployee.position_title} • {selectedEmployee.employee_code}
                      </p>
                    </div>
                  </div>
                  <Badge variant={selectedEmployee.employment_status === 'PERMANENT' ? 'success' : 'info'}>
                    {selectedEmployee.employment_status}
                  </Badge>
                </div>

                <div className="border-t border-slate-200 pt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-500">Jadwal Shift:</span>
                    <p className="font-semibold text-slate-800">
                      {selectedEmpShift
                        ? `${selectedEmpShift.name} (${selectedEmpShift.start_time} - ${selectedEmpShift.end_time})`
                        : 'Shift Regular Operasional'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Status Hari Ini:</span>
                    <p className="font-semibold text-slate-800">
                      {selectedEmpTodayAttendance?.clock_in ? (
                        <span className="text-emerald-700">
                          Masuk: {new Date(selectedEmpTodayAttendance.clock_in).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          {selectedEmpTodayAttendance.clock_out && (
                            <> • Pulang: {new Date(selectedEmpTodayAttendance.clock_out).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</>
                          )}
                        </span>
                      ) : (
                        <span className="text-amber-700">Belum Clock-In</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400">Pilih karyawan untuk menampilkan detail shift.</div>
            )}
          </div>
        </div>
      </Card>

      {/* =================================================================== */}
      {/* 3. GEOFENCE GPS & REAL-TIME DISTANCE VALIDATOR                      */}
      {/* =================================================================== */}
      <Card data-spot="panel" className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="size-4 text-emerald-600" />
              <h2 className="font-heading text-sm font-bold text-slate-900 uppercase tracking-wider">
                2. Status Lokasi GPS & Geofence
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Validasi jarak posisi perangkat Anda ke titik koordinat {selectedOutlet.name}.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={acquireDeviceGps}
              disabled={isGpsLoading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${isGpsLoading ? 'animate-spin' : ''}`} />
              <span>{isGpsLoading ? 'Mencari GPS...' : 'Deteksi GPS Asli'}</span>
            </Button>
          </div>
        </div>

        {gpsError && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            ⚠️ {gpsError}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Distance Indicator Box */}
          <div
            className={`rounded-xl border p-4 text-center transition-all ${
              isWithinGeofence
                ? 'border-emerald-300 bg-emerald-50/50'
                : 'border-rose-300 bg-rose-50/50'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <MapPin
                className={`size-4 ${isWithinGeofence ? 'text-emerald-600' : 'text-rose-600 animate-bounce'}`}
              />
              <span className="text-[11px] font-bold tracking-wider uppercase text-slate-600">
                Jarak ke Restoran
              </span>
            </div>
            <div
              className={`mt-1 font-mono text-3xl font-black tabular-nums ${
                isWithinGeofence ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {distanceMeters} <span className="text-base font-normal">meter</span>
            </div>
            <div className="mt-2">
              {isWithinGeofence ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  <ShieldCheck className="size-3.5" /> DI DALAM RADIUS ({allowedRadius}m)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                  <AlertTriangle className="size-3.5" /> DI LUAR RADIUS (MAKS {allowedRadius}m)
                </span>
              )}
            </div>
          </div>

          {/* Coordinates Summary */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs sm:col-span-2 flex flex-col justify-between">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">Koordinat Perangkat Anda</span>
                <p className="mt-0.5 font-mono text-slate-800">
                  Lat: {userLat.toFixed(6)}, Lng: {userLng.toFixed(6)}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">Titik Pusat Outlet</span>
                <p className="mt-0.5 font-mono text-slate-800">
                  Lat: {policy?.geofence_latitude?.toFixed(6) ?? '-'}, Lng:{' '}
                  {policy?.geofence_longitude?.toFixed(6) ?? '-'}
                </p>
              </div>
            </div>

            {/* Simulation buttons for lab / testbed verification */}
            <div className="mt-3 border-t border-slate-200 pt-2 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold text-slate-500">Uji Coba Geofence:</span>
              <button
                type="button"
                onClick={handleSimulateInShop}
                className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
              >
                📍 Simulasi Dalam Resto (30m)
              </button>
              <button
                type="button"
                onClick={handleSimulateOutside}
                className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-800 hover:bg-rose-100 cursor-pointer"
              >
                📍 Simulasi Luar Jangkauan (900m)
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* =================================================================== */}
      {/* 4. BIG TOUCH TARGET ACTION BUTTONS (CLOCK-IN / CLOCK-OUT)           */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Giant Clock-In Button */}
        <button
          type="button"
          onClick={handleClockIn}
          disabled={isSubmitting || isLoading || (policy?.require_geofence && !isWithinGeofence)}
          className={`group relative flex flex-col items-center justify-center rounded-2xl p-6 text-white shadow-lg transition-all duration-200 cursor-pointer ${
            policy?.require_geofence && !isWithinGeofence
              ? 'bg-slate-400 opacity-60 cursor-not-allowed shadow-none'
              : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 hover:shadow-emerald-600/30 active:scale-[0.98]'
          }`}
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xs group-hover:scale-110 transition-transform">
            <Clock className="size-8 text-white" />
          </div>
          <span className="mt-3 font-heading text-xl font-black tracking-wide uppercase">
            CLOCK-IN (ABSEN MASUK)
          </span>
          <p className="mt-1 text-xs text-emerald-100 font-medium">
            Catat jam kedatangan dan mulai giliran kerja hari ini
          </p>
          {policy?.require_geofence && !isWithinGeofence && (
            <span className="mt-2 rounded-md bg-rose-700/80 px-2.5 py-0.5 text-[10px] font-bold text-white">
              Tidak bisa absen: Anda di luar radius {allowedRadius}m
            </span>
          )}
        </button>

        {/* Giant Clock-Out Button */}
        <button
          type="button"
          onClick={handleClockOut}
          disabled={isSubmitting || isLoading}
          className="group relative flex flex-col items-center justify-center rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 p-6 text-white shadow-lg shadow-amber-600/20 hover:from-amber-500 hover:to-orange-500 hover:shadow-amber-600/30 active:scale-[0.98] transition-all duration-200 cursor-pointer"
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xs group-hover:scale-110 transition-transform">
            <ArrowRight className="size-8 text-white" />
          </div>
          <span className="mt-3 font-heading text-xl font-black tracking-wide uppercase">
            CLOCK-OUT (ABSEN PULANG)
          </span>
          <p className="mt-1 text-xs text-amber-100 font-medium">
            Selesaikan jam kerja & catat lembur (jika ada)
          </p>
        </button>
      </div>

      {/* =================================================================== */}
      {/* 5. TODAY'S KIOSK FEED (REKAP PRESENSI HARI INI)                     */}
      {/* =================================================================== */}
      <Card data-spot="table" className="p-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-emerald-600" />
              <h2 className="font-heading text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                Presensi Masuk Hari Ini (<SmoothNumber value={todayAttendance.length} format="number" /> Staf Tercatat)
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Riwayat clock-in terminal {selectedOutlet.name} untuk tanggal {formattedWibDate}.
            </p>
          </div>
        </div>

        {todayAttendance.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Belum ada staf yang melakukan clock-in pada hari ini.
          </div>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {todayAttendance.map((rec) => (
              <div key={rec.id} className="flex items-center justify-between py-2.5 text-xs">
                <div className="flex items-center gap-3">
                  <span className="flex size-7 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-700 text-[11px]">
                    {rec.employee_name.charAt(0)}
                  </span>
                  <div>
                    <p className="font-bold text-slate-900">{rec.employee_name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{rec.employee_code}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-mono font-bold text-slate-800">
                      {rec.clock_in
                        ? new Date(rec.clock_in).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '-'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {rec.clock_out
                        ? `Pulang: ${new Date(rec.clock_out).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
                        : 'Sedang Bertugas'}
                    </p>
                  </div>
                  <Badge variant={rec.status === 'PRESENT' ? 'success' : rec.status === 'LATE' ? 'warning' : 'neutral'}>
                    {rec.status === 'PRESENT' ? 'Tepat Waktu' : rec.status === 'LATE' ? `Telat ${rec.late_minutes}m` : rec.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
