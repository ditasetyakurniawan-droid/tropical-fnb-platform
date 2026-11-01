import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemStatusPage } from './SystemStatusPage'

const INFO = { service: 'tropical-fnb-api', version: '1.2.3', commit: 'abc1234', environment: 'production' }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Routes fetch() calls by URL so each test describes the backend's behaviour. */
function mockBackend(handlers: { info: () => Response | Promise<Response>; status: () => Response | Promise<Response> }) {
  const fn = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/v1/system/info')) return Promise.resolve(handlers.info())
    if (url.endsWith('/api/v1/system/status')) return Promise.resolve(handlers.status())
    return Promise.reject(new Error(`unexpected request: ${url}`))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SystemStatusPage />
    </QueryClientProvider>,
  )
}

describe('SystemStatusPage', () => {
  beforeEach(() => {
    window.__APP_CONFIG__ = { apiBaseUrl: '' }
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows version details and a healthy database', async () => {
    mockBackend({ info: () => json(INFO), status: () => json({ status: 'ready', database: 'up' }) })
    renderPage()

    expect(await screen.findByText('1.2.3')).toBeInTheDocument()
    expect(screen.getByText('abc1234')).toBeInTheDocument()
    expect(screen.getByText('production')).toBeInTheDocument()
    expect(await screen.findByText('Terhubung')).toBeInTheDocument()
    expect(screen.getByText('Siap')).toBeInTheDocument()
  })

  it('shows a disconnected database when the API reports 503', async () => {
    mockBackend({
      info: () => json(INFO),
      status: () => json({ status: 'unavailable', database: 'down' }, 503),
    })
    renderPage()

    expect(await screen.findByText('Terputus')).toBeInTheDocument()
    expect(screen.getByText('Tidak siap')).toBeInTheDocument()
  })

  it('shows an error with the support reference code when the API fails', async () => {
    mockBackend({
      info: () => json({ error: { code: 'internal_error', message: 'terjadi kesalahan pada server', request_id: 'req-42' } }, 500),
      status: () => json({ status: 'ready', database: 'up' }),
    })
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('terjadi kesalahan pada server')
    expect(alert).toHaveTextContent('req-42')
  })

  it('tells the user when the server cannot be reached at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    renderPage()

    const alerts = await screen.findAllByRole('alert')
    expect(alerts[0]).toHaveTextContent('Tidak dapat terhubung ke server')
  })

  it('"Muat ulang" really refetches both endpoints', async () => {
    const fetchMock = mockBackend({ info: () => json(INFO), status: () => json({ status: 'ready', database: 'up' }) })
    renderPage()
    await screen.findByText('1.2.3')
    const callsBefore = fetchMock.mock.calls.length

    await userEvent.click(screen.getByRole('button', { name: /muat ulang/i }))

    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(callsBefore + 2))
  })
})
