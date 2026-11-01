import { api } from '@/shared/api/client'

/** GET /api/v1/system/info */
export interface SystemInfo {
  service: string
  version: string
  commit: string
  environment: string
}

/** GET /api/v1/system/status (HTTP 200 when ready, 503 when a dependency is down). */
export interface SystemStatus {
  status: 'ready' | 'unavailable'
  database: 'up' | 'down'
}

export const systemApi = {
  info: (signal?: AbortSignal) =>
    api.request<SystemInfo>('/api/v1/system/info', signal ? { signal } : {}),

  // 503 carries a meaningful body ("database: down"), so it is not an error here.
  status: (signal?: AbortSignal) =>
    api.request<SystemStatus>('/api/v1/system/status', {
      allowStatus: [503],
      ...(signal ? { signal } : {}),
    }),
}
