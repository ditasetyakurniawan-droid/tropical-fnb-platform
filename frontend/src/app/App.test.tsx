import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ErrorBoundary, RoleRouteGuard } from './App'
import { useAuthStore } from '@/features/auth/auth-store'
import { setLastRequestId } from '@/shared/api/client'

function CrashingChild(): React.ReactNode {
  throw new Error('Component crashed during render')
}

describe('ErrorBoundary', () => {
  it('renders children normally when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Normal Content</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('Normal Content')).toBeInTheDocument()
  })

  it('catches render error, displays friendly fallback, and shows copyable request ID', async () => {
    // Suppress console.error during expected crash test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))

    setLastRequestId('test-err-req-12345')

    render(
      <ErrorBoundary>
        <CrashingChild />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Terjadi Kendala Memuat Halaman')).toBeInTheDocument()
    expect(screen.getByText('Component crashed during render')).toBeInTheDocument()
    expect(screen.getByText('test-err-req-12345')).toBeInTheDocument()

    const copyBtn = screen.getByRole('button', { name: /Salin ID/i })
    expect(copyBtn).toBeInTheDocument()

    // Verify telemetry beacon attempted
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/system/client-logs'),
      expect.objectContaining({
        method: 'POST',
      }),
    )

    consoleSpy.mockRestore()
    fetchSpy.mockRestore()
  })
})

describe('RoleRouteGuard', () => {
  beforeEach(() => {
    useAuthStore.getState().logout()
  })

  it('allows access when user has an authorized role (e.g. SUPERVISOR accessing inventory)', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      roles: [{ role_code: 'SUPERVISOR', role_name: 'Supervisor' }],
      isGlobalAllOutlets: false,
    })

    render(
      <MemoryRouter initialEntries={['/erp/inventory']}>
        <Routes>
          <Route
            path="/erp/inventory"
            element={
              <RoleRouteGuard allowedRoles={['OWNER', 'OUTLET_MANAGER', 'SUPERVISOR']}>
                <div>Akses Gudang Diizinkan</div>
              </RoleRouteGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Akses Gudang Diizinkan')).toBeInTheDocument()
  })

  it('redirects to /pos/tables when user role is not authorized (e.g. SUPERVISOR accessing payroll)', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      roles: [{ role_code: 'SUPERVISOR', role_name: 'Supervisor' }],
      isGlobalAllOutlets: false,
    })

    render(
      <MemoryRouter initialEntries={['/erp/payroll']}>
        <Routes>
          <Route
            path="/erp/payroll"
            element={
              <RoleRouteGuard allowedRoles={['OWNER', 'OUTLET_MANAGER']}>
                <div>Akses Payroll Rahasia</div>
              </RoleRouteGuard>
            }
          />
          <Route path="/pos/tables" element={<div>Halaman Denah Meja Fallback</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByText('Akses Payroll Rahasia')).not.toBeInTheDocument()
    expect(screen.getByText('Halaman Denah Meja Fallback')).toBeInTheDocument()
  })

  it('grants full access to OWNER across all routes regardless of allowedRoles', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      roles: [{ role_code: 'OWNER', role_name: 'Owner' }],
      isGlobalAllOutlets: true,
    })

    render(
      <MemoryRouter initialEntries={['/erp/finance']}>
        <Routes>
          <Route
            path="/erp/finance"
            element={
              <RoleRouteGuard allowedRoles={['OWNER', 'OUTLET_MANAGER']}>
                <div>Laporan Laba Rugi Owner</div>
              </RoleRouteGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Laporan Laba Rugi Owner')).toBeInTheDocument()
  })
})

