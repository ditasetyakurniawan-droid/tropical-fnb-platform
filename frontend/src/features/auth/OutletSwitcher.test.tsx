import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { OutletSwitcher } from './OutletSwitcher'
import { useAuthStore } from './auth-store'
import type { AuthTokenResponse } from './types'

const MOCK_GLOBAL_AUTH: AuthTokenResponse = {
  access_token: 'fake-token',
  expires_at: '2026-10-25T12:00:00Z',
  user: {
    id: 'u-1',
    tenant_id: 't-1',
    username: 'owner',
    full_name: 'Budi Santoso',
    is_active: true,
  },
  roles: [{ role_code: 'OWNER', role_name: 'Owner' }],
  accessible_outlets: [
    {
      id: 'outlet-tsh',
      code: 'TSH-01',
      slug: 'tropical-steak-house',
      name: 'Tropical Steak House',
      outlet_type: 'RESTAURANT',
      tax_pb1_percent: 10,
      service_charge_percent: 0,
    },
    {
      id: 'outlet-tgr',
      code: 'TGR-01',
      slug: 'tropical-garden-resto',
      name: 'Tropical Garden Resto',
      outlet_type: 'RESTAURANT',
      tax_pb1_percent: 10,
      service_charge_percent: 0,
    },
  ],
  is_global_all_outlets: true,
}

describe('OutletSwitcher', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.getState().logout()
  })

  it('renders locked branch badge for restricted non-global cashier', () => {
    useAuthStore.getState().setAuth({
      ...MOCK_GLOBAL_AUTH,
      is_global_all_outlets: false,
      accessible_outlets: [MOCK_GLOBAL_AUTH.accessible_outlets[0]!],
    })

    render(<OutletSwitcher />)

    expect(screen.getByText('Tropical Steak House')).toBeInTheDocument()
    expect(screen.getByText('TSH-01')).toBeInTheDocument()
    // Should NOT have a dropdown trigger button
    expect(screen.queryByRole('button', { name: /Pilih cabang restoran aktif/i })).not.toBeInTheDocument()
  })

  it('renders dropdown trigger and options for global owner', () => {
    useAuthStore.getState().setAuth(MOCK_GLOBAL_AUTH)

    render(<OutletSwitcher />)

    const trigger = screen.getByRole('button', { name: /Pilih cabang restoran aktif/i })
    expect(trigger).toBeInTheDocument()
    expect(screen.getByText('Semua Resto (Konsolidasi Group)')).toBeInTheDocument()

    // Open dropdown
    fireEvent.click(trigger)

    expect(screen.getByText('🏢 Semua Resto (Konsolidasi)')).toBeInTheDocument()
    expect(screen.getByText('Tropical Steak House')).toBeInTheDocument()
    expect(screen.getByText('Tropical Garden Resto')).toBeInTheDocument()

    // Switch to Tropical Garden Resto
    fireEvent.click(screen.getByText('Tropical Garden Resto'))

    expect(useAuthStore.getState().activeOutletId).toBe('outlet-tgr')
    expect(screen.getByText('Tropical Garden Resto')).toBeInTheDocument()
  })
})
