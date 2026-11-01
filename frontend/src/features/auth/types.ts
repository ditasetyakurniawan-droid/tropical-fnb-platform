export interface Outlet {
  id: string
  code: string
  slug: string
  name: string
  outlet_type: string
  tax_pb1_percent: number
  service_charge_percent: number
  address?: string
}

export interface UserProfile {
  id: string
  tenant_id: string
  username: string
  full_name: string
  email?: string
  phone?: string
  is_active: boolean
  last_login_at?: string
}

export interface RoleAssignment {
  role_code: string
  role_name: string
  outlet_id?: string
}

export interface AuthTokenResponse {
  access_token: string
  expires_at: string
  user: UserProfile
  roles: RoleAssignment[]
  accessible_outlets: Outlet[]
  is_global_all_outlets: boolean
}

export interface UserProfileResponse {
  user: UserProfile
  roles: RoleAssignment[]
  accessible_outlets: Outlet[]
  is_global_all_outlets: boolean
}

export interface LoginPayload {
  username: string
  password: string
}

export interface VerifyPinPayload {
  outlet_id: string
  pin: string
  action: string
}

export interface VerifyPinResponse {
  valid: boolean
  supervisor_name?: string
}
