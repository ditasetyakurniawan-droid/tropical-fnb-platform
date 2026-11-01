import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/app/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { useAuthStore } from '@/features/auth/auth-store'
import { MenuRecipePage } from '@/features/menu/MenuRecipePage'
import { SystemStatusPage } from '@/features/system-status/SystemStatusPage'
import { ApiError, getLastRequestId } from '@/shared/api/client'
import { getAppConfig } from '@/shared/config/runtime-config'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  requestId: string
  copied: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    requestId: '',
    copied: false,
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const reqId =
      getLastRequestId() ??
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `client-${Date.now()}`)
    return { hasError: true, error, requestId: reqId }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught unhandled error:', error, errorInfo)

    // Send crash telemetry to backend client-logs endpoint
    try {
      const payload = {
        req_id: this.state.requestId,
        message: error.message || 'Unknown React component error',
        stack: error.stack || '',
        component_stack: errorInfo.componentStack || '',
        route: window.location.pathname,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      }

      fetch(`${getAppConfig().apiBaseUrl}/api/v1/system/client-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Fire-and-forget: ignore network errors during error boundary display
      })
    } catch {
      // Ignore telemetry failure
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  handleCopyRequestId = () => {
    if (this.state.requestId && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(this.state.requestId).catch(() => {})
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    }
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl border border-rose-200 p-6 shadow-xl text-center">
            <div className="size-12 mx-auto rounded-full bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-xl mb-3">
              !
            </div>
            <h2 className="text-lg font-bold text-slate-900">Terjadi Kendala Memuat Halaman</h2>
            <p className="text-xs text-slate-500 mt-2 mb-3">
              {this.state.error?.message || 'Terjadi kesalahan sistem yang tidak terduga.'}
            </p>

            {this.state.requestId && (
              <div className="bg-slate-100 rounded-lg p-2.5 my-3 flex items-center justify-between text-left">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    Kode Tiket Error (Request ID)
                  </span>
                  <span className="text-xs font-mono font-semibold text-slate-800 select-all">
                    {this.state.requestId}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={this.handleCopyRequestId}
                  className="px-2.5 py-1 text-[11px] font-medium bg-white hover:bg-slate-200 border border-slate-300 rounded shadow-xs text-slate-700 transition-colors"
                >
                  {this.state.copied ? 'Tersalin!' : 'Salin ID'}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={this.handleReload}
              className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}


/** Retry transient failures only; never hammer on 4xx client errors. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
  return failureCount < 2
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, refetchOnWindowFocus: true, staleTime: 5_000 },
    },
  })
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const roles = useAuthStore((s) => s.roles)
  if (isAuthenticated) {
    const roleCodes = roles.map((r) => r.role_code.toUpperCase())
    const isPureChef =
      roleCodes.includes('KITCHEN_CHEF') &&
      !roleCodes.some((c) =>
        ['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'CASHIER', 'WAITER'].includes(c),
      )
    return <Navigate to={isPureChef ? '/erp/menu' : '/pos/tables'} replace />
  }
  return <>{children}</>
}

interface RoleRouteGuardProps {
  allowedRoles: string[]
  children: ReactNode
  redirectTo?: string
}

export function RoleRouteGuard({ allowedRoles, children, redirectTo = '/pos/tables' }: RoleRouteGuardProps) {
  const roles = useAuthStore((s) => s.roles)

  const userRoleCodes = roles.map((r) => r.role_code.toUpperCase())
  const isOwner = userRoleCodes.includes('OWNER')
  if (isOwner) {
    return <>{children}</>
  }

  const hasAccess = allowedRoles.some((role) => userRoleCodes.includes(role))

  if (!hasAccess) {
    const fallback = userRoleCodes.includes('KITCHEN_CHEF') ? '/erp/menu' : redirectTo
    return <Navigate to={fallback} replace />
  }

  return <>{children}</>
}

import { TableFloorPlanPage } from '@/features/pos/TableFloorPlanPage'
import { CashierPOSPage } from '@/features/pos/CashierPOSPage'
import { ReservationsPage } from '@/features/pos/ReservationsPage'
import { KitchenDisplayPage } from '@/features/kds/KitchenDisplayPage'
import { PayrollPage } from '@/features/payroll/PayrollPage'
import { StaffAttendancePage } from '@/features/payroll/StaffAttendancePage'
import { InventoryProcurementPage } from '@/features/inventory/InventoryProcurementPage'
import { FinancialReportsPage } from '@/features/finance/FinancialReportsPage'
import { LoyaltyVouchersPage } from '@/features/crm/LoyaltyVouchersPage'
import { SOPQualityPage } from '@/features/sop/SOPQualityPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/pos/tables" replace />} />
        <Route
          path="/pos/tables"
          element={
            <RoleRouteGuard
              allowedRoles={['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'CASHIER', 'WAITER']}
              redirectTo="/erp/menu"
            >
              <TableFloorPlanPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/pos/cashier"
          element={
            <RoleRouteGuard allowedRoles={['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'CASHIER']}>
              <CashierPOSPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/pos/reservations"
          element={
            <RoleRouteGuard allowedRoles={['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'CASHIER']}>
              <ReservationsPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/pos/kds"
          element={
            <RoleRouteGuard allowedRoles={['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'KITCHEN_CHEF']}>
              <KitchenDisplayPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/absen"
          element={
            <RoleRouteGuard allowedRoles={['OWNER', 'OUTLET_MANAGER']}>
              <StaffAttendancePage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/erp/menu"
          element={
            <RoleRouteGuard allowedRoles={['OWNER', 'OUTLET_MANAGER', 'KITCHEN_CHEF']}>
              <MenuRecipePage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/erp/inventory"
          element={
            <RoleRouteGuard allowedRoles={['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'KITCHEN_CHEF']}>
              <InventoryProcurementPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/erp/payroll"
          element={
            <RoleRouteGuard allowedRoles={['OWNER', 'OUTLET_MANAGER']}>
              <PayrollPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/erp/finance"
          element={
            <RoleRouteGuard allowedRoles={['OWNER', 'OUTLET_MANAGER']}>
              <FinancialReportsPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/erp/crm"
          element={
            <RoleRouteGuard allowedRoles={['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR']}>
              <LoyaltyVouchersPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/erp/sop"
          element={
            <RoleRouteGuard allowedRoles={['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR', 'KITCHEN_CHEF']}>
              <SOPQualityPage />
            </RoleRouteGuard>
          }
        />
        <Route
          path="/erp/system-status"
          element={
            <RoleRouteGuard allowedRoles={['OWNER']}>
              <SystemStatusPage />
            </RoleRouteGuard>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-sm font-medium text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-sm text-ink-500">Alamat yang Anda buka tidak tersedia atau sudah dipindahkan.</p>
    </div>
  )
}

export function App({ queryClient }: { queryClient: QueryClient }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppRoutes />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
