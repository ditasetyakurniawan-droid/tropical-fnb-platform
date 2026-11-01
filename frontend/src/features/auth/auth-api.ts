import { api } from '@/shared/api/client'
import type {
  AuthTokenResponse,
  LoginPayload,
  UserProfileResponse,
  VerifyPinPayload,
  VerifyPinResponse,
} from './types'

export async function login(payload: LoginPayload): Promise<AuthTokenResponse> {
  return api.request<AuthTokenResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: payload,
  })
}

export async function fetchMe(): Promise<UserProfileResponse> {
  return api.request<UserProfileResponse>('/api/v1/auth/me', {
    method: 'GET',
  })
}

export async function verifySupervisorPin(payload: VerifyPinPayload): Promise<VerifyPinResponse> {
  return api.request<VerifyPinResponse>('/api/v1/auth/verify-pin', {
    method: 'POST',
    body: payload,
  })
}
