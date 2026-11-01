import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from './LoginPage'
import * as authApi from './auth-api'
import { useAuthStore } from './auth-store'
import { ApiError } from '@/shared/api/client'

vi.mock('./auth-api')

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.getState().logout()
    vi.clearAllMocks()
  })

  it('renders login form elements and demo accounts', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /Tropical F&B Platform/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Username Pegawai/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Kata Sandi/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Masuk Sekarang/i })).toBeInTheDocument()
    expect(screen.getByText(/👑 Owner \/ Direksi/i)).toBeInTheDocument()
  })

  it('displays error message when login API fails', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce(
      new ApiError({
        status: 401,
        code: 'invalid_credentials',
        message: 'Username atau kata sandi salah.',
      }),
    )

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const submitBtn = screen.getByRole('button', { name: /Masuk Sekarang/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Username atau kata sandi salah.')
    })
  })

  it('stores authentication on successful login', async () => {
    vi.mocked(authApi.login).mockResolvedValueOnce({
      access_token: 'valid-jwt-token',
      expires_at: '2026-10-25T12:00:00Z',
      user: {
        id: 'u-1',
        tenant_id: 't-1',
        username: 'owner',
        full_name: 'Budi Santoso',
        is_active: true,
      },
      roles: [{ role_code: 'OWNER', role_name: 'Owner' }],
      accessible_outlets: [],
      is_global_all_outlets: true,
    })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    const submitBtn = screen.getByRole('button', { name: /Masuk Sekarang/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(useAuthStore.getState().token).toBe('valid-jwt-token')
    })
  })
})
