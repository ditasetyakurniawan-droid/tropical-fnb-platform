import { Activity, ChefHat, ChevronRight, ClipboardCheck, Gift, LogOut, Package, Smartphone, TrendingUp, User, UtensilsCrossed, Wallet } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { OutletSwitcher } from '@/features/auth/OutletSwitcher'
import { useAuthStore } from '@/features/auth/auth-store'
import { cn } from '@/shared/lib/cn'
import {
  FloorPlanIcon,
  POSTerminalIcon,
  EventReservationIcon,
} from '@/shared/components/icons/EnterpriseIcons'
import { PageTransition } from '@/shared/components/transitions/PageTransition'
import { Tropical3DCanvas } from '@/features/auth/Tropical3DCanvas'
import { useTropicalGlass } from '@/shared/glass/useTropicalGlass'

interface NavItem {
  to: string
  label: string
  sublabel: string
  badge?: string
  badgeColor?: string
  allowedRoles?: string[]
  icon: (active: boolean) => ReactNode
  theme: {
    iconBgActive: string
    iconBgInactive: string
    indicatorColor: string
  }
}

interface NavGroup {
  id: string
  title: string
  items: NavItem[]
  allowedRoles?: string[]
}

const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'pos-ops',
    title: 'Operasional Outlet (FOH & BOH)',
    allowedRoles: ['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'CASHIER', 'WAITER', 'KITCHEN_CHEF'],
    items: [
      {
        to: '/pos/tables',
        label: 'Denah Meja & Gazebo',
        sublabel: 'Layout & Status Meja',
        allowedRoles: ['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'CASHIER', 'WAITER'],
        icon: (active) => <FloorPlanIcon className={cn('size-4', active ? 'text-white' : 'text-emerald-300')} aria-hidden />,
        theme: {
          iconBgActive: 'bg-emerald-600 shadow-xs text-white',
          iconBgInactive: 'bg-[#093527] text-emerald-300 border border-emerald-800/60',
          indicatorColor: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
        },
      },
      {
        to: '/pos/cashier',
        label: 'Kasir POS Touch',
        sublabel: 'Billing & Pembayaran',
        allowedRoles: ['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'CASHIER'],
        icon: (active) => <POSTerminalIcon className={cn('size-4', active ? 'text-white' : 'text-amber-300')} aria-hidden />,
        theme: {
          iconBgActive: 'bg-amber-600 shadow-xs text-white',
          iconBgInactive: 'bg-[#2b220d] text-amber-300 border border-amber-800/50',
          indicatorColor: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]',
        },
      },
      {
        to: '/pos/kds',
        label: 'Layar Dapur KDS',
        sublabel: 'Kitchen Multi-Stasiun',
        badge: 'Live',
        badgeColor: 'bg-orange-500/20 text-orange-300 border border-orange-500/40',
        allowedRoles: ['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'KITCHEN_CHEF'],
        icon: (active) => <ChefHat className={cn('size-4', active ? 'text-white' : 'text-orange-300')} aria-hidden />,
        theme: {
          iconBgActive: 'bg-orange-600 shadow-xs text-white',
          iconBgInactive: 'bg-[#2f1b0a] text-orange-300 border border-orange-800/50',
          indicatorColor: 'bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.8)]',
        },
      },
      {
        to: '/pos/reservations',
        label: 'Reservasi & Banquet',
        sublabel: 'Gathering & Pre-Order',
        allowedRoles: ['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'CASHIER'],
        icon: (active) => <EventReservationIcon className={cn('size-4', active ? 'text-white' : 'text-purple-300')} aria-hidden />,
        theme: {
          iconBgActive: 'bg-purple-600 shadow-xs text-white',
          iconBgInactive: 'bg-[#251336] text-purple-300 border border-purple-800/50',
          indicatorColor: 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]',
        },
      },
      {
        to: '/erp/sop',
        label: 'SOP & Kontrol Kualitas',
        sublabel: 'Checklist & Audit Mutu',
        allowedRoles: ['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'KITCHEN_CHEF'],
        icon: (active) => <ClipboardCheck className={cn('size-4', active ? 'text-white' : 'text-teal-300')} aria-hidden />,
        theme: {
          iconBgActive: 'bg-teal-600 shadow-xs text-white',
          iconBgInactive: 'bg-[#0a2f2b] text-teal-300 border border-teal-800/50',
          indicatorColor: 'bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.8)]',
        },
      },
    ],
  },
  {
    id: 'field-staff',
    title: 'Staf Lapangan',
    allowedRoles: ['OWNER', 'OUTLET_MANAGER'],
    items: [
      {
        to: '/absen',
        label: 'Absensi Kiosk Staf',
        sublabel: 'Clock-In/Out Geofence',
        allowedRoles: ['OWNER', 'OUTLET_MANAGER'],
        icon: (active) => <Smartphone className={cn('size-4', active ? 'text-white' : 'text-rose-300')} aria-hidden />,
        theme: {
          iconBgActive: 'bg-rose-600 shadow-xs text-white',
          iconBgInactive: 'bg-[#2f111a] text-rose-300 border border-rose-800/50',
          indicatorColor: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]',
        },
      },
    ],
  },
  {
    id: 'backoffice-fnb',
    title: 'Backoffice & Manajemen F&B',
    allowedRoles: ['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'KITCHEN_CHEF'],
    items: [
      {
        to: '/erp/menu',
        label: 'Menu & Resep HPA',
        sublabel: 'Resep, Bahan & Modal',
        allowedRoles: ['OWNER', 'OUTLET_MANAGER', 'KITCHEN_CHEF'],
        icon: (active) => <UtensilsCrossed className={cn('size-4', active ? 'text-white' : 'text-teal-300')} aria-hidden />,
        theme: {
          iconBgActive: 'bg-teal-600 shadow-xs text-white',
          iconBgInactive: 'bg-[#0a2f2b] text-teal-300 border border-teal-800/50',
          indicatorColor: 'bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.8)]',
        },
      },
      {
        to: '/erp/inventory',
        label: 'Pengadaan & Gudang PO',
        sublabel: 'Timbangan, Mutasi & HPA',
        allowedRoles: ['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'KITCHEN_CHEF'],
        icon: (active) => <Package className={cn('size-4', active ? 'text-white' : 'text-amber-300')} aria-hidden />,
        theme: {
          iconBgActive: 'bg-amber-600 shadow-xs text-white',
          iconBgInactive: 'bg-[#2b220d] text-amber-300 border border-amber-800/50',
          indicatorColor: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]',
        },
      },
      {
        to: '/erp/payroll',
        label: 'SDM & Payroll',
        sublabel: 'Slip Gaji & Kasbon',
        allowedRoles: ['OWNER', 'OUTLET_MANAGER'],
        icon: (active) => <Wallet className={cn('size-4', active ? 'text-white' : 'text-indigo-300')} aria-hidden />,
        theme: {
          iconBgActive: 'bg-indigo-600 shadow-xs text-white',
          iconBgInactive: 'bg-[#151c38] text-indigo-300 border border-indigo-800/50',
          indicatorColor: 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]',
        },
      },
      {
        to: '/erp/finance',
        label: 'Keuangan & Laba Rugi',
        sublabel: 'P&L, Net Margin & BEP',
        allowedRoles: ['OWNER', 'OUTLET_MANAGER'],
        icon: (active) => <TrendingUp className={cn('size-4', active ? 'text-white' : 'text-emerald-300')} aria-hidden />,
        theme: {
          iconBgActive: 'bg-emerald-600 shadow-xs text-white',
          iconBgInactive: 'bg-[#093527] text-emerald-300 border border-emerald-800/60',
          indicatorColor: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
        },
      },
      {
        to: '/erp/crm',
        label: 'CRM, Poin & Voucher',
        sublabel: 'Member VIP & Promo',
        allowedRoles: ['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR'],
        icon: (active) => <Gift className={cn('size-4', active ? 'text-white' : 'text-purple-300')} aria-hidden />,
        theme: {
          iconBgActive: 'bg-purple-600 shadow-xs text-white',
          iconBgInactive: 'bg-[#251336] text-purple-300 border border-purple-800/50',
          indicatorColor: 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]',
        },
      },
    ],
  },
  {
    id: 'system-cloud',
    title: 'Infrastruktur',
    allowedRoles: ['OWNER'],
    items: [
      {
        to: '/erp/system-status',
        label: 'Status Sistem',
        sublabel: 'Database & Cloud Health',
        allowedRoles: ['OWNER'],
        icon: (active) => <Activity className={cn('size-4', active ? 'text-white' : 'text-slate-300')} aria-hidden />,
        theme: {
          iconBgActive: 'bg-slate-700 shadow-xs text-white',
          iconBgInactive: 'bg-[#131d27] text-slate-300 border border-slate-700/50',
          indicatorColor: 'bg-slate-400 shadow-[0_0_8px_rgba(148,163,184,0.8)]',
        },
      },
    ],
  },
]

