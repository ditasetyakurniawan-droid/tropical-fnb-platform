import {
  AlertCircle,
  Eye,
  EyeOff,
  Flame,
  KeyRound,
  Loader2,
  LogIn,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from './auth-api'
import { useAuthStore } from './auth-store'
import { ApiError } from '@/shared/api/client'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { cn } from '@/shared/lib/cn'
import { Tropical3DCanvas } from './Tropical3DCanvas'

const DEMO_ACCOUNTS = [
  { username: 'owner', label: '👑 Owner / Direksi (Semua Resto)', hint: 'Akses Konsolidasi Group' },
  { username: 'master_chef', label: '👨‍🍳 Master Chef R&D (Semua Dapur)', hint: 'Riset Menu, BOM & KDS' },
  { username: 'spv_steak', label: '🥩 SPV Steak House', hint: 'PIN SPV: 123456' },
  { username: 'kasir_steak', label: '💳 Kasir Steak House', hint: 'Khusus Tropical Steak House' },
  { username: 'spv_garden', label: '🌿 SPV Garden Resto', hint: 'PIN SPV: 123456' },
  { username: 'kasir_garden', label: '💳 Kasir Garden Resto', hint: 'Khusus Tropical Garden Resto' },
]

export function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [username, setUsername] = useState('owner')
  const [password, setPassword] = useState('Password123!')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setErrorMessage('Username dan password wajib diisi.')
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const resp = await login({ username: username.trim(), password })
      setAuth(resp)
      const roleCodes = (resp.roles ?? []).map((r) => r.role_code.toUpperCase())
      const isPureChef =
        roleCodes.includes('KITCHEN_CHEF') &&
        !roleCodes.some((c) =>
          ['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'CASHIER', 'WAITER'].includes(c),
        )
      navigate(isPureChef ? '/erp/menu' : '/pos/tables', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage('Gagal menghubungi server. Pastikan backend aktif.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const fillDemo = (user: string) => {
    setUsername(user)
    setPassword('Password123!')
    setErrorMessage(null)
  }

  return (
    <div className="relative min-h-dvh w-full lg:grid lg:grid-cols-12 bg-[#020b08] text-slate-100 overflow-x-hidden selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* =========================================================================
          ATMOSPHERIC CANVAS: Hardware-Accelerated 3D Tropical Garden & Steakhouse Embers
          ========================================================================= */}
      <Tropical3DCanvas />

      {/* Subtle Depth Micro-Grid Layer */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(#10b98110_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_90%)]" />
      </div>

      {/* =========================================================================
          LEFT PANE: Prestigious Enterprise Showcase & Live Telemetry HUD
          ========================================================================= */}
      <div className="relative z-10 flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-16 lg:col-span-7">
        {/* Top Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/25 bg-[#052119]/70 px-4 py-1.5 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            <span className="font-semibold text-emerald-200 tracking-wide text-[11px]">
              Sistem Multi-Outlet Aktif
            </span>
            <span className="text-emerald-500/40">•</span>
            <span className="text-emerald-400/80 text-[11px]">Manding, Temanggung</span>
          </div>
        </div>

        {/* Center Hero Brand Showcase */}
        <div className="my-8 lg:my-auto space-y-6 max-w-xl">
          {/* Official Emblem Disc with Refined Specular Edge */}
          <div className="flex items-center gap-5 sm:gap-6">
            <div className="relative size-24 sm:size-28 rounded-full p-1 bg-gradient-to-br from-amber-400/50 via-emerald-500/30 to-amber-600/30 shadow-[0_0_45px_rgba(16,185,129,0.2),inset_0_1px_2px_rgba(255,255,255,0.5)] shrink-0">
              <img
                src="/tropical-logo.png"
                alt="Tropical Group Official Seal"
                className="size-full object-contain rounded-full bg-[#021d17]"
              />
              <div className="pointer-events-none absolute inset-0 rounded-full border border-amber-300/40" />
            </div>

            <div className="space-y-1.5">
              <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-[0.22em] bg-amber-400/15 text-amber-300 border border-amber-400/30">
                Enterprise F&amp;B Architecture
              </span>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white flex items-center gap-2">
                Tropical F&amp;B Platform
              </h1>
              <p className="text-xs sm:text-sm text-emerald-300/85 font-medium">
                Pusat Operasional Terpadu • Manding, Kab. Temanggung
              </p>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-300/80 leading-relaxed font-normal">
            Platform operasional multi-cabang terpadu untuk <strong className="text-white font-semibold">Tropical Steak House</strong> dan <strong className="text-white font-semibold">Tropical Garden Resto</strong>. Mengintegrasikan presisi resep 3-Tier HPA, kasir POS realtime, multi-stasiun dapur KDS, dan pengadaan gudang secara otomatis.
          </p>

          {/* Bento Grid: 2 Live Outlet Cards + 1 Financial Engine Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {/* Outlet 1: Steak House */}
            <div className="obsidian-pill rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl">🥩</span>
                <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800/60">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live POS
                </span>
              </div>
              <h2 className="text-xs font-bold text-white tracking-wide">Tropical Steak House</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">Outlet TSH-01 • Grill Dapur</p>
            </div>

            {/* Outlet 2: Garden Resto */}
            <div className="obsidian-pill rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl">🌿</span>
                <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800/60">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Gazebo
                </span>
              </div>
              <h2 className="text-xs font-bold text-white tracking-wide">Tropical Garden Resto</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">Outlet TGR-01 • Nusantara</p>
            </div>

            {/* Financial Engine Feature */}
            <div className="obsidian-pill rounded-2xl p-4 border-amber-400/25 bg-amber-950/15">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl">⚡</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-800/60">
                  Realtime
                </span>
              </div>
              <h2 className="text-xs font-bold text-amber-200 tracking-wide">3-Tier HPA Engine</h2>
              <p className="text-[10px] text-amber-300/70 mt-0.5">Cascading Food Cost USALI</p>
            </div>
          </div>
        </div>

        {/* Bottom Showcase Footnote */}
        <div className="pt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-emerald-400/60">
          <span>Tropical Group Temanggung &copy; {new Date().getFullYear()}</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-emerald-400" />
            Keamanan Data Kuliner &amp; Resep Terisolasi Multi-Tenant
          </span>
        </div>
      </div>

      {/* =========================================================================
          RIGHT PANE: Executive Obsidian Glass Login Portal (VisionOS Crystal)
          ========================================================================= */}
      <div className="relative z-10 lg:col-span-5 flex flex-col justify-center items-center p-6 sm:p-10 lg:p-8 xl:p-12">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile-only brand emblem */}
          <div className="lg:hidden text-center space-y-2 pb-1">
            <div className="mx-auto size-16 rounded-full p-1 bg-[#021d17] border border-amber-400/40 shadow-xl">
              <img
                src="/tropical-logo.png"
                alt="Tropical Logo"
                className="size-full object-contain rounded-full"
              />
            </div>
            <p className="text-xs font-bold text-emerald-300 tracking-wide">
              Sistem Manajemen Terpadu Tropical Group Manding
            </p>
          </div>

          {/* Obsidian Crystal Login Card */}
          <Card className="obsidian-card rounded-[28px] p-6 sm:p-8 border-0 shadow-none text-slate-100">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Card Header */}
              <div className="border-b border-white/[0.08] pb-3.5 flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-white">
                    Masuk ke Akun Anda
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Gunakan kredensial staf atau pemilik resto.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/70 px-2.5 py-1 text-[10px] font-sans font-extrabold uppercase tracking-wider text-emerald-300 shadow-2xs shrink-0">
                  <Sparkles className="size-3 text-amber-400 fill-amber-400" />
                  ENTERPRISE IAM
                </span>
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-950/50 p-3 text-xs text-rose-200 shadow-2xs"
                >
                  <AlertCircle className="size-4 shrink-0 text-rose-400 mt-0.5" aria-hidden />
                  <span className="font-medium">{errorMessage}</span>
                </div>
              )}

              {/* Username Input */}
              <div className="space-y-1.5">
                <label htmlFor="login-username" className="block text-xs font-semibold text-slate-300">
                  Username Pegawai
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <User className="size-4" aria-hidden />
                  </div>
                  <input
                    id="login-username"
                    type="text"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="obsidian-input block w-full rounded-xl py-2.5 pl-10 pr-3 text-sm font-semibold placeholder:text-slate-500 focus:outline-none"
                    placeholder="Contoh: owner, kasir_steak"
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label htmlFor="login-password" className="block text-xs font-semibold text-slate-300">
                  Kata Sandi
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <KeyRound className="size-4" aria-hidden />
                  </div>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="obsidian-input block w-full rounded-xl py-2.5 pl-10 pr-10 text-sm font-semibold placeholder:text-slate-500 focus:outline-none"
                    placeholder="Masukkan kata sandi..."
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-200 focus:outline-none"
                    aria-label={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {/* Submit CTA */}
              <Button
                type="submit"
                variant="primary"
                className="obsidian-gem-btn w-full justify-center py-2.5 mt-2 text-sm font-extrabold text-white glossy-sheen"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-1.5" aria-hidden />
                    Memverifikasi Sesi...
                  </>
                ) : (
                  <>
                    <LogIn className="size-4 mr-1.5" aria-hidden />
                    Masuk Sekarang
                  </>
                )}
              </Button>
            </form>

            {/* Quick Demo Fast-Pass Persona Switcher */}
            <div className="mt-5 border-t border-white/[0.08] pt-4 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Flame className="size-3.5 text-amber-400" />
                  Akun Uji Coba Cepat:
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-slate-300 font-mono text-[10px] font-bold">
                  Sandi: Password123!
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((acc) => {
                  const isSelected = username === acc.username
                  return (
                    <button
                      key={acc.username}
                      type="button"
                      onClick={() => fillDemo(acc.username)}
                      className={cn(
                        'flex flex-col rounded-xl p-2.5 text-left cursor-pointer select-none',
                        isSelected
                          ? 'obsidian-pill bg-emerald-500/15 border-emerald-400/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_16px_rgba(16,185,129,0.2)] ring-1 ring-emerald-400/30'
                          : 'obsidian-pill text-slate-300',
                      )}
                    >
                      <span
                        className={cn(
                          'text-xs tracking-tight',
                          isSelected
                            ? 'font-extrabold text-emerald-200'
                            : 'font-semibold text-slate-200',
                        )}
                      >
                        {acc.label}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                        {acc.hint}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </Card>

          {/* Security & Multi-Tenant Assurance */}
          <div className="text-center space-y-1 text-[11px] text-slate-400">
            <p className="flex items-center justify-center gap-1.5 font-medium text-slate-300">
              <ShieldCheck className="size-3.5 text-emerald-400" />
              <span>Sesi Terenkripsi 256-bit • Multi-Tenant Isolation</span>
            </p>
            <p className="text-slate-500">
              Tropical Group Temanggung &copy; {new Date().getFullYear()} • Modul IAM &amp; Multi-Outlet
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
