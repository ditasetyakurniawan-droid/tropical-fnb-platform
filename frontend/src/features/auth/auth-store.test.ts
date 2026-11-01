import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from './auth-store'
import type { AuthTokenResponse } from './types'

const MOCK_AUTH_RESPONSE: AuthTokenResponse = {
  access_token: 'fake-jwt-token',
  expires_at: '2026-10-25T12:00:00Z',
  user: {
    id: 'user-1',
    tenant_id: 'tenant-1',
    username: 'owner',
    full_name: 'Budi Santoso',
    is_active: true,
  },
  roles: [{ role_code: 'OWNER', role_name: 'Owner' }],
  accessible_outlets: [
    {
      id: 'outlet-steak',
      code: 'TSH-01',
      slug: 'tropical-steak-house',
      name: 'Tropical Steak House',
      outlet_type: 'RESTAURANT',
      tax_pb1_percent: 10,
      service_charge_percent: 0,
    },
    {
      id: 'outlet-garden',
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

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.getState().logout()
  })

  it('starts unauthenticated when localStorage is empty', () => {
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.token).toBeNull()
    expect(state.user).toBeNull()
    expect(state.activeOutletId).toBe('ALL')
  })

  it('setAuth sets user, token, outlets, and defaults activeOutletId to ALL for global user', () => {
    useAuthStore.getState().setAuth(MOCK_AUTH_RESPONSE)

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.token).toBe('fake-jwt-token')
    expect(state.user?.username).toBe('owner')
    expect(state.accessibleOutlets).toHaveLength(2)
    expect(state.activeOutletId).toBe('ALL')
    expect(state.getActiveOutlet()).toBeNull() // ALL means group-wide consolidated
  })

  it('setAuth defaults activeOutletId to specific outlet for non-global user', () => {
    const singleOutletAuth: AuthTokenResponse = {
      ...MOCK_AUTH_RESPONSE,
      is_global_all_outlets: false,
      accessible_outlets: [MOCK_AUTH_RESPONSE.accessible_outlets[0]!],
    }

    useAuthStore.getState().setAuth(singleOutletAuth)

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.activeOutletId).toBe('outlet-steak')
    expect(state.getActiveOutlet()?.name).toBe('Tropical Steak House')
  })

  it('setActiveOutletId switches active outlet when permitted', () => {
    useAuthStore.getState().setAuth(MOCK_AUTH_RESPONSE)

    useAuthStore.getState().setActiveOutletId('outlet-garden')
    expect(useAuthStore.getState().activeOutletId).toBe('outlet-garden')
    expect(useAuthStore.getState().getActiveOutlet()?.code).toBe('TGR-01')

    useAuthStore.getState().setActiveOutletId('ALL')
    expect(useAuthStore.getState().activeOutletId).toBe('ALL')
  })

  it('setActiveOutletId ignores invalid or unauthorized outlet id', () => {
    useAuthStore.getState().setAuth(MOCK_AUTH_RESPONSE)

    useAuthStore.getState().setActiveOutletId('non-existent-outlet')
    expect(useAuthStore.getState().activeOutletId).toBe('ALL')
  })

  it('logout clears state and removes storage', () => {
    useAuthStore.getState().setAuth(MOCK_AUTH_RESPONSE)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)

    useAuthStore.getState().logout()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().token).toBeNull()
    expect(localStorage.getItem('tropical_fnb_auth_session')).toBeNull()
  })
})
