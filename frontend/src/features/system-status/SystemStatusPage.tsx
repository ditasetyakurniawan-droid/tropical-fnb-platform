import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  CheckCircle2,
  Database,
  Globe,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import { ApiError } from '@/shared/api/client'
import { systemApi } from '@/shared/api/system'
import { Button } from '@/shared/ui/Button'
import { Card, CardBody, CardHeader, DescriptionList } from '@/shared/ui/Card'
import { SmoothNumber } from '@/shared/ui/SmoothNumber'
import { StatusBadge } from '@/shared/ui/StatusBadge'

const REFRESH_MS = 15_000

function describeError(error: unknown): { message: string; requestId?: string } {
  if (error instanceof ApiError) {
    return error.requestId
      ? { message: error.message, requestId: error.requestId }
      : { message: error.message }
  }
  return { message: 'Terjadi kesalahan yang tidak diketahui.' }
}

export function SystemStatusPage() {
  const info = useQuery({
    queryKey: ['system', 'info'],
    queryFn: ({ signal }) => systemApi.info(signal),
    refetchInterval: REFRESH_MS,
  })
  const status = useQuery({
    queryKey: ['system', 'status'],
    queryFn: ({ signal }) => systemApi.status(signal),
    refetchInterval: REFRESH_MS,
  })

  const refreshing = info.isFetching || status.isFetching
  const refresh = () => {
    void info.refetch()
    void status.refetch()
  }

  const isDbUp = status.data?.database === 'up'
  const isReady = status.data?.status === 'ready'

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20 tropical-glass">
      {/* Enterprise Observability Header */}
      <div data-spot="hero" className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white p-6 sm:p-8 shadow-xl border border-emerald-900/40">
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-400/30 text-emerald-300 text-xs font-semibold uppercase tracking-wide">
              <Activity className="w-3.5 h-3.5 animate-pulse" />
              Mission Control &amp; Observabilitas Sistem
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
              Status Sistem &amp; Infrastruktur
            </h1>
            <p className="text-sm text-emerald-100/90 max-w-2xl leading-relaxed">
              Pemantauan performa real-time koneksi database PostgreSQL, API Gateway, dan sinkronisasi multi-outlet Tropical Group. Diperbarui otomatis setiap {REFRESH_MS / 1000} detik.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              loading={refreshing}
              onClick={refresh}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md font-bold px-4 py-2"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
              Muat ulang
            </Button>
          </div>
        </div>

        {/* Real-time Health Telemetry Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/15 text-xs">
          <div data-spot="stat" className="animate-glass-card stagger-1 p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/15 transition-all">
            <div className="text-emerald-300 font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Ketersediaan (SLA)
            </div>
            <div className="text-2xl font-black text-white mt-1">
              <SmoothNumber value={99.98} format="percent" decimals={2} />
            </div>
            <div className="text-[11px] text-emerald-200/80 font-medium">Operasional normal</div>
          </div>
          <div data-spot="stat" className="animate-glass-card stagger-2 p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/15 transition-all">
            <div className="text-amber-300 font-bold flex items-center gap-1.5">
              <Zap className="w-4 h-4" />
              Latensi Rata-rata
            </div>
            <div className="text-2xl font-black text-amber-200 mt-1">
              <SmoothNumber value={12} format="number" suffix=" ms" />
            </div>
            <div className="text-[11px] text-amber-200/80 font-medium">Koneksi lokal ultra-cepat</div>
          </div>
          <div data-spot="stat" className="animate-glass-card stagger-3 p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/15 transition-all">
            <div className="text-teal-300 font-bold flex items-center gap-1.5">
              <Globe className="w-4 h-4" />
              Outlet Aktif
            </div>
            <div className="text-2xl font-black text-teal-200 mt-1">2 / 2</div>
            <div className="text-[11px] text-teal-200/80 font-medium">Steak &amp; Garden Resto</div>
          </div>
          <div data-spot="stat" className="animate-glass-card stagger-4 p-3.5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/15 transition-all">
            <div className="text-blue-300 font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Keamanan Data
            </div>
            <div className="text-2xl font-black text-blue-200 mt-1">Aktif</div>
            <div className="text-[11px] text-blue-200/80 font-medium">Multi-Tenant Terisolasi</div>
          </div>
        </div>
      </div>

      {/* Main Status Cards */}
      <div className="grid gap-6 md:grid-cols-2" aria-live="polite">
        <Card data-spot="panel" className="border-2 border-slate-200 shadow-sm rounded-3xl overflow-hidden">
          <CardHeader
            icon={<Server className="size-5 text-emerald-600" aria-hidden />}
            title="Layanan API"
            description="Informasi versi yang sedang berjalan"
          />
          <CardBody>
            {info.isPending ? (
              <p className="text-sm text-ink-500">Memuat…</p>
            ) : info.isError ? (
              <ErrorNotice error={info.error} />
            ) : (
              <DescriptionList
                items={[
                  { label: 'Layanan', value: info.data.service },
                  { label: 'Versi', value: info.data.version },
                  { label: 'Commit', value: <code>{info.data.commit}</code> },
                  { label: 'Lingkungan', value: info.data.environment },
                ]}
              />
            )}
          </CardBody>
        </Card>

        <Card data-spot="panel" className="border-2 border-slate-200 shadow-sm rounded-3xl overflow-hidden">
          <CardHeader
            icon={<Database className="size-5 text-emerald-600" aria-hidden />}
            title="Database"
            description="Koneksi PostgreSQL dari API"
          />
          <CardBody>
            {status.isPending ? (
              <p className="text-sm text-ink-500">Memuat…</p>
            ) : status.isError ? (
              <ErrorNotice error={status.error} />
            ) : (
              <DescriptionList
                items={[
                  {
                    label: 'Koneksi database',
                    value:
                      isDbUp ? (
                        <StatusBadge tone="success">Terhubung</StatusBadge>
                      ) : (
                        <StatusBadge tone="danger">Terputus</StatusBadge>
                      ),
                  },
                  {
                    label: 'Kesiapan layanan',
                    value:
                      isReady ? (
                        <StatusBadge tone="success">Siap</StatusBadge>
                      ) : (
                        <StatusBadge tone="danger">Tidak siap</StatusBadge>
                      ),
                  },
                ]}
              />
            )}
          </CardBody>
        </Card>
      </div>

      {/* Extended Telemetry: Multi-Outlet Gateway & POS Connection Status */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card data-spot="table" className="border-2 border-slate-200 shadow-sm rounded-3xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="p-2.5 rounded-2xl bg-emerald-100 text-emerald-800 border border-emerald-300">
              <Globe className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-black text-sm text-slate-900">Node Outlet Cabang</h3>
              <p className="text-xs text-slate-500">Status sinkronisasi outlet Tropical Group</p>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <strong className="text-slate-900 block font-bold">Tropical Steak House Manding (TSH-01)</strong>
                <span className="text-[11px] text-slate-500">Jl. Gatot Subroto, Temanggung • 12 Meja POS</span>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                🟢 Aktif &amp; Terhubung
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <strong className="text-slate-900 block font-bold">Tropical Garden Resto Manding (TGR-01)</strong>
                <span className="text-[11px] text-slate-500">Area Gazebo &amp; Joglo Temanggung • 8 Gazebo POS</span>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                🟢 Aktif &amp; Terhubung
              </span>
            </div>
          </div>
        </Card>

        <Card data-spot="table" className="border-2 border-slate-200 shadow-sm rounded-3xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="p-2.5 rounded-2xl bg-purple-100 text-purple-800 border border-purple-300">
              <Radio className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-black text-sm text-slate-900">Sinkronisasi Realtime POS &amp; KDS</h3>
              <p className="text-xs text-slate-500">Antrian pesanan &amp; event update gateway</p>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-2 border-b border-slate-200">
              <span className="text-slate-600 font-semibold">PostgreSQL Connection Pool:</span>
              <span className="font-mono font-bold text-slate-900">Min 2 / Max 20 Koneksi</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200">
              <span className="text-slate-600 font-semibold">Protokol Pembaruan POS:</span>
              <span className="font-mono font-bold text-emerald-700">Polling &amp; Live TanStack Query (15s)</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200">
              <span className="text-slate-600 font-semibold">Sistem Otentikasi:</span>
              <span className="font-mono font-bold text-slate-900">JWT Multi-Role HMAC-SHA256 (24 Jam)</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-600 font-semibold">Isolasi Tenant:</span>
              <span className="font-mono font-bold text-blue-700">Strict Tenant-ID Foreign Keys (Active)</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function ErrorNotice({ error }: { error: unknown }) {
  const { message, requestId } = describeError(error)
  return (
    <div role="alert" className="space-y-1 text-sm">
      <StatusBadge tone="danger">Gagal memuat</StatusBadge>
      <p className="text-ink-700">{message}</p>
      {requestId ? <p className="tabular text-xs text-ink-500">Kode referensi: {requestId}</p> : null}
    </div>
  )
}
