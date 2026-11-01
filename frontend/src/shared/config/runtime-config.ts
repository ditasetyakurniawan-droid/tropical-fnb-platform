/**
 * Runtime configuration.
 *
 * Values are NOT baked in at build time. The container entrypoint (and, for the
 * Capacitor apps, the bundled /config.js) writes `window.__APP_CONFIG__` before
 * the bundle loads, so one image can be configured from Helm `values.yaml`
 * without rebuilding.
 */
export interface AppConfig {
  /**
   * Base URL of the API. Empty string means "same origin" (web behind the
   * Ingress, or the Vite dev proxy). Capacitor builds must use an absolute URL.
   */
  apiBaseUrl: string
}

declare global {
  interface Window {
    __APP_CONFIG__?: { apiBaseUrl?: string }
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

/** Validates the raw injected object and returns a normalised AppConfig. */
export function readAppConfig(raw: Window['__APP_CONFIG__']): AppConfig {
  const value = (raw?.apiBaseUrl ?? '').trim()

  if (value === '') return { apiBaseUrl: '' }

  const isAbsolute = /^https?:\/\/[^\s/]+/i.test(value)
  const isPath = value.startsWith('/') && !value.startsWith('//')
  if (!isAbsolute && !isPath) {
    throw new ConfigError(
      `apiBaseUrl "${value}" tidak valid: gunakan URL http(s) lengkap atau path yang diawali "/".`,
    )
  }
  return { apiBaseUrl: value.replace(/\/+$/, '') }
}

let cached: AppConfig | undefined

/** Lazily reads (and caches) the config from the page. */
export function getAppConfig(): AppConfig {
  cached ??= readAppConfig(window.__APP_CONFIG__)
  return cached
}