function Brand({ variant = 'dark' }: { variant?: 'light' | 'dark' }) {
  const isDark = variant === 'dark'
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#032b23] border border-amber-400/35 shadow-sm overflow-hidden p-0.5">
        <img
          src="/tropical-logo.png"
          alt="Tropical Logo"
          className="size-full object-contain"
        />
      </div>
      <div className="leading-tight">
        <div className="flex items-center gap-1.5">
          <p className={cn('text-sm font-extrabold tracking-tight', isDark ? 'text-white' : 'text-slate-900')}>
            Tropical F&amp;B
          </p>
          <span
            className={cn(
              'px-1.5 py-0.2 text-[9px] font-black rounded uppercase',
              isDark
                ? 'bg-amber-400/20 text-amber-300 border border-amber-400/35'
                : 'bg-emerald-100 text-emerald-800',
            )}
          >
            ERP
          </span>
        </div>
        <p className={cn('text-[11px] font-medium', isDark ? 'text-emerald-200/60' : 'text-slate-500')}>
          Manding, Temanggung
        </p>
      </div>
    </div>
  )
}

export function AppShell() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const roles = useAuthStore((s) => s.roles)
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const location = useLocation()
  const primaryRole = roles[0]?.role_name ?? 'Staf'

  const userRoleCodes = useMemo(() => roles.map((r) => r.role_code.toUpperCase()), [roles])
  const isOwner = userRoleCodes.includes('OWNER')

  const visibleNavGroups = useMemo(() => {
    return NAV_GROUPS.map((group) => {
      const filteredItems = group.items.filter((item) => {
        if (isOwner) return true
        if (!item.allowedRoles || item.allowedRoles.length === 0) return true
        return item.allowedRoles.some((role) => userRoleCodes.includes(role))
      })
      return { ...group, items: filteredItems }
    }).filter((group) => {
      if (isOwner) return true
      if (!group.allowedRoles || group.allowedRoles.length === 0) return group.items.length > 0
      return group.allowedRoles.some((role) => userRoleCodes.includes(role)) && group.items.length > 0
    })
  }, [isOwner, userRoleCodes])

  const visibleNavItems = useMemo(() => {
    return visibleNavGroups.flatMap((group) => group.items)
  }, [visibleNavGroups])

  const breadcrumb = (() => {
    const path = location.pathname
    if (path.startsWith('/pos/tables')) return { module: 'POS Operasional', page: 'Denah Meja & Gazebo' }
    if (path.startsWith('/pos/cashier')) return { module: 'POS Kasir Touch', page: 'Terminal Order & Billing' }
    if (path.startsWith('/pos/kds')) return { module: 'Dapur & KDS', page: 'Layar Dapur Multi-Stasiun' }
    if (path.startsWith('/pos/reservations')) return { module: 'Front Desk & Event', page: 'Reservasi & Gathering' }
    if (path.startsWith('/absen')) return { module: 'Presensi Staf', page: 'Kiosk Absen Masuk & Pulang' }
    if (path.startsWith('/erp/menu')) return { module: 'Kitchen ERP', page: 'Menu, Resep & Hitung Modal' }
    if (path.startsWith('/erp/inventory')) return { module: 'Gudang & Logistik', page: 'Pengadaan, Timbangan & HPA' }
    if (path.startsWith('/erp/payroll')) return { module: 'HRIS & Penggajian', page: 'Presensi GPS, Kasbon & Slip Gaji' }
    if (path.startsWith('/erp/finance')) return { module: 'Keuangan & Laba Rugi', page: 'Laba Rugi Realtime (P&L) & BEP' }
    if (path.startsWith('/erp/crm')) return { module: 'CRM & Loyalitas', page: 'Member VIP & Promo Voucher' }
    if (path.startsWith('/erp/sop')) return { module: 'Mutu & SOP', page: 'Kontrol Kualitas & Checklist' }
    if (path.startsWith('/erp/system-status')) return { module: 'Infrastruktur & Cloud', page: 'Status Sistem & Database' }
    return { module: 'Tropical Enterprise', page: 'Dashboard ERP' }
  })()

  useTropicalGlass()

  return (
    <div className="tropical-glass relative min-h-dvh lg:grid lg:grid-cols-[17.5rem_1fr] bg-transparent">
      {/* 3D Photorealistic Tropical Garden & Steakhouse Parallax Canvas (Subtle Ambient Mode) */}
      <Tropical3DCanvas variant="subtle" />

      {/* Living Ambient Background: Architectural Dot Grid Texture */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(#0f172a08_1px,transparent_1px)] [background-size:24px_24px]" />
      </div>

      {/* Desktop Sidebar (Deep Tropical Green Theme) */}
      <aside
        className="hidden border-r border-[#0d3b2e] bg-gradient-to-b from-[#06241b] via-[#082b20] to-[#041a13] text-slate-200 lg:flex lg:flex-col h-dvh sticky top-0 shadow-xl"
        aria-label="Navigasi utama"
      >
        <div className="border-b border-[#0d3b2e] px-4 py-3.5 bg-[#041a13]/40">
          <Brand variant="dark" />
        </div>
        <nav className="flex-1 space-y-4 p-3 overflow-y-auto">
          {visibleNavGroups.map((group) => (
            <div key={group.id} className="space-y-1">
              <div className="px-2.5 pb-1 text-[10px] font-black uppercase tracking-wider text-emerald-400/75">
                {group.title}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center justify-between rounded-xl px-2.5 py-2 transition-all duration-150',
                        isActive
                          ? 'bg-[#0e3b2e] shadow-sm border border-emerald-500/35 text-white'
                          : 'hover:bg-[#0a3528]/70 text-slate-300 hover:text-white',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Left indicator bar when active */}
                        {isActive && (
                          <span
                            className={cn(
                              'absolute -left-3 top-2 bottom-2 w-1.5 rounded-r-full',
                              item.theme.indicatorColor,
                            )}
                            aria-hidden
                          />
                        )}

                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={cn(
                              'flex size-7 shrink-0 items-center justify-center rounded-lg transition-all duration-150',
                              isActive ? item.theme.iconBgActive : item.theme.iconBgInactive,
                            )}
                          >
                            {item.icon(isActive)}
                          </span>
                          <div className="flex flex-col truncate leading-tight">
                            <span
                              className={cn(
                                'truncate text-xs font-bold',
                                isActive ? 'text-white' : 'text-slate-200 group-hover:text-white',
                              )}
                            >
                              {item.label}
                            </span>
                            <span
                              className={cn(
                                'truncate text-[10px] font-normal',
                                isActive ? 'text-emerald-300' : 'text-emerald-100/40 group-hover:text-emerald-100/70',
                              )}
                            >
                              {item.sublabel}
                            </span>
                          </div>
                        </div>

                        {item.badge && (
                          <span
                            className={cn(
                              'ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded-md shrink-0 uppercase tracking-wider',
                              item.badgeColor || 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50',
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer: Current user info */}
        {user && (
          <div className="border-t border-[#0d3b2e] p-3 bg-[#041a13]/60">
            <div className="flex items-center justify-between rounded-xl bg-[#08291f] border border-emerald-900/50 p-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold shadow-xs">
                  {user.full_name ? user.full_name.charAt(0).toUpperCase() : <User className="size-4" />}
                </span>
                <div className="flex flex-col truncate leading-tight">
                  <span className="truncate text-xs font-semibold text-white">{user.full_name}</span>
                  <span className="truncate text-[10px] text-emerald-300/80">{primaryRole}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="shrink-0 p-1.5 text-emerald-300/80 hover:text-red-300 rounded-lg hover:bg-red-950/40 transition-colors"
                title="Keluar / Logout"
                aria-label="Keluar dari akun"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-col">
        {/* Top Navbar Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/80 bg-white/85 px-4 py-2.5 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            <div className="lg:hidden">
              <Brand variant="light" />
            </div>
            <div className="hidden lg:flex items-center gap-2 text-xs">
              <span className="font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md tracking-wide uppercase text-[10px]">
                {breadcrumb.module}
              </span>
              <ChevronRight className="size-3 text-slate-400" />
              <span className="font-black text-slate-900 bg-slate-100/90 border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs">
                {breadcrumb.page}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Global Outlet Switcher */}
            <OutletSwitcher />

            {/* User Profile & Logout (Mobile/Tablet Header only - desktop shows user dock in sidebar) */}
            {user && (
              <div className="hidden sm:flex lg:hidden items-center gap-2 border-l border-slate-200 pl-3">
                <span className="text-xs font-bold text-slate-800 bg-slate-100/80 px-2.5 py-1.5 rounded-lg border border-slate-200">
                  {user.full_name}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700 transition-colors shadow-2xs"
                  title="Keluar"
                >
                  <LogOut className="size-3.5 text-rose-600" aria-hidden />
                  <span>Keluar</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Mobile Navigation bar */}
        <div className="sticky top-[49px] z-20 border-b border-[#0d3b2e] bg-[#06241b] px-3 py-2 lg:hidden shadow-sm">
          <nav className="-mx-1 flex gap-1.5 overflow-x-auto scrollbar-none px-1" aria-label="Navigasi utama mobile">
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all',
                    isActive
                      ? 'bg-emerald-600 text-white shadow-xs border border-emerald-400/40'
                      : 'bg-[#093024] text-slate-300 hover:bg-[#0c3d2e] hover:text-white border border-emerald-900/50',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-md text-[11px]',
                        isActive ? item.theme.iconBgActive : item.theme.iconBgInactive,
                      )}
                    >
                      {item.icon(isActive)}
                    </span>
                    <span>{item.label}</span>
                    {item.badge && (
                      <span
                        className={cn(
                          'px-1 py-0.2 text-[8px] font-black rounded uppercase',
                          isActive ? 'bg-white/20 text-white' : item.badgeColor || 'bg-slate-200 text-slate-700',
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
  )
}
