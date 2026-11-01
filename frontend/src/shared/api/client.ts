import { useAuthStore } from '@/features/auth/auth-store'
import { getAppConfig } from '@/shared/config/runtime-config'

/** Error envelope returned by the Go API: {"error":{code,message,request_id}}. */
interface ErrorEnvelope {
  error?: { code?: string; message?: string; request_id?: string }
}

/** Failure of an API call, carrying everything support needs to trace it. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | undefined

  constructor(init: { status: number; code: string; message: string; requestId?: string | undefined }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.requestId = init.requestId
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /**
   * HTTP statuses (besides 2xx) whose JSON body is a valid result rather than
   * an error. Example: the status endpoint answers 503 with a useful body.
   */
  allowStatus?: readonly number[]
}

export interface ApiClientDeps {
  baseUrl: string
  fetch?: typeof fetch
  timeoutMs?: number
  getAuthToken?: () => string | null
  getActiveOutletId?: () => string | null
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>
  requestList<T>(path: string, options?: RequestOptions): Promise<T[]>
}

const DEFAULT_TIMEOUT_MS = 10_000

let lastRequestId: string | null = null

export function getLastRequestId(): string | null {
  return lastRequestId
}

export function setLastRequestId(id: string | null): void {
  lastRequestId = id
}

export function createApiClient(deps: ApiClientDeps): ApiClient {
  const doFetch = deps.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
      const timeout = AbortSignal.timeout(timeoutMs)
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout

      const headers: Record<string, string> = { Accept: 'application/json' }

      const token = deps.getAuthToken?.()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const activeOutletId = deps.getActiveOutletId?.()
      if (activeOutletId && activeOutletId !== 'ALL') {
        headers['X-Outlet-ID'] = activeOutletId
      }

      const init: RequestInit = { method: options.method ?? 'GET', headers, signal }
      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json'
        init.body = JSON.stringify(options.body)
      }

      let res: Response
      try {
        res = await doFetch(`${deps.baseUrl}${path}`, init)
      } catch (cause) {
        if (options.signal?.aborted) throw cause // caller cancelled: not an error to report
        const timedOut = timeout.aborted
        throw new ApiError({
          status: 0,
          code: timedOut ? 'timeout' : 'network_error',
          message: timedOut
            ? 'Server tidak merespons tepat waktu.'
            : 'Tidak dapat terhubung ke server. Periksa koneksi internet.',
        })
      }

      const reqId = res.headers?.get ? res.headers.get('X-Request-ID') : null
      if (reqId) {
        lastRequestId = reqId
      }

      const accepted = res.ok || options.allowStatus?.includes(res.status) === true
      if (!accepted) throw await toApiError(res)

      if (res.status === 204) return undefined as T
      return (await res.json()) as T
    },

    async requestList<T>(path: string, options: RequestOptions = {}): Promise<T[]> {
      const res = await this.request<unknown>(path, options)
      if (Array.isArray(res)) return res as T[]
      if (res && typeof res === 'object' && 'data' in res && Array.isArray((res as { data: unknown }).data)) {
        return (res as { data: T[] }).data
      }
      return []
    },
  }
}


async function toApiError(res: Response): Promise<ApiError> {
  let envelope: ErrorEnvelope = {}
  try {
    envelope = (await res.json()) as ErrorEnvelope
  } catch {
    // Body was not JSON (e.g. a proxy error page); fall back to generic values.
  }
  return new ApiError({
    status: res.status,
    code: envelope.error?.code ?? 'http_error',
    message: envelope.error?.message ?? `Permintaan gagal (HTTP ${res.status}).`,
    requestId: envelope.error?.request_id ?? res.headers.get('X-Request-ID') ?? undefined,
  })
}

function defaultClient(): ApiClient {
  return createApiClient({
    baseUrl: getAppConfig().apiBaseUrl,
    getAuthToken: () => useAuthStore.getState().token,
    getActiveOutletId: () => useAuthStore.getState().activeOutletId,
  })
}

/** Application-wide client bound to the runtime configuration and auth store. */
export const api: ApiClient = {
  request: (path, options) => defaultClient().request(path, options),
  requestList: (path, options) => defaultClient().requestList(path, options),
}

