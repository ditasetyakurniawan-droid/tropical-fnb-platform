import { describe, expect, it } from 'vitest'
import { ConfigError, readAppConfig } from './runtime-config'

describe('readAppConfig', () => {
  it('defaults to same-origin when nothing is injected', () => {
    expect(readAppConfig(undefined)).toEqual({ apiBaseUrl: '' })
    expect(readAppConfig({})).toEqual({ apiBaseUrl: '' })
    expect(readAppConfig({ apiBaseUrl: '   ' })).toEqual({ apiBaseUrl: '' })
  })

  it('accepts absolute http(s) URLs and strips trailing slashes', () => {
    expect(readAppConfig({ apiBaseUrl: 'https://api.tropical.example.com/' })).toEqual({
      apiBaseUrl: 'https://api.tropical.example.com',
    })
    expect(readAppConfig({ apiBaseUrl: 'http://10.0.0.5:8080//' })).toEqual({
      apiBaseUrl: 'http://10.0.0.5:8080',
    })
  })

  it('accepts a root-relative path', () => {
    expect(readAppConfig({ apiBaseUrl: '/backend/' })).toEqual({ apiBaseUrl: '/backend' })
  })

  it.each(['api.example.com', 'ftp://example.com', '//evil.example.com', 'javascript:alert(1)'])(
    'rejects invalid value %s',
    (bad) => {
      expect(() => readAppConfig({ apiBaseUrl: bad })).toThrow(ConfigError)
    },
  )
})
