import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from './client'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('createApiClient', () => {
  it('prefixes the base URL and returns parsed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    const client = createApiClient({ baseUrl: 'https://api.example.com', fetch: fetchMock })

    await expect(client.request('/api/v1/ping')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/ping',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('sends JSON bodies with the right content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = createApiClient({ baseUrl: '', fetch: fetchMock })

    await client.request('/api/v1/things', { method: 'POST', body: { name: 'Steak' } })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"name":"Steak"}')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('converts the backend error envelope into an ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { error: { code: 'not_found', message: 'menu tidak ditemukan', request_id: 'req-123' } },
        { status: 404 },
      ),
    )
    const client = createApiClient({ baseUrl: '', fetch: fetchMock })

    const err = await client.request('/api/v1/menu/1').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'menu tidak ditemukan',
      requestId: 'req-123',
    })
  })

  it('falls back gracefully when the error body is not JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    const client = createApiClient({ baseUrl: '', fetch: fetchMock })

    await expect(client.request('/x')).rejects.toMatchObject({ status: 502, code: 'http_error' })
  })

  it('maps network failures to a friendly ApiError with status 0', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const client = createApiClient({ baseUrl: '', fetch: fetchMock })

    await expect(client.request('/x')).rejects.toMatchObject({ status: 0, code: 'network_error' })
  })

  it('returns the body of explicitly allowed non-2xx statuses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: 'unavailable', database: 'down' }, { status: 503 }))
    const client = createApiClient({ baseUrl: '', fetch: fetchMock })

    await expect(client.request('/readyz', { allowStatus: [503] })).resolves.toEqual({
      status: 'unavailable',
      database: 'down',
    })
    await expect(client.request('/readyz')).rejects.toMatchObject({ status: 503 })
  })

  it('handles 204 No Content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const client = createApiClient({ baseUrl: '', fetch: fetchMock })

    await expect(client.request('/x', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('attaches Authorization Bearer header when token is present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    const client = createApiClient({
      baseUrl: '',
      fetch: fetchMock,
      getAuthToken: () => 'my-test-token',
    })

    await client.request('/api/v1/auth/me')

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer my-test-token')
  })

  it('attaches X-Outlet-ID header when specific outlet is active, but omits on ALL', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({})))
    const clientSpecific = createApiClient({
      baseUrl: '',
      fetch: fetchMock,
      getActiveOutletId: () => 'outlet-steak-123',
    })

    await clientSpecific.request('/api/v1/orders')
    let init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>)['X-Outlet-ID']).toBe('outlet-steak-123')

    const clientAll = createApiClient({
      baseUrl: '',
      fetch: fetchMock,
      getActiveOutletId: () => 'ALL',
    })

    await clientAll.request('/api/v1/reports')
    init = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect((init.headers as Record<string, string>)['X-Outlet-ID']).toBeUndefined()
  })

  it('requestList normalizes null responses to an empty array', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null))
    const client = createApiClient({ baseUrl: '', fetch: fetchMock })

    const result = await client.requestList('/api/v1/menu/items')
    expect(result).toEqual([])
  })

  it('requestList returns actual array when present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ id: '1', name: 'Steak' }]))
    const client = createApiClient({ baseUrl: '', fetch: fetchMock })

    const result = await client.requestList<{ id: string; name: string }>('/api/v1/menu/items')
    expect(result).toEqual([{ id: '1', name: 'Steak' }])
  })
})
