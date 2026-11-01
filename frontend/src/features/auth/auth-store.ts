import { create } from 'zustand'
import type { AuthTokenResponse, Outlet, RoleAssignment, UserProfile } from './types'

const STORAGE_KEY = 'tropical_fnb_auth_session'

export interface AuthState {
  token: string | null
  user: UserProfile | null
  roles: RoleAssignment[]
  accessibleOutlets: Outlet[]
  isGlobalAllOutlets: boolean
  activeOutletId: string // 'ALL' or specific outlet UUID
  isAuthenticated: boolean

  setAuth: (payload: AuthTokenResponse) => void
  setActiveOutletId: (outletId: string) => void
  logout: () => void
  getActiveOutlet: () => Outlet | null
}

function loadInitialState(): Pick<
  AuthState,
  'token' | 'user' | 'roles' | 'accessibleOutlets' | 'isGlobalAllOutlets' | 'activeOutletId' | 'isAuthenticated'
> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        token: null,
        user: null,
        roles: [],
        accessibleOutlets: [],
        isGlobalAllOutlets: false,
        activeOutletId: 'ALL',
        isAuthenticated: false,
      }
    }

    const parsed = JSON.parse(raw) as Partial<AuthTokenResponse> & { activeOutletId?: string }
    if (!parsed.access_token || !parsed.user) {
      return {
        token: null,
        user: null,
        roles: [],
        accessibleOutlets: [],
        isGlobalAllOutlets: false,
        activeOutletId: 'ALL',
        isAuthenticated: false,
      }
    }

    const isGlobal = parsed.is_global_all_outlets ?? false
    const outlets = parsed.accessible_outlets ?? []
    let activeId = parsed.activeOutletId ?? (isGlobal ? 'ALL' : (outlets[0]?.id ?? 'ALL'))

    // Validate activeId exists in accessibleOutlets if not 'ALL'
    if (activeId !== 'ALL' && !outlets.some((o) => o.id === activeId)) {
      activeId = isGlobal ? 'ALL' : (outlets[0]?.id ?? 'ALL')
    }

    return {
      token: parsed.access_token,
      user: parsed.user,
      roles: parsed.roles ?? [],
      accessibleOutlets: outlets,
      isGlobalAllOutlets: isGlobal,
      activeOutletId: activeId,
      isAuthenticated: true,
    }
  } catch {
    return {
      token: null,
      user: null,
      roles: [],
      accessibleOutlets: [],
      isGlobalAllOutlets: false,
      activeOutletId: 'ALL',
      isAuthenticated: false,
    }
  }
}

export const useAuthStore = create<AuthState>((set, get) => {
  const initial = loadInitialState()

  return {
    ...initial,

    setAuth: (payload: AuthTokenResponse) => {
      const isGlobal = payload.is_global_all_outlets
      const activeId = isGlobal ? 'ALL' : (payload.accessible_outlets[0]?.id ?? 'ALL')

      const sessionData = {
        ...payload,
        activeOutletId: activeId,
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData))
      } catch {
        // quota exceeded or private mode
      }

      set({
        token: payload.access_token,
        user: payload.user,
        roles: payload.roles,
        accessibleOutlets: payload.accessible_outlets,
        isGlobalAllOutlets: isGlobal,
        activeOutletId: activeId,
        isAuthenticated: true,
      })
    },

    setActiveOutletId: (outletId: string) => {
      const { accessibleOutlets, isGlobalAllOutlets, token, user, roles } = get()

      // Validate permission
      if (outletId !== 'ALL' && !accessibleOutlets.some((o) => o.id === outletId)) {
        return // not allowed to switch to unassigned outlet
      }
      if (outletId === 'ALL' && !isGlobalAllOutlets) {
        return // only global roles can view consolidated 'ALL'
      }

      const updatedSession = {
        access_token: token,
        user,
        roles,
        accessible_outlets: accessibleOutlets,
        is_global_all_outlets: isGlobalAllOutlets,
        activeOutletId: outletId,
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSession))
      } catch {
        // ignore
      }

      set({ activeOutletId: outletId })
    },

    logout: () => {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // ignore
      }

      set({
        token: null,
        user: null,
        roles: [],
        accessibleOutlets: [],
        isGlobalAllOutlets: false,
        activeOutletId: 'ALL',
        isAuthenticated: false,
      })
    },

    getActiveOutlet: () => {
      const { activeOutletId, accessibleOutlets } = get()
      if (activeOutletId === 'ALL') return null
      return accessibleOutlets.find((o) => o.id === activeOutletId) ?? null
    },
  }
})
